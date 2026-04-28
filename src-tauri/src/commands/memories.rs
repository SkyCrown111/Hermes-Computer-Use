//! Memory Commands
//!
//! Commands for managing Hermes Agent memories.
//! Reads from ~/.hermes/memories/ in WSL.

use super::utils::create_command;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};

/// Memory section - matches frontend MemorySection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemorySection {
    pub id: String,
    pub title: Option<String>,
    pub content: String,
    pub start_line: usize,
    pub end_line: usize,
    pub char_count: usize,
}

/// Memory file - matches frontend MemoryFile
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryFile {
    pub file: String,
    pub content: String,
    pub char_count: usize,
    pub char_limit: usize,
    pub sections: Vec<MemorySection>,
    pub last_modified: Option<String>,
}

/// Memory data - matches frontend MemoryData
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryData {
    pub memory: MemoryFile,
    pub user_profile: MemoryFile,
}

/// Validate filename to prevent path traversal
fn validate_memory_filename(filename: &str) -> Result<String, String> {
    // Only allow specific allowed filenames
    let allowed = ["MEMORY.md", "USER.md"];
    if !allowed.contains(&filename) {
        return Err(format!(
            "Invalid filename: {}. Only MEMORY.md and USER.md are allowed.",
            filename
        ));
    }
    Ok(filename.to_string())
}

/// Read a memory file from WSL
fn read_memory_file(filename: &str) -> Result<MemoryFile, String> {
    let valid_filename = validate_memory_filename(filename)?;

    let script = format!(
        r#"
import os
import json

filename = "{}"
filepath = os.path.expanduser("~/.hermes/memories/" + filename)

if os.path.isfile(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    print(json.dumps({{"success": True, "content": content}}))
else:
    print(json.dumps({{"success": False, "content": ""}}))
"#,
        valid_filename
    );

    let output = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to read memory file: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json_result: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse memory file response: {}", e))?;

    let content = json_result
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let char_count = content.chars().count();

    // Parse sections (split by ## headers)
    let mut sections = Vec::new();
    let mut current_section = String::new();
    let mut current_start = 1;
    let mut current_title: Option<String> = None;
    let mut line_num = 1;
    let mut section_id = 0;

    for line in content.lines() {
        if line.starts_with("## ") && !current_section.is_empty() {
            // Save current section
            let char_count = current_section.chars().count();
            sections.push(MemorySection {
                id: format!("section-{}", section_id),
                title: current_title.clone(),
                content: current_section.trim().to_string(),
                start_line: current_start,
                end_line: line_num - 1,
                char_count,
            });
            section_id += 1;

            // Start new section
            current_section = String::new();
            current_start = line_num;
            current_title = Some(line[3..].to_string());
        } else {
            if current_section.is_empty() && line.starts_with("## ") {
                current_title = Some(line[3..].to_string());
            } else {
                current_section.push_str(line);
                current_section.push('\n');
            }
        }
        line_num += 1;
    }

    // Add last section
    if !current_section.trim().is_empty() {
        let char_count = current_section.chars().count();
        sections.push(MemorySection {
            id: format!("section-{}", section_id),
            title: current_title,
            content: current_section.trim().to_string(),
            start_line: current_start,
            end_line: line_num - 1,
            char_count,
        });
    }

    // Get last modified time using Python
    let stat_script = format!(
        r#"
import os
import json

filepath = os.path.expanduser("~/.hermes/memories/{}")
if os.path.isfile(filepath):
    mtime = os.path.getmtime(filepath)
    print(json.dumps({{"mtime": int(mtime)}}))
else:
    print(json.dumps({{"mtime": 0}}))
"#,
        valid_filename
    );

    let last_modified = if let Ok(output) = create_command("wsl")
        .args(["python3", "-c", &stat_script])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&stdout) {
                let ts = json.get("mtime").and_then(|v| v.as_i64()).unwrap_or(0);
                chrono::DateTime::from_timestamp(ts, 0).map(|dt| dt.to_rfc3339())
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    Ok(MemoryFile {
        file: filename.to_string(),
        content,
        char_count,
        char_limit: 100000, // Default limit
        sections,
        last_modified,
    })
}

/// Get all memory data
#[tauri::command]
pub fn get_memories() -> Result<MemoryData, String> {
    println!("[Memory] Getting memories...");

    let memory = read_memory_file("MEMORY.md")?;
    let user_profile = read_memory_file("USER.md")?;

    println!(
        "[Memory] Memory: {} chars, User: {} chars",
        memory.char_count, user_profile.char_count
    );

    Ok(MemoryData {
        memory,
        user_profile,
    })
}

/// Save memory content - uses base64 encoding for safe shell transport
#[tauri::command]
pub fn save_memory(file_type: String, content: String) -> Result<serde_json::Value, String> {
    let filename = if file_type == "user_profile" {
        "USER.md"
    } else {
        "MEMORY.md"
    };
    let valid_filename = validate_memory_filename(filename)?;

    // Encode content as base64 for safe shell transport
    let encoded = STANDARD.encode(&content);

    let script = format!(
        r#"
import os
import base64
import json

filename = "{}"
filepath = os.path.expanduser("~/.hermes/memories/" + filename)

# Ensure directory exists
os.makedirs(os.path.dirname(filepath), exist_ok=True)

# Decode base64 content and write
content = base64.b64decode("{}").decode('utf-8')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print(json.dumps({{"success": True}}))
"#,
        valid_filename, encoded
    );

    let output = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to save memory: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to save memory: {}", stderr));
    }

    let char_count = content.chars().count();

    Ok(serde_json::json!({
        "ok": true,
        "char_count": char_count,
        "char_limit": 100000
    }))
}

/// Get memory directory path
#[tauri::command]
pub fn get_memories_path() -> Result<String, String> {
    Ok("~/.hermes/memories".to_string())
}
