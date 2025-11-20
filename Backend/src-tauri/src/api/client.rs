use std::process::Stdio;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
};

/// 简单日志函数，便于在 tauri 日志中看到关键步骤
fn log_info(msg: &str) {
    println!("[codex-client] {}", msg);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

pub struct CodexClient {
    model: String,
}

impl CodexClient {
    pub fn new(_api_key: String, _api_endpoint: String, model: String) -> Self {
        Self { model }
    }

    pub async fn chat_stream<F>(
        &self,
        messages: Vec<ChatMessage>,
        model_override: Option<String>,
        thinking_depth: Option<String>,
        mut on_chunk: F,
    ) -> Result<String>
    where
        F: FnMut(String),
    {
        let prompt = build_prompt(messages);

        log_info(&format!(
            "准备调用 codex，model={}，prompt-preview={}",
            model_override.clone().unwrap_or_else(|| self.model.clone()),
            prompt.chars().take(80).collect::<String>()
        ));

        if let Ok(path) = std::env::var("PATH") {
            log_info(&format!("PATH={}", path));
        }

        let mut command = Command::new("codex");
        command
            .arg("exec")
            .arg("--json")
            .arg("--model")
            .arg(model_override.unwrap_or_else(|| self.model.clone()))
            .arg("--sandbox")
            .arg("workspace-write")
            .arg("--skip-git-repo-check")
            .arg(prompt)
            .stderr(Stdio::piped())
            .stdout(Stdio::piped());

        if let Some(depth) = thinking_depth {
            command
                .arg("-c")
                .arg(format!("model_reasoning_effort=\"{}\"", depth));
        }

        let mut child = command
            .spawn()
            .map_err(|e| anyhow!(format!("启动 codex 进程失败: {}", e)))?;

        // 异步收集 stderr，便于失败时输出详细错误
        let stderr_handle = child.stderr.take().map(|stderr| {
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr);
                let mut buf = String::new();
                let mut output = String::new();

                while reader.read_line(&mut buf).await.unwrap_or(0) > 0 {
                    output.push_str(&buf);
                    buf.clear();
                }

                output
            })
        });

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow!("无法获取 codex stdout"))?;

        let mut reader = BufReader::new(stdout).lines();
        let mut full_content = String::new();

        while let Some(line) = reader.next_line().await? {
            if line.trim().is_empty() {
                continue;
            }

            // 尝试解析 codex --json 的事件格式，只取 assistant 的文本内容
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                // 普通 content 字段
                if let Some(content) = value.get("content").and_then(|v| v.as_str()) {
                    full_content.push_str(content);
                    on_chunk(content.to_string());
                    continue;
                }

                // item.completed 且类型为 agent_message 时取 text
                if value
                    .get("type")
                    .and_then(|t| t.as_str())
                    .map(|t| t == "item.completed")
                    .unwrap_or(false)
                {
                    if let Some(item) = value.get("item") {
                        let is_agent = item
                            .get("type")
                            .and_then(|t| t.as_str())
                            .map(|t| t == "agent_message")
                            .unwrap_or(false);
                        if is_agent {
                            if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                full_content.push_str(text);
                                on_chunk(text.to_string());
                                continue;
                            }
                        }
                    }
                }

                // 其他事件不计入正文，直接跳过
                continue;
            }

            // 非 JSON 直接追加
            full_content.push_str(&line);
            on_chunk(line);
        }

        let status = child.wait().await?;
        let stderr_output = if let Some(handle) = stderr_handle {
            handle.await.unwrap_or_default()
        } else {
            String::new()
        };

        if !status.success() {
            let detail = if stderr_output.trim().is_empty() {
                format!("codex cli 退出失败: {}", status)
            } else {
                format!("codex cli 退出失败: {} | {}", status, stderr_output.trim())
            };
            log_info(&detail);
            return Err(anyhow!(detail));
        }

        Ok(full_content)
    }

    pub async fn chat(&self, messages: Vec<ChatMessage>) -> Result<String> {
        let mut buffer = String::new();
        let _ = self
            .chat_stream(messages, None, None, |chunk| buffer.push_str(&chunk))
            .await?;
        Ok(buffer)
    }
}

fn build_prompt(messages: Vec<ChatMessage>) -> String {
    messages
        .into_iter()
        .map(|m| format!("{}: {}", m.role, m.content))
        .collect::<Vec<_>>()
        .join("\n")
}
