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
    // Fixed: handle first ## header correctly by capturing title without
    // requiring non-empty current_section
    let mut sections = Vec::new();
    let mut current_section = String::new();
    let mut current_start: usize = 1;
    let mut current_title: Option<String> = None;
    let mut line_num: usize = 1;
    let mut section_id: usize = 0;

    for line in content.lines() {
        if line.starts_with("## ") {
            // Save previous section if it has content
            if !current_section.trim().is_empty() {
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
            }

            // Start new section with this header's title
            current_section = String::new();
            current_start = line_num;
            current_title = Some(line[3..].to_string());
        } else {
            current_section.push_str(line);
            current_section.push('\n');
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
#[tauri::command(rename_all = "snake_case")]
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
#[tauri::command(rename_all = "snake_case")]
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
#[tauri::command(rename_all = "snake_case")]
pub fn get_memories_path() -> Result<String, String> {
    Ok("~/.hermes/memories".to_string())
}

/// Search result from memory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemorySearchResult {
    pub file: String,
    pub line_number: usize,
    pub line_content: String,
    pub context_before: Vec<String>,
    pub context_after: Vec<String>,
}

/// Search memories for a query
#[tauri::command(rename_all = "snake_case")]
pub fn search_memories(query: String, case_sensitive: bool) -> Result<Vec<MemorySearchResult>, String> {
    if query.is_empty() {
        return Err("Query cannot be empty".to_string());
    }

    // Use base64 encoding for the query to avoid shell injection
    let query_b64 = STANDARD.encode(&query);

    let script = format!(
        r#"
import os
import json
import base64

query = base64.b64decode("{}").decode('utf-8')
case_sensitive = {}
results = []

for filename in ["MEMORY.md", "USER.md"]:
    filepath = os.path.expanduser("~/.hermes/memories/" + filename)
    if not os.path.isfile(filepath):
        continue

    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    search_query = query if case_sensitive else query.lower()

    for i, line in enumerate(lines):
        search_line = line if case_sensitive else line.lower()
        if search_query in search_line:
            context_before = [lines[j].rstrip() for j in range(max(0, i-2), i)]
            context_after = [lines[j].rstrip() for j in range(i+1, min(len(lines), i+3))]
            results.append({{
                "file": filename,
                "line_number": i + 1,
                "line_content": line.rstrip(),
                "context_before": context_before,
                "context_after": context_after
            }})

print(json.dumps(results))
"#,
        query_b64,
        case_sensitive
    );

    let output = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to search memories: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to search memories: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let results: Vec<MemorySearchResult> = serde_json::from_str(&stdout.trim())
        .map_err(|e| format!("Failed to parse search results: {}", e))?;

    Ok(results)
}

/// Delete a section from memory by ID
#[tauri::command(rename_all = "snake_case")]
pub fn delete_memory_section(file_type: String, section_id: String) -> Result<serde_json::Value, String> {
    let filename = if file_type == "user_profile" {
        "USER.md"
    } else {
        "MEMORY.md"
    };
    let valid_filename = validate_memory_filename(filename)?;

    // Read current content
    let memory_file = read_memory_file(&valid_filename)?;
    
    // Find and remove the section
    let section_index = memory_file.sections
        .iter()
        .position(|s| s.id == section_id)
        .ok_or_else(|| format!("Section {} not found", section_id))?;

    let section = &memory_file.sections[section_index];
    
    // Remove section content from the full content
    let lines: Vec<&str> = memory_file.content.lines().collect();
    let new_lines: Vec<&str> = lines
        .iter()
        .enumerate()
        .filter(|(i, _)| *i < section.start_line - 1 || *i >= section.end_line)
        .map(|(_, l)| *l)
        .collect();
    
    let new_content = new_lines.join("\n");

    // Save the updated content
    let encoded = STANDARD.encode(&new_content);
    let script = format!(
        r#"
import os
import base64

filepath = os.path.expanduser("~/.hermes/memories/{}")
content = base64.b64decode("{}").decode('utf-8')
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print('ok')
"#,
        valid_filename, encoded
    );

    let output = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to delete section: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to delete section: {}", stderr));
    }

    Ok(serde_json::json!({
        "ok": true,
        "deleted_section": section_id,
        "remaining_chars": new_content.chars().count()
    }))
}

/// Append content to memory
#[tauri::command(rename_all = "snake_case")]
pub fn append_memory(file_type: String, content: String, section_title: Option<String>) -> Result<serde_json::Value, String> {
    let filename = if file_type == "user_profile" {
        "USER.md"
    } else {
        "MEMORY.md"
    };
    let valid_filename = validate_memory_filename(filename)?;

    // Read current content
    let memory_file = read_memory_file(&valid_filename)?;
    
    let new_content = if let Some(title) = section_title {
        format!("{}\n\n## {}\n\n{}\n", memory_file.content, title, content)
    } else {
        format!("{}\n\n{}\n", memory_file.content, content)
    };

    // Save the updated content
    let encoded = STANDARD.encode(&new_content);
    let script = format!(
        r#"
import os
import base64

filepath = os.path.expanduser("~/.hermes/memories/{}")
content = base64.b64decode("{}").decode('utf-8')
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print('ok')
"#,
        valid_filename, encoded
    );

    let output = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to append memory: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to append memory: {}", stderr));
    }

    Ok(serde_json::json!({
        "ok": true,
        "char_count": new_content.chars().count()
    }))
}

/// Trim oldest MEMORY.md sections when usage exceeds threshold (default 90% of char_limit)
#[tauri::command(rename_all = "snake_case")]
pub fn run_memory_cleanup(threshold_percent: Option<u32>) -> Result<serde_json::Value, String> {
    let threshold = threshold_percent.unwrap_or(90).clamp(50, 100);
    println!("[Memory] Running cleanup at {}% threshold", threshold);

    let memory = read_memory_file("MEMORY.md")?;
    let limit = memory.char_limit;
    let target = (limit as u64 * threshold as u64 / 100) as usize;

    if memory.char_count <= target {
        return Ok(serde_json::json!({
            "ok": true,
            "trimmed_sections": 0,
            "char_count": memory.char_count,
            "char_limit": limit,
            "message": "Memory within threshold, no cleanup needed"
        }));
    }

    let rebuild = |secs: &[MemorySection]| -> String {
        let mut rebuilt = String::new();
        for section in secs {
            if let Some(title) = &section.title {
                rebuilt.push_str(&format!("## {}\n\n", title));
            }
            rebuilt.push_str(&section.content);
            rebuilt.push('\n');
        }
        rebuilt.trim_end().to_string()
    };

    let mut sections = memory.sections.clone();
    let mut trimmed = 0usize;
    let mut rebuilt = rebuild(&sections);
    let mut char_count = rebuilt.chars().count();

    while char_count > target && sections.len() > 1 {
        sections.remove(0);
        trimmed += 1;
        rebuilt = rebuild(&sections);
        char_count = rebuilt.chars().count();
    }

    if trimmed == 0 {
        return Ok(serde_json::json!({
            "ok": true,
            "trimmed_sections": 0,
            "char_count": memory.char_count,
            "char_limit": limit,
            "message": "Could not trim further (only one section remains)"
        }));
    }

    let encoded = STANDARD.encode(&rebuilt);
    let script = format!(
        r#"
import os
import base64

filepath = os.path.expanduser("~/.hermes/memories/MEMORY.md")
content = base64.b64decode("{}").decode('utf-8')
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print('ok')
"#,
        encoded
    );

    let output = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to run memory cleanup: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to run memory cleanup: {}", stderr));
    }

    let final_count = char_count;
    println!(
        "[Memory] Cleanup removed {} sections, {} -> {} chars",
        trimmed, memory.char_count, final_count
    );

    Ok(serde_json::json!({
        "ok": true,
        "trimmed_sections": trimmed,
        "char_count": final_count,
        "char_limit": limit
    }))
}
