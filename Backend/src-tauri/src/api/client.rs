use anyhow::Result;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct StreamResponse {
    choices: Vec<StreamChoice>,
}

#[derive(Debug, Deserialize)]
struct StreamChoice {
    delta: Delta,
}

#[derive(Debug, Deserialize)]
struct Delta {
    content: Option<String>,
}

pub struct CodexClient {
    client: Client,
    api_key: String,
    api_endpoint: String,
    model: String,
}

impl CodexClient {
    pub fn new(api_key: String, api_endpoint: String, model: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            api_endpoint,
            model,
        }
    }

    pub async fn chat_stream<F>(&self, messages: Vec<ChatMessage>, mut on_chunk: F) -> Result<String>
    where
        F: FnMut(String),
    {
        let request = ChatRequest {
            model: self.model.clone(),
            messages,
            stream: true,
        };

        let response = self
            .client
            .post(&self.api_endpoint)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        let mut stream = response.bytes_stream();
        let mut full_content = String::new();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            let text = String::from_utf8_lossy(&chunk);

            for line in text.lines() {
                if !line.starts_with("data: ") {
                    continue;
                }

                let data = line.trim_start_matches("data: ").trim();

                if data == "[DONE]" {
                    break;
                }

                if let Ok(parsed) = serde_json::from_str::<StreamResponse>(data) {
                    if let Some(content) = parsed
                        .choices
                        .get(0)
                        .and_then(|c| c.delta.content.as_ref())
                    {
                        full_content.push_str(content);
                        on_chunk(content.clone());
                    }
                }
            }
        }

        Ok(full_content)
    }

    pub async fn chat(&self, messages: Vec<ChatMessage>) -> Result<String> {
        let request = ChatRequest {
            model: self.model.clone(),
            messages,
            stream: false,
        };

        let response = self
            .client
            .post(&self.api_endpoint)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?
            .json::<ChatResponse>()
            .await?;

        Ok(response
            .choices
            .get(0)
            .map(|c| c.message.content.clone())
            .unwrap_or_default())
    }
}
