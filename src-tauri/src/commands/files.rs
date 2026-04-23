//! Files Commands
//!
//! Commands for file system operations via WSL.

use serde::{Deserialize, Serialize};
use std::process::Command;
use super::utils::create_command;

/// File type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileType {
    File,
    Directory,
    Symlink,
}

impl std::fmt::Display for FileType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FileType::File => write!(f, "file"),
            FileType::Directory => write!(f, "directory"),
            FileType::Symlink => write!(f, "symlink"),
        }
    }
}

/// File permissions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilePermissions {
    pub read: bool,
    pub write: bool,
    pub execute: bool,
}

/// File information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub file_type: FileType,
    pub size: u64,
    pub modified: String,
    pub created: String,
    pub permissions: Option<FilePermissions>,
    pub is_hidden: bool,
    pub extension: Option<String>,
    pub mime_type: Option<String>,
}

/// Directory content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryContent {
    pub path: String,
    pub files: Vec<FileInfo>,
    pub total_files: usize,
    pub total_directories: usize,
}

/// File content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub encoding: String,
    pub size: u64,
    pub lines: usize,
    pub language: Option<String>,
}

/// File operation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOperationResult {
    pub success: bool,
    pub message: String,
    pub path: Option<String>,
}

/// Get file extension and mime type
fn get_file_info(name: &str) -> (Option<String>, Option<String>) {
    let ext = name.rsplit('.').next().map(|s| s.to_lowercase());

    let mime_type = ext.as_ref().and_then(|e| match e.as_str() {
        "txt" => Some("text/plain"),
        "md" => Some("text/markdown"),
        "json" => Some("application/json"),
        "yaml" | "yml" => Some("text/yaml"),
        "xml" => Some("text/xml"),
        "csv" => Some("text/csv"),
        "js" | "jsx" => Some("text/javascript"),
        "ts" | "tsx" => Some("text/typescript"),
        "py" => Some("text/x-python"),
        "rs" => Some("text/x-rust"),
        "go" => Some("text/x-go"),
        "java" => Some("text/x-java"),
        "c" | "h" => Some("text/x-c"),
        "cpp" | "hpp" => Some("text/x-c++"),
        "css" => Some("text/css"),
        "html" | "htm" => Some("text/html"),
        "sh" | "bash" => Some("text/x-shellscript"),
        "sql" => Some("application/sql"),
        _ => None,
    }).map(|s| s.to_string());

    (ext, mime_type)
}

/// List directory contents
#[tauri::command]
pub async fn list_directory(
    path: String,
    recursive: Option<bool>,
    include_hidden: Option<bool>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<DirectoryContent, String> {
    println!("[Files] Listing directory: {}", path);

    let recursive = recursive.unwrap_or(false);
    let include_hidden = include_hidden.unwrap_or(false);
    let sort_by = sort_by.unwrap_or_else(|| "name".to_string());
    let sort_order = sort_order.unwrap_or_else(|| "asc".to_string());

    // Build ls command
    let mut cmd = if recursive {
        format!("find {} -maxdepth 5 -type f -o -type d 2>/dev/null | head -1000", path)
    } else {
        format!("ls -la {} 2>/dev/null", path)
    };

    let output = create_command("wsl")
        .args(["bash", "-c", &cmd])
        .output()
        .map_err(|e| format!("Failed to list directory: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !stderr.is_empty() && stdout.is_empty() {
        return Err(format!("Error: {}", stderr.trim()));
    }

    let mut files: Vec<FileInfo> = Vec::new();
    let mut total_files = 0;
    let mut total_directories = 0;

    if recursive {
        // Parse find output
        for line in stdout.lines() {
            let line = line.trim();
            if line.is_empty() || line == path {
                continue;
            }

            // Get file info
            let stat_cmd = format!("stat -c '%n|%s|%Y|%W|%F' {} 2>/dev/null", line);
            if let Ok(stat_output) = create_command("wsl")
                .args(["bash", "-c", &stat_cmd])
                .output()
            {
                let stat_out = String::from_utf8_lossy(&stat_output.stdout);
                if let Some(info) = parse_stat_output(&stat_out, line) {
                    if info.file_type == FileType::File {
                        total_files += 1;
                    } else {
                        total_directories += 1;
                    }
                    files.push(info);
                }
            }
        }
    } else {
        // Parse ls -la output
        for line in stdout.lines().skip(1) { // Skip total line
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if let Some(info) = parse_ls_line(line, &path) {
                // Filter hidden files
                if !include_hidden && info.name.starts_with('.') {
                    continue;
                }
                if info.file_type == FileType::File {
                    total_files += 1;
                } else {
                    total_directories += 1;
                }
                files.push(info);
            }
        }
    }

    // Sort files
    files.sort_by(|a, b| {
        let cmp = match sort_by.as_str() {
            "size" => a.size.cmp(&b.size),
            "modified" => a.modified.cmp(&b.modified),
            "type" => a.file_type.to_string().cmp(&b.file_type.to_string()),
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        };
        if sort_order == "desc" { cmp.reverse() } else { cmp }
    });

    Ok(DirectoryContent {
        path,
        files,
        total_files,
        total_directories,
    })
}

/// Parse ls -la line
fn parse_ls_line(line: &str, base_path: &str) -> Option<FileInfo> {
    // Format: drwxr-xr-x  2 user group 4096 Jan 1 12:00 dirname
    //         -rw-r--r--  1 user group 1234 Jan 1 12:00 filename
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 9 {
        return None;
    }

    let perms = parts[0];
    let file_type = if perms.starts_with('d') {
        FileType::Directory
    } else if perms.starts_with('l') {
        FileType::Symlink
    } else {
        FileType::File
    };

    let size: u64 = parts[4].parse().unwrap_or(0);

    // Name is the last part (may contain spaces, so join remaining)
    let name = parts[8..].join(" ");
    if name.is_empty() || name == "." || name == ".." {
        return None;
    }

    let full_path = if base_path.ends_with('/') {
        format!("{}{}", base_path, name)
    } else {
        format!("{}/{}", base_path, name)
    };

    let is_hidden = name.starts_with('.');
    let (extension, mime_type) = if file_type == FileType::File {
        get_file_info(&name)
    } else {
        (None, None)
    };

    // Parse permissions
    let permissions = FilePermissions {
        read: perms.contains('r'),
        write: perms.contains('w'),
        execute: perms.contains('x'),
    };

    // Build date from parts 5-7
    let modified = format!("{} {} {}", parts[5], parts[6], parts[7]);
    let created = modified.clone();

    Some(FileInfo {
        name,
        path: full_path,
        file_type,
        size,
        modified,
        created,
        permissions: Some(permissions),
        is_hidden,
        extension,
        mime_type,
    })
}

/// Parse stat output
fn parse_stat_output(output: &str, path: &str) -> Option<FileInfo> {
    // Format: filename|size|mtime|ctime|type
    let parts: Vec<&str> = output.trim().split('|').collect();
    if parts.len() < 5 {
        return None;
    }

    let name = parts[0].rsplit('/').next().unwrap_or(parts[0]).to_string();
    let size: u64 = parts[1].parse().unwrap_or(0);
    let file_type = if parts[4].contains("directory") {
        FileType::Directory
    } else if parts[4].contains("link") {
        FileType::Symlink
    } else {
        FileType::File
    };

    let is_hidden = name.starts_with('.');
    let (extension, mime_type) = if file_type == FileType::File {
        get_file_info(&name)
    } else {
        (None, None)
    };

    // Convert timestamps
    let modified = parts[2].parse::<i64>().unwrap_or(0);
    let created = parts[3].parse::<i64>().unwrap_or(0);

    Some(FileInfo {
        name,
        path: path.to_string(),
        file_type,
        size,
        modified: format_timestamp(modified),
        created: format_timestamp(created),
        permissions: None,
        is_hidden,
        extension,
        mime_type,
    })
}

/// Format Unix timestamp
fn format_timestamp(ts: i64) -> String {
    if ts == 0 {
        return "Unknown".to_string();
    }
    // Simple format
    chrono::DateTime::from_timestamp(ts, 0)
        .map(|dt| dt.format("%Y-%m-%d %H:%M").to_string())
        .unwrap_or_else(|| "Unknown".to_string())
}

/// Read file content
#[tauri::command]
pub async fn read_file(path: String) -> Result<FileContent, String> {
    println!("[Files] Reading file: {}", path);

    let cmd = format!("cat {} 2>/dev/null", path);
    let output = create_command("wsl")
        .args(["bash", "-c", &cmd])
        .output()
        .map_err(|e| format!("Failed to read file: {}", e))?;

    if !output.status.success() {
        return Err("Failed to read file".to_string());
    }

    let content = String::from_utf8_lossy(&output.stdout).to_string();
    let size = content.len() as u64;
    let lines = content.lines().count();

    let extension = path.rsplit('.').next().map(|s| s.to_lowercase());
    let language = extension.as_ref().and_then(|e| match e.as_str() {
        "js" | "jsx" => Some("javascript"),
        "ts" | "tsx" => Some("typescript"),
        "py" => Some("python"),
        "rs" => Some("rust"),
        "go" => Some("go"),
        "java" => Some("java"),
        "c" | "h" => Some("c"),
        "cpp" | "hpp" => Some("cpp"),
        "css" => Some("css"),
        "html" | "htm" => Some("html"),
        "json" => Some("json"),
        "yaml" | "yml" => Some("yaml"),
        "md" => Some("markdown"),
        "sh" | "bash" => Some("shell"),
        "sql" => Some("sql"),
        _ => None,
    }).map(|s| s.to_string());

    Ok(FileContent {
        path,
        content,
        encoding: "utf-8".to_string(),
        size,
        lines,
        language,
    })
}

/// Write file content
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<FileOperationResult, String> {
    println!("[Files] Writing file: {}", path);

    // Create parent directory if needed
    let parent_cmd = format!("mkdir -p $(dirname '{}')", path);
    let _ = create_command("wsl")
        .args(["bash", "-c", &parent_cmd])
        .output();

    // Write content using heredoc
    let escaped_content = content.replace("'", "'\\''");
    let cmd = format!("cat > '{}' << 'HERMES_EOF'\n{}\nHERMES_EOF", path, escaped_content);

    let output = create_command("wsl")
        .args(["bash", "-c", &cmd])
        .output()
        .map_err(|e| format!("Failed to write file: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to write file: {}", stderr));
    }

    Ok(FileOperationResult {
        success: true,
        message: "File written successfully".to_string(),
        path: Some(path),
    })
}

/// Create directory
#[tauri::command]
pub async fn create_directory(path: String) -> Result<FileOperationResult, String> {
    println!("[Files] Creating directory: {}", path);

    let cmd = format!("mkdir -p '{}'", path);
    let output = create_command("wsl")
        .args(["bash", "-c", &cmd])
        .output()
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to create directory: {}", stderr));
    }

    Ok(FileOperationResult {
        success: true,
        message: "Directory created successfully".to_string(),
        path: Some(path),
    })
}

/// Delete file or directory
#[tauri::command]
pub async fn delete_file(path: String) -> Result<FileOperationResult, String> {
    println!("[Files] Deleting: {}", path);

    let cmd = format!("rm -rf '{}'", path);
    let output = create_command("wsl")
        .args(["bash", "-c", &cmd])
        .output()
        .map_err(|e| format!("Failed to delete: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to delete: {}", stderr));
    }

    Ok(FileOperationResult {
        success: true,
        message: "Deleted successfully".to_string(),
        path: Some(path),
    })
}

/// Move file or directory
#[tauri::command]
pub async fn move_file(source: String, destination: String) -> Result<FileOperationResult, String> {
    println!("[Files] Moving {} to {}", source, destination);

    let cmd = format!("mv '{}' '{}'", source, destination);
    let output = create_command("wsl")
        .args(["bash", "-c", &cmd])
        .output()
        .map_err(|e| format!("Failed to move: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to move: {}", stderr));
    }

    Ok(FileOperationResult {
        success: true,
        message: "Moved successfully".to_string(),
        path: Some(destination),
    })
}

/// Copy file or directory
#[tauri::command]
pub async fn copy_file(source: String, destination: String) -> Result<FileOperationResult, String> {
    println!("[Files] Copying {} to {}", source, destination);

    let cmd = format!("cp -r '{}' '{}'", source, destination);
    let output = create_command("wsl")
        .args(["bash", "-c", &cmd])
        .output()
        .map_err(|e| format!("Failed to copy: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to copy: {}", stderr));
    }

    Ok(FileOperationResult {
        success: true,
        message: "Copied successfully".to_string(),
        path: Some(destination),
    })
}

/// Check if file exists
#[tauri::command]
pub async fn file_exists(path: String) -> Result<serde_json::Value, String> {
    println!("[Files] Checking if exists: {}", path);

    let cmd = format!("test -e '{}' && echo 'exists' || echo 'not_found'; test -d '{}' && echo 'directory' || test -f '{}' && echo 'file'", path, path, path);
    let output = create_command("wsl")
        .args(["bash", "-c", &cmd])
        .output()
        .map_err(|e| format!("Failed to check file: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout.lines().collect();

    let exists = lines.get(0).map(|l| *l == "exists").unwrap_or(false);
    let file_type = lines.get(1).map(|l| *l).unwrap_or("");

    Ok(serde_json::json!({
        "exists": exists,
        "type": file_type
    }))
}

/// Get file tree
#[tauri::command]
pub async fn get_file_tree(path: String, depth: Option<u32>) -> Result<serde_json::Value, String> {
    println!("[Files] Getting file tree for: {}", path);

    let max_depth = depth.unwrap_or(3);
    let cmd = format!("find {} -maxdepth {} -type d 2>/dev/null | head -100", path, max_depth);

    let output = create_command("wsl")
        .args(["bash", "-c", &cmd])
        .output()
        .map_err(|e| format!("Failed to get file tree: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Build tree structure
    let mut tree: Vec<serde_json::Value> = Vec::new();
    for line in stdout.lines() {
        let name = line.rsplit('/').next().unwrap_or(line);
        tree.push(serde_json::json!({
            "name": name,
            "path": line,
            "type": "directory"
        }));
    }

    Ok(serde_json::json!({
        "name": path.rsplit('/').next().unwrap_or(&path),
        "path": path,
        "type": "directory",
        "children": tree
    }))
}
