use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::{Child, Command},
    task::JoinHandle,
    time::{timeout, Instant},
};

/// 简单日志函数，便于在 tauri 日志中看到关键步骤
fn log_info(msg: &str) {
    println!("[codex-client] {}", msg);
}

fn is_cancelled(cancel_flag: &Option<Arc<AtomicBool>>) -> bool {
    cancel_flag
        .as_ref()
        .map(|flag| flag.load(Ordering::SeqCst))
        .unwrap_or(false)
}

async fn collect_stderr_output(stderr_handle: &mut Option<JoinHandle<String>>) -> String {
    match stderr_handle.take() {
        Some(handle) => match timeout(Duration::from_secs(2), handle).await {
            Ok(joined) => joined.unwrap_or_default(),
            Err(_) => String::new(),
        },
        None => String::new(),
    }
}

async fn terminate_process_tree(child: &mut Child) {
    let pid = child.id().map(|id| id as i32);

    #[cfg(unix)]
    if let Some(pid) = pid {
        let group = format!("-{}", pid);
        let _ = Command::new("kill").arg("-TERM").arg(&group).status().await;
    }

    let _ = child.start_kill();
    let _ = timeout(Duration::from_secs(5), child.wait()).await;

    #[cfg(unix)]
    if let Some(pid) = pid {
        let group = format!("-{}", pid);
        let _ = Command::new("kill").arg("-KILL").arg(&group).status().await;
    }
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
        working_dir: Option<String>,
        cancel_flag: Option<Arc<AtomicBool>>,
        mut on_chunk: F,
    ) -> Result<String>
    where
        F: FnMut(String),
    {
        let prompt = build_prompt(messages);

        log_info(&format!(
            "准备调用 codex，model={}，working_dir={:?}，prompt-preview={}",
            model_override.clone().unwrap_or_else(|| self.model.clone()),
            working_dir,
            prompt.chars().take(80).collect::<String>()
        ));

        if let Ok(path) = std::env::var("PATH") {
            log_info(&format!("PATH={}", path));
        }

        #[cfg(windows)]
        let mut command = {
            log_info("Using codex.cmd via cmd.exe from system PATH");
            let mut cmd = Command::new("cmd");
            cmd.arg("/C").arg("codex.cmd");
            cmd
        };

        #[cfg(not(windows))]
        let mut command = {
            log_info("Using codex binary from system PATH");
            Command::new("codex")
        };

        command
            .arg("exec")
            .arg("--json")
            .arg("-m")
            .arg(model_override.unwrap_or_else(|| self.model.clone()))
            .arg("--dangerously-bypass-approvals-and-sandbox")
            .arg("--skip-git-repo-check");

        // 发生错误路径提前返回时，自动尝试终止子进程
        command.kill_on_drop(true);

        // 添加工作目录参数
        if let Some(ref dir) = working_dir {
            // 展开 ~ 为用户主目录
            let expanded_dir = if dir.starts_with("~/") {
                if let Ok(home) = std::env::var("HOME") {
                    dir.replace("~/", &format!("{}/", home))
                } else {
                    dir.clone()
                }
            } else {
                dir.clone()
            };
            log_info(&format!("设置工作目录: {}", expanded_dir));
            command.arg("-C").arg(&expanded_dir);
        }

        #[cfg(unix)]
        {
            // 为子进程建立独立进程组，便于取消时连同 MCP 子进程一起回收
            command.process_group(0);
        }

        command
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
        let mut stderr_handle = child.stderr.take().map(|stderr| {
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

        let stdout = match child.stdout.take() {
            Some(out) => out,
            None => {
                terminate_process_tree(&mut child).await;
                let stderr_output = collect_stderr_output(&mut stderr_handle).await;
                let detail = if stderr_output.trim().is_empty() {
                    "无法获取 codex stdout".to_string()
                } else {
                    format!("无法获取 codex stdout | {}", stderr_output.trim())
                };
                return Err(anyhow!(detail));
            }
        };

        let mut reader = BufReader::new(stdout).lines();
        let mut full_content = String::new();
        let timeout_secs = std::env::var("CODEX_EXEC_TIMEOUT_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .filter(|v| *v > 0)
            .unwrap_or(900);
        let deadline = Instant::now() + Duration::from_secs(timeout_secs);
        let poll_interval = Duration::from_millis(250);

        loop {
            if is_cancelled(&cancel_flag) {
                terminate_process_tree(&mut child).await;
                let stderr_output = collect_stderr_output(&mut stderr_handle).await;
                let detail = if stderr_output.trim().is_empty() {
                    "请求已取消".to_string()
                } else {
                    format!("请求已取消 | {}", stderr_output.trim())
                };
                return Err(anyhow!(detail));
            }
            if Instant::now() >= deadline {
                terminate_process_tree(&mut child).await;
                let stderr_output = collect_stderr_output(&mut stderr_handle).await;
                let detail = if stderr_output.trim().is_empty() {
                    format!("codex 执行超时（>{} 秒）", timeout_secs)
                } else {
                    format!("codex 执行超时（>{} 秒） | {}", timeout_secs, stderr_output.trim())
                };
                return Err(anyhow!(detail));
            }

            let next = match timeout(poll_interval, reader.next_line()).await {
                Ok(result) => result,
                Err(_) => continue,
            };
            let line = match next {
                Ok(Some(line)) => line,
                Ok(None) => break,
                Err(e) => {
                    terminate_process_tree(&mut child).await;
                    let stderr_output = collect_stderr_output(&mut stderr_handle).await;
                    let detail = if stderr_output.trim().is_empty() {
                        format!("读取 codex 输出失败: {}", e)
                    } else {
                        format!("读取 codex 输出失败: {} | {}", e, stderr_output.trim())
                    };
                    return Err(anyhow!(detail));
                }
            };

            // 去掉空行
            let mut raw = line.trim().to_string();
            if raw.is_empty() {
                continue;
            }

            // codex cli 有时会以 `assistant: {json...}` 前缀输出，先剥离前缀
            if let Some(stripped) = raw.strip_prefix("assistant:") {
                raw = stripped.trim_start().to_string();
                if raw.is_empty() {
                    continue;
                }
            }

            // 尝试解析 codex --json 的事件格式，只取 assistant 的文本内容
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) {
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

            // 解析失败则跳过，避免把控制事件写入正文
            continue;
        }

        let status = match timeout(Duration::from_secs(15), child.wait()).await {
            Ok(Ok(status)) => status,
            Ok(Err(e)) => {
                let stderr_output = collect_stderr_output(&mut stderr_handle).await;
                let detail = if stderr_output.trim().is_empty() {
                    format!("等待 codex 退出失败: {}", e)
                } else {
                    format!("等待 codex 退出失败: {} | {}", e, stderr_output.trim())
                };
                return Err(anyhow!(detail));
            }
            Err(_) => {
                terminate_process_tree(&mut child).await;
                let stderr_output = collect_stderr_output(&mut stderr_handle).await;
                let detail = if stderr_output.trim().is_empty() {
                    "等待 codex 退出超时".to_string()
                } else {
                    format!("等待 codex 退出超时 | {}", stderr_output.trim())
                };
                return Err(anyhow!(detail));
            }
        };
        let stderr_output = collect_stderr_output(&mut stderr_handle).await;

        if is_cancelled(&cancel_flag) {
            return Err(anyhow!("请求已取消"));
        }

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
            .chat_stream(messages, None, None, None, None, |chunk| {
                buffer.push_str(&chunk)
            })
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
