use std::fs;
use std::path::{Path, PathBuf};
use walkdir::{DirEntry, WalkDir};

/// 尝试解析 codex 可执行文件的绝对路径
/// 策略：
/// 1. 检查缓存文件 (app_data_dir/codex_path)
/// 2. 检查系统 PATH
/// 3. 检查常见安装路径
/// 4. 递归搜索 HOME 目录 (跳过特定目录)
pub fn resolve_codex_path() -> Option<String> {
    let data_dir = dirs::data_dir()?.join("codex-chat");
    let _ = fs::create_dir_all(&data_dir);
    let cache_file = data_dir.join("codex_path");

    // 1. 检查缓存
    if let Ok(path_str) = fs::read_to_string(&cache_file) {
        let path = PathBuf::from(path_str.trim());
        if path.exists() && is_executable(&path) {
            println!("[path_resolver] Found codex in cache: {:?}", path);
            return Some(path.to_string_lossy().to_string());
        }
    }

    // 2. 检查系统 PATH (简单检查，依赖 which/where 命令或直接尝试执行)
    // 这里我们假设如果 PATH 里有，直接返回 "codex" 字符串即可，让 Command 去找
    // 但为了统一，我们尽量找绝对路径。
    if let Ok(path) = which::which("codex") {
        let p = path.to_string_lossy().to_string();
        println!("[path_resolver] Found codex in PATH: {}", p);
        let _ = fs::write(&cache_file, &p);
        return Some(p);
    }

    // 3. 检查常见路径
    let home = dirs::home_dir()?;
    let common_paths = get_common_paths(&home);
    for p in common_paths {
        if p.exists() && is_executable(&p) {
            let s = p.to_string_lossy().to_string();
            println!("[path_resolver] Found codex in common path: {}", s);
            let _ = fs::write(&cache_file, &s);
            return Some(s);
        }
    }

    // 4. 递归搜索 HOME
    println!("[path_resolver] Starting recursive search in HOME...");
    if let Some(p) = search_in_dir(&home) {
        let s = p.to_string_lossy().to_string();
        println!("[path_resolver] Found codex via recursive search: {}", s);
        let _ = fs::write(&cache_file, &s);
        return Some(s);
    }

    None
}

fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(path) {
            return meta.permissions().mode() & 0o111 != 0;
        }
    }
    #[cfg(windows)]
    {
        // Windows 简单检查扩展名
        if let Some(ext) = path.extension() {
            let s = ext.to_string_lossy().to_ascii_lowercase();
            return s == "exe" || s == "cmd" || s == "bat";
        }
    }
    path.exists()
}

pub fn get_common_directories() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = dirs::home_dir() {
        #[cfg(unix)]
        {
            dirs.push(home.join(".local/bin"));
            dirs.push(home.join(".cargo/bin"));
            dirs.push(home.join(".bun/bin"));
            dirs.push(PathBuf::from("/usr/local/bin"));
            dirs.push(PathBuf::from("/usr/bin"));
            dirs.push(PathBuf::from("/bin"));
            dirs.push(PathBuf::from("/opt/homebrew/bin"));
        }

        #[cfg(windows)]
        {
            dirs.push(home.join(".cargo\\bin"));
            dirs.push(home.join(".bun\\bin"));
            dirs.push(home.join("AppData\\Roaming\\npm"));
        }
    }
    dirs
}

fn get_common_paths(home: &Path) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    
    #[cfg(unix)]
    {
        paths.push(home.join(".local/bin/codex"));
        paths.push(home.join(".cargo/bin/codex"));
        paths.push(home.join(".bun/bin/codex"));
        paths.push(PathBuf::from("/usr/local/bin/codex"));
        paths.push(PathBuf::from("/usr/bin/codex"));
        paths.push(PathBuf::from("/bin/codex"));
        paths.push(PathBuf::from("/opt/homebrew/bin/codex"));
    }

    #[cfg(windows)]
    {
        paths.push(home.join(".cargo\\bin\\codex.exe"));
        paths.push(home.join(".bun\\bin\\codex.exe"));
        paths.push(home.join("AppData\\Roaming\\npm\\codex.cmd"));
        // Add more windows paths if needed
    }

    paths
}

fn search_in_dir(root: &Path) -> Option<PathBuf> {
    let walker = WalkDir::new(root).follow_links(false).into_iter();
    
    for entry in walker.filter_entry(|e| !is_ignored(e)) {
        let entry = entry.ok()?;
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_name() {
                let name_str = name.to_string_lossy();
                #[cfg(unix)]
                let is_match = name_str == "codex";
                #[cfg(windows)]
                let is_match = name_str.eq_ignore_ascii_case("codex.exe");

                if is_match && is_executable(path) {
                    return Some(path.to_path_buf());
                }
            }
        }
    }
    None
}

fn is_ignored(entry: &DirEntry) -> bool {
    let name = entry.file_name().to_string_lossy();
    // 跳过隐藏目录（除了 .local, .cargo, .bun）
    if name.starts_with('.') {
        return name != ".local" && name != ".cargo" && name != ".bun"; 
    }
    // 跳过常见的大目录
    let ignored_dirs = [
        "Downloads", "Documents", "Pictures", "Music", "Videos", "Desktop",
        "Library", "node_modules", "target", "build", "dist"
    ];
    ignored_dirs.contains(&name.as_ref())
}
