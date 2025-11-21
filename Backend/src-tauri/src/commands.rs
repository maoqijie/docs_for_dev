use std::sync::Arc;
use std::collections::HashMap;
use std::sync::Mutex;
use std::path::{Path, PathBuf};

use tauri::{Emitter, State, Window, Manager};
use tauri_plugin_dialog::DialogExt;
use serde::Serialize;

use crate::{
    api::{ChatMessage, CodexClient},
    db::{DbManager, Message, Session},
    prompt_templates::{PromptTemplate, PromptTemplateManager},
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
    println!("[commands] get_messages session_id={}", session_id);
    let result = db
        .get_session_messages(&session_id)
        .map_err(|e| format!("获取消息失败: {}", e));

    if let Ok(ref msgs) = result {
        println!("[commands] get_messages -> {} 条", msgs.len());
    }
    result
}

#[tauri::command]
pub async fn send_message(
    window: Window,
    db: State<'_, Arc<DbManager>>,
    client: State<'_, Arc<CodexClient>>,
    session_id: String,
    content: String,
    model: Option<String>,
    thinking_depth: Option<String>,
    working_dir: Option<String>,
) -> Result<(), String> {
    println!(
        "[commands] send_message session_id={} content_preview={} working_dir={:?}",
        session_id,
        content.chars().take(80).collect::<String>(),
        working_dir
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
        .chat_stream(chat_messages, model, thinking_depth, working_dir, move |chunk| {
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

// 模板管理命令

#[tauri::command]
pub async fn list_templates(
    template_manager: State<'_, Arc<Mutex<PromptTemplateManager>>>,
) -> Result<Vec<PromptTemplate>, String> {
    let manager = template_manager.lock().map_err(|e| format!("锁定模板管理器失败: {}", e))?;
    Ok(manager.list_templates())
}

#[tauri::command]
pub async fn get_template(
    template_manager: State<'_, Arc<Mutex<PromptTemplateManager>>>,
    name: String,
) -> Result<PromptTemplate, String> {
    let manager = template_manager.lock().map_err(|e| format!("锁定模板管理器失败: {}", e))?;
    manager.get_template(&name)
        .cloned()
        .ok_or_else(|| format!("模板不存在: {}", name))
}

#[tauri::command]
pub async fn render_template(
    template_manager: State<'_, Arc<Mutex<PromptTemplateManager>>>,
    name: String,
    variables: HashMap<String, String>,
) -> Result<String, String> {
    let manager = template_manager.lock().map_err(|e| format!("锁定模板管理器失败: {}", e))?;
    manager.render(&name, &variables)
        .map_err(|e| format!("渲染模板失败: {}", e))
}

#[tauri::command]
pub async fn update_template(
    template_manager: State<'_, Arc<Mutex<PromptTemplateManager>>>,
    name: String,
    content: String,
) -> Result<(), String> {
    let mut manager = template_manager.lock().map_err(|e| format!("锁定模板管理器失败: {}", e))?;
    manager.update_template(&name, content)
        .map_err(|e| format!("更新模板失败: {}", e))
}

#[tauri::command]
pub async fn create_template(
    template_manager: State<'_, Arc<Mutex<PromptTemplateManager>>>,
    name: String,
    content: String,
    description: String,
) -> Result<(), String> {
    let mut manager = template_manager.lock().map_err(|e| format!("锁定模板管理器失败: {}", e))?;
    manager.create_template(&name, content, description)
        .map_err(|e| format!("创建模板失败: {}", e))
}

#[tauri::command]
pub async fn delete_template(
    template_manager: State<'_, Arc<Mutex<PromptTemplateManager>>>,
    name: String,
) -> Result<(), String> {
    let mut manager = template_manager.lock().map_err(|e| format!("锁定模板管理器失败: {}", e))?;
    manager.delete_template(&name)
        .map_err(|e| format!("删除模板失败: {}", e))
}

#[tauri::command]
pub async fn get_template_path(
    template_manager: State<'_, Arc<Mutex<PromptTemplateManager>>>,
    name: String,
) -> Result<String, String> {
    let manager = template_manager.lock().map_err(|e| format!("锁定模板管理器失败: {}", e))?;
    let path = manager.get_template_path(&name);
    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "模板路径包含非 UTF-8 字符".to_string())
}

#[tauri::command]
pub async fn pick_workdir(window: Window) -> Result<Option<String>, String> {
    let dialog = window.app_handle().dialog();
    let result = dialog
        .file()
        .set_title("选择工作目录")
        .blocking_pick_folder();

    if let Some(folder) = result {
        match folder.into_path() {
            Ok(p) => Ok(Some(p.to_string_lossy().to_string())),
            Err(e) => Err(format!("解析工作目录失败: {}", e)),
        }
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn get_session_state(
    db: State<'_, Arc<DbManager>>,
    session_id: String,
) -> Result<Option<String>, String> {
    db.get_session_state(&session_id)
        .map_err(|e| format!("获取会话状态失败: {}", e))
}

#[tauri::command]
pub async fn set_session_state(
    db: State<'_, Arc<DbManager>>,
    session_id: String,
    state: String,
) -> Result<(), String> {
    db.upsert_session_state(&session_id, &state)
        .map_err(|e| format!("保存会话状态失败: {}", e))
}

#[derive(Serialize)]
pub struct PickedDocument {
    path: String,
    name: String,
    size: u64,
    relative_path: String,
}

fn collect_files(root: &Path, recursive: bool) -> Vec<PathBuf> {
    let mut result = Vec::new();
    let mut stack = vec![root.to_path_buf()];

    while let Some(path) = stack.pop() {
        if path.is_dir() {
            if recursive {
                if let Ok(read_dir) = std::fs::read_dir(&path) {
                    for entry in read_dir.flatten() {
                        stack.push(entry.path());
                    }
                }
            }
        } else if path.is_file() {
            result.push(path);
        }
    }

    result
}

fn common_root(paths: &[PathBuf]) -> Option<PathBuf> {
    if paths.is_empty() {
        return None;
    }
    let mut iter = paths.iter();
    let first = iter.next()?.clone();
    let mut prefix_components: Vec<_> = first.parent().unwrap_or_else(|| Path::new("")).components().collect();

    for path in iter {
        let mut new_prefix = Vec::new();
        for (a, b) in prefix_components.iter().zip(path.parent().unwrap_or_else(|| Path::new("")).components()) {
            if a == &b {
                new_prefix.push(a.clone());
            } else {
                break;
            }
        }
        prefix_components = new_prefix;
        if prefix_components.is_empty() {
            break;
        }
    }

    if prefix_components.is_empty() {
        None
    } else {
        let mut root = PathBuf::new();
        for comp in prefix_components {
            root.push(comp.as_os_str());
        }
        Some(root)
    }
}

fn is_allowed_ext(path: &Path) -> bool {
    match path.extension().and_then(|e| e.to_str()).map(|s| s.to_ascii_lowercase()) {
        Some(ext) => matches!(ext.as_str(), "md" | "markdown" | "mdx" | "txt" | "log" | "json"),
        None => false,
    }
}

#[tauri::command]
pub async fn pick_documents(window: Window, recursive: Option<bool>) -> Result<Vec<PickedDocument>, String> {
    let recursive = recursive.unwrap_or(true);

    let dialog = window.app_handle().dialog();

    let mut paths: Vec<PathBuf> = Vec::new();
    let mut root_hint: Option<PathBuf> = None;

    // 优先选择文件（可多选）
    if let Some(files) = dialog
        .file()
        .set_title("选择文档")
        .blocking_pick_files()
    {
        let mut converted = Vec::new();
        for f in files {
            if let Ok(p) = f.into_path() {
                root_hint = root_hint.or_else(|| p.parent().map(|pp| pp.to_path_buf()));
                converted.push(p);
            }
        }
        paths = converted;
    }

    // 如果没有选文件，则尝试选择文件夹
    if paths.is_empty() {
        if let Some(folder) = dialog
            .file()
            .set_title("选择文档文件夹")
            .blocking_pick_folder()
        {
            if let Ok(folder_path) = folder.into_path() {
                root_hint = Some(folder_path.clone());
                paths = collect_files(&folder_path, recursive);
            }
        }
    }

    if paths.is_empty() {
        return Ok(vec![]);
    }

    let filtered: Vec<PathBuf> = paths
        .into_iter()
        .filter(|p| is_allowed_ext(p))
        .collect();

    if filtered.is_empty() {
        return Ok(vec![]);
    }

    let root = common_root(&filtered).or(root_hint).unwrap_or_else(|| PathBuf::from("."));

    let mut result = Vec::new();
    for path in filtered {
        if let Ok(meta) = std::fs::metadata(&path) {
            let rel = path.strip_prefix(&root).unwrap_or(&path);
            let item = PickedDocument {
                name: path.file_name().and_then(|s| s.to_str()).unwrap_or_default().to_string(),
                path: path.to_string_lossy().to_string(),
                size: meta.len(),
                relative_path: rel.to_string_lossy().to_string(),
            };
            result.push(item);
        }
    }

    Ok(result)
}
