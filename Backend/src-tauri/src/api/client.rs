use std::process::Stdio;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
};

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

        let mut command = Command::new("codex");
        command
            .arg("exec")
            .arg("--json")
            .arg("--model")
            .arg(self.model.clone())
            .arg("--ask-for-approval")
            .arg("never")
            .arg("--sandbox")
            .arg("workspace-write")
            .arg("--skip-git-repo-check")
            .arg(prompt)
            .stderr(Stdio::null())
            .stdout(Stdio::piped());

        let mut child = command.spawn().map_err(|e| anyhow!(e))?;
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
        if !status.success() {
            return Err(anyhow!("codex cli 退出失败: {}", status));
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
