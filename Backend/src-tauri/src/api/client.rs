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
        mut on_chunk: F,
    ) -> Result<String>
    where
        F: FnMut(String),
    {
        let prompt = build_prompt(messages);

        log_info(&format!(
            "准备调用 codex，model={}，prompt-preview={}",
            self.model,
            prompt.chars().take(80).collect::<String>()
        ));

        if let Ok(path) = std::env::var("PATH") {
            log_info(&format!("PATH={}", path));
        }

        let mut command = Command::new("codex");
        // 注意：`--ask-for-approval` 是全局参数，必须放在 `exec` 之前，否则 CLI 会直接退出
        command
            .arg("--ask-for-approval")
            .arg("never")
            .arg("exec")
            .arg("--json")
            .arg("--model")
            .arg(self.model.clone())
            .arg("--sandbox")
            .arg("workspace-write")
            .arg("--skip-git-repo-check")
            .arg(prompt)
            .stderr(Stdio::piped())
            .stdout(Stdio::piped());

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

            // 尝试解析 codex --json 的事件格式，若失败则直接把行作为文本 chunk
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(content) = value.get("content").and_then(|v| v.as_str()) {
                    full_content.push_str(content);
                    on_chunk(content.to_string());
                    continue;
                }
            }

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
            .chat_stream(messages, |chunk| buffer.push_str(&chunk))
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
