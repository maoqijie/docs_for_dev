#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use std::sync::Mutex;

use codex_chat_lib::{
    api::CodexClient, commands, db::DbManager, prompt_templates::PromptTemplateManager,
};

fn main() {
    let data_dir = dirs::data_dir()
        .expect("无法获取数据目录")
        .join("codex-chat");

    std::fs::create_dir_all(&data_dir).expect("无法创建数据目录");

    let db_path = data_dir.join("database.db");
    let db_path_str = db_path.to_str().expect("数据库路径包含非 UTF-8 字符");

    let db_manager = Arc::new(DbManager::new(db_path_str).expect("数据库初始化失败"));

    let api_key = load_api_key();
    // 默认模型改为与 ~/.codex/config.toml 一致的自定义中转模型，避免落回官方 gpt-4 导致 ChatGPT key 400
    let api_endpoint = std::env::var("CODEX_API_ENDPOINT")
        .unwrap_or_else(|_| "https://api.openai.com/v1/chat/completions".to_string());
    let model = std::env::var("CODEX_MODEL").unwrap_or_else(|_| "gpt-5.1-codex-max".to_string());

    let codex_client = Arc::new(CodexClient::new(
        api_key.unwrap_or_default(),
        api_endpoint,
        model,
    ));

    // 初始化提示词模板管理器
    let templates_dir = data_dir.join("prompts");
    let template_manager = Arc::new(Mutex::new(
        PromptTemplateManager::new(templates_dir).expect("模板管理器初始化失败"),
    ));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(db_manager)
        .manage(codex_client)
        .manage(template_manager)
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::get_sessions,
            commands::get_messages,
            commands::send_message,
            commands::delete_session,
            commands::update_session_title,
            commands::get_session_state,
            commands::set_session_state,
            commands::list_templates,
            commands::get_template,
            commands::render_template,
            commands::update_template,
            commands::create_template,
            commands::delete_template,
            commands::get_template_path,
            commands::pick_workdir,
            commands::pick_documents,
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
