//! Memory Commands
//!
//! Commands for managing Hermes Agent memories.
//! Reads from ~/.hermes/memories/ in WSL.

use serde::{Deserialize, Serialize};
use super::utils::create_command;

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

/// Read a memory file from WSL
fn read_memory_file(filename: &str) -> Result<MemoryFile, String> {
    let script = format!(
        r#"cat ~/.hermes/memories/{} 2>/dev/null || echo ''"#,
        filename
    );

    let output = create_command("wsl")
        .args(["bash", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to read memory file: {}", e))?;

    let content = String::from_utf8_lossy(&output.stdout).to_string();
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

    // Get last modified time
    let stat_script = format!(
        r#"stat -c %Y ~/.hermes/memories/{} 2>/dev/null || echo '0'"#,
        filename
    );

    let last_modified = if let Ok(output) = create_command("wsl")
        .args(["bash", "-c", &stat_script])
        .output()
    {
        if output.status.success() {
            let ts_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if let Ok(ts) = ts_str.parse::<i64>() {
                chrono::DateTime::from_timestamp(ts, 0)
                    .map(|dt| dt.to_rfc3339())
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

    println!("[Memory] Memory: {} chars, User: {} chars", memory.char_count, user_profile.char_count);

    Ok(MemoryData {
        memory,
        user_profile,
    })
}

/// Save memory content
#[tauri::command]
pub fn save_memory(file_type: String, content: String) -> Result<serde_json::Value, String> {
    let filename = if file_type == "user_profile" { "USER.md" } else { "MEMORY.md" };

    // Write via WSL
    let script = format!(
        r#"cat > ~/.hermes/memories/{} << 'HERMES_EOF'
{}
HERMES_EOF"#,
        filename, content
    );

    let output = create_command("wsl")
        .args(["bash", "-c", &script])
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
