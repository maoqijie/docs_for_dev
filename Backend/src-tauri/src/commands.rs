use std::sync::Arc;

use tauri::{Emitter, State, Window};

use crate::{
    api::{ChatMessage, CodexClient},
    db::{DbManager, Message, Session},
};

#[tauri::command]
pub async fn create_session(
    db: State<'_, Arc<DbManager>>,
    title: String,
) -> Result<Session, String> {
    db.create_session(&title)
        .map_err(|e| format!("创建会话失败: {}", e))
}

#[tauri::command]
pub async fn get_sessions(db: State<'_, Arc<DbManager>>) -> Result<Vec<Session>, String> {
    db.get_all_sessions()
        .map_err(|e| format!("获取会话列表失败: {}", e))
}

#[tauri::command]
pub async fn get_messages(
    db: State<'_, Arc<DbManager>>,
    session_id: String,
) -> Result<Vec<Message>, String> {
    db.get_session_messages(&session_id)
        .map_err(|e| format!("获取消息失败: {}", e))
}

#[tauri::command]
pub async fn send_message(
    window: Window,
    db: State<'_, Arc<DbManager>>,
    client: State<'_, Arc<CodexClient>>,
    session_id: String,
    content: String,
) -> Result<(), String> {
    println!(
        "[commands] send_message session_id={} content_preview={}",
        session_id,
        content.chars().take(80).collect::<String>()
    );

    db.add_message(&session_id, "user", &content)
        .map_err(|e| format!("保存用户消息失败: {}", e))?;

    let messages = db
        .get_session_messages(&session_id)
        .map_err(|e| format!("获取历史消息失败: {}", e))?;

    let chat_messages: Vec<ChatMessage> = messages
        .iter()
        .map(|m| ChatMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    let window_clone = window.clone();
    let response = client
        .chat_stream(chat_messages, move |chunk| {
            let _ = window_clone.emit("message-chunk", chunk);
        })
        .await
        .map_err(|e| {
            println!("[commands] codex 调用失败: {}", e);
            format!("API 调用失败: {}", e)
        })?;

    db.add_message(&session_id, "assistant", &response)
        .map_err(|e| format!("保存 AI 回复失败: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn delete_session(
    db: State<'_, Arc<DbManager>>,
    session_id: String,
) -> Result<(), String> {
    db.delete_session(&session_id)
        .map_err(|e| format!("删除会话失败: {}", e))
}

#[tauri::command]
pub async fn update_session_title(
    db: State<'_, Arc<DbManager>>,
    session_id: String,
    title: String,
) -> Result<(), String> {
    db.update_session_title(&session_id, &title)
        .map_err(|e| format!("更新会话标题失败: {}", e))
}
