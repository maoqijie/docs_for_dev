#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;

use codex_chat_lib::{api::CodexClient, commands, db::DbManager};

fn main() {
    let data_dir = dirs::data_dir()
        .expect("无法获取数据目录")
        .join("codex-chat");

    std::fs::create_dir_all(&data_dir).expect("无法创建数据目录");

    let db_path = data_dir.join("database.db");
    let db_path_str = db_path
        .to_str()
        .expect("数据库路径包含非 UTF-8 字符");

    let db_manager = Arc::new(
        DbManager::new(db_path_str).expect("数据库初始化失败"),
    );

    let api_key = load_api_key()
        .expect("请在环境变量 CODEX_API_KEY 或 ~/.codex/auth.json 中提供 OPENAI_API_KEY");
    let api_endpoint = std::env::var("CODEX_API_ENDPOINT")
        .unwrap_or_else(|_| "https://api.openai.com/v1/chat/completions".to_string());
    let model = std::env::var("CODEX_MODEL")
        .unwrap_or_else(|_| "gpt-4".to_string());

    let codex_client = Arc::new(CodexClient::new(api_key, api_endpoint, model));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(db_manager)
        .manage(codex_client)
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::get_sessions,
            commands::get_messages,
            commands::send_message,
            commands::delete_session,
            commands::update_session_title,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}

fn load_api_key() -> Option<String> {
    if let Ok(key) = std::env::var("CODEX_API_KEY") {
        if !key.is_empty() {
            return Some(key);
        }
    }

    let auth_path = dirs::home_dir()?.join(".codex/auth.json");
    let content = std::fs::read_to_string(auth_path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&content).ok()?;

    value
        .get("OPENAI_API_KEY")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}
