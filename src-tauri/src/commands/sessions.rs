//! Session Commands
//!
//! Commands for managing Hermes Agent sessions.
//! Queries the Hermes SQLite database directly via WSL.

use super::utils::create_command;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};

/// Session metadata - matches frontend Session type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub platform: String,
    pub chat_id: String,
    pub chat_name: String,
    pub chat_type: Option<String>,
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub started_at: String,
    pub last_activity_at: String,
    pub message_count: usize,
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: Option<u64>,
    pub reasoning_tokens: Option<u64>,
    pub estimated_cost_usd: f64,
    pub actual_cost_usd: Option<f64>,
    pub status: String,
}

/// Search results wrapper with total count
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResults {
    pub results: Vec<serde_json::Value>,
    pub total: usize,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessage {
    pub role: String,
    pub content: String,
    pub timestamp: String,
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub name: String,
    pub args: serde_json::Value,
}

// Database stores tool_calls in OpenAI format: {"function": {"name": "...", "arguments": "..."}}
// We need to transform it to our simplified format
#[derive(Debug, Clone, Deserialize)]
struct DatabaseToolCall {
    #[serde(default)]
    function: Option<DatabaseToolFunction>,
}

#[derive(Debug, Clone, Deserialize)]
struct DatabaseToolFunction {
    name: String,
    arguments: String,
}

fn parse_tool_calls(tool_calls_str: &str) -> Option<Vec<ToolCall>> {
    if tool_calls_str.is_empty() {
        return None;
    }

    println!("[Sessions] Parsing tool_calls: {}", tool_calls_str);

    // Try to parse as array of database-format tool calls
    let db_calls: Vec<DatabaseToolCall> = match serde_json::from_str(tool_calls_str) {
        Ok(calls) => calls,
        Err(e) => {
            println!("[Sessions] Failed to parse tool_calls as OpenAI format: {}", e);
            // Try to parse as simple array of {name, args} objects
            let simple_calls: Vec<ToolCall> = match serde_json::from_str(tool_calls_str) {
                Ok(calls) => calls,
                Err(_) => return None,
            };
            if simple_calls.is_empty() {
                return None;
            }
            println!("[Sessions] Parsed {} tool calls in simple format", simple_calls.len());
            return Some(simple_calls);
        }
    };

    let tool_calls: Vec<ToolCall> = db_calls
        .into_iter()
        .filter_map(|db_call| {
            db_call.function.map(|f| {
                // Parse arguments string as JSON, or use empty object
                let args: serde_json::Value =
                    serde_json::from_str(&f.arguments).unwrap_or_else(|_| serde_json::json!({}));
                ToolCall { name: f.name, args }
            })
        })
        .collect();

    if tool_calls.is_empty() {
        None
    } else {
        println!("[Sessions] Parsed {} tool calls in OpenAI format", tool_calls.len());
        Some(tool_calls)
    }
}

/// Session list response - matches frontend SessionListResponse
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionListResponse {
    pub sessions: Vec<Session>,
    pub total: usize,
    pub limit: usize,
    pub offset: usize,
}

/// Session detail response - matches frontend SessionMessagesResponse
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessagesResponse {
    pub session_id: String,
    pub messages: Vec<SessionMessage>,
}

/// Convert Unix timestamp to ISO 8601 string
fn timestamp_to_iso(ts: f64) -> String {
    let secs = ts as i64;
    let nanos = ((ts - secs as f64) * 1_000_000_000.0) as u32;
    chrono::DateTime::from_timestamp(secs, nanos)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_else(|| ts.to_string())
}

/// Query SQLite database via WSL Python with parameterized queries
fn query_db(sql: &str, params: &[serde_json::Value]) -> Result<Vec<serde_json::Value>, String> {
    let params_json =
        serde_json::to_string(params).map_err(|e| format!("Failed to serialize params: {}", e))?;
    let params_b64 = STANDARD.encode(params_json);

    // Escape single quotes for the shell-embedded Python string
    let escaped_sql = sql.replace('\n', " ").replace('\'', "'\\''");

    // Use single quotes to wrap the Python script, with proper escaping
    let script = format!(
        r#"python3 -c '
import sqlite3, json, os, base64
conn = sqlite3.connect(os.path.expanduser("~/.hermes/state.db"))
conn.row_factory = sqlite3.Row
cursor = conn.cursor()
params = json.loads(base64.b64decode("{}").decode())
cursor.execute("{}", params)
rows = cursor.fetchall()
result = [dict(row) for row in rows]
print(json.dumps(result))
conn.close()
'"#,
        params_b64, escaped_sql
    );

    let output = create_command("wsl")
        .args(["bash", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to execute WSL command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Database query failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();

    if trimmed.is_empty() || trimmed == "[]" {
        return Ok(vec![]);
    }

    serde_json::from_str(trimmed).map_err(|e| format!("Failed to parse JSON: {}", e))
}

/// Execute SQL via WSL Python with parameterized queries (no rows returned)
fn exec_db(sql: &str, params: &[serde_json::Value]) -> Result<(), String> {
    let params_json =
        serde_json::to_string(params).map_err(|e| format!("Failed to serialize params: {}", e))?;
    let params_b64 = STANDARD.encode(params_json);
    let escaped_sql = sql.replace('\n', " ").replace('\'', "'\\''");

    // Use single quotes to wrap the Python script
    let script = format!(
        r#"python3 -c '
import sqlite3, json, os, base64
conn = sqlite3.connect(os.path.expanduser("~/.hermes/state.db"))
cursor = conn.cursor()
params = json.loads(base64.b64decode("{}").decode())
cursor.execute("{}", params)
conn.commit()
conn.close()
print("ok")
'"#,
        params_b64, escaped_sql
    );

    let output = create_command("wsl")
        .args(["bash", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to execute: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Database exec failed: {}", stderr));
    }
    Ok(())
}

/// Count total sessions
#[tauri::command]
pub fn count_sessions(platform: Option<String>) -> Result<usize, String> {
    let (sql, params): (_, Vec<serde_json::Value>) = if let Some(ref p) = platform {
        (
            "SELECT COUNT(*) as count FROM sessions WHERE source = ?".to_string(),
            vec![serde_json::json!(p)],
        )
    } else {
        ("SELECT COUNT(*) as count FROM sessions".to_string(), vec![])
    };

    let rows = query_db(&sql, &params)?;

    if let Some(row) = rows.first() {
        let count = row.get("count").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        Ok(count)
    } else {
        Ok(0)
    }
}

/// List all sessions from Hermes database
#[tauri::command]
pub fn list_sessions(
    platform: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<SessionListResponse, String> {
    println!(
        "[Sessions] Listing sessions from database (platform: {:?})...",
        platform
    );

    let limit = limit.unwrap_or(100);
    let offset = offset.unwrap_or(0);

    // Get total count first
    let total = count_sessions(platform.clone())?;

    let (sql, params): (_, Vec<serde_json::Value>) = if let Some(ref p) = platform {
        (
            r#"
            SELECT
                id, source, model, started_at, ended_at, message_count,
                input_tokens, output_tokens, cache_read_tokens, reasoning_tokens,
                estimated_cost_usd, actual_cost_usd, end_reason, title
            FROM sessions
            WHERE source = ?
            ORDER BY COALESCE(ended_at, started_at) DESC
            LIMIT ? OFFSET ?
            "#
            .to_string(),
            vec![
                serde_json::json!(p),
                serde_json::json!(limit),
                serde_json::json!(offset),
            ],
        )
    } else {
        (
            r#"
            SELECT
                id, source, model, started_at, ended_at, message_count,
                input_tokens, output_tokens, cache_read_tokens, reasoning_tokens,
                estimated_cost_usd, actual_cost_usd, end_reason, title
            FROM sessions
            ORDER BY COALESCE(ended_at, started_at) DESC
            LIMIT ? OFFSET ?
            "#
            .to_string(),
            vec![serde_json::json!(limit), serde_json::json!(offset)],
        )
    };

    let rows = query_db(&sql, &params)?;

    let sessions: Vec<Session> = rows
        .iter()
        .map(|row| {
            let started_at = row
                .get("started_at")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);

            let ended_at = row.get("ended_at").and_then(|v| v.as_f64());

            let _end_reason = row.get("end_reason").and_then(|v| v.as_str()).unwrap_or("");

            let status = if ended_at.is_none() {
                "active"
            } else {
                "completed"
            };

            Session {
                id: row
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                platform: row
                    .get("source")
                    .and_then(|v| v.as_str())
                    .unwrap_or("cli")
                    .to_string(),
                chat_id: "".to_string(),
                chat_name: row
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                chat_type: None,
                user_id: None,
                user_name: None,
                started_at: timestamp_to_iso(started_at),
                last_activity_at: ended_at
                    .map(timestamp_to_iso)
                    .unwrap_or_else(|| timestamp_to_iso(started_at)),
                message_count: row
                    .get("message_count")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as usize,
                model: row
                    .get("model")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                input_tokens: row
                    .get("input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0),
                output_tokens: row
                    .get("output_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0),
                cache_read_tokens: row.get("cache_read_tokens").and_then(|v| v.as_u64()),
                reasoning_tokens: row.get("reasoning_tokens").and_then(|v| v.as_u64()),
                estimated_cost_usd: row
                    .get("estimated_cost_usd")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0),
                actual_cost_usd: row.get("actual_cost_usd").and_then(|v| v.as_f64()),
                status: status.to_string(),
            }
        })
        .collect();

    println!(
        "[Sessions] Found {} sessions (total: {})",
        sessions.len(),
        total
    );
    Ok(SessionListResponse {
        sessions,
        total,
        limit,
        offset,
    })
}

/// Get a single session by ID with messages
#[tauri::command]
pub fn get_session(id: String) -> Result<SessionMessagesResponse, String> {
    println!("[Sessions] Getting session: {}", id);

    // Get messages (limit 500 to handle long sessions)
    let messages_sql = r#"
        SELECT role, content, timestamp, tool_calls, reasoning
        FROM messages
        WHERE session_id = ?
        ORDER BY timestamp ASC
        LIMIT 500
        "#;

    let message_rows = query_db(messages_sql, &[serde_json::json!(id)])?;

    let messages: Vec<SessionMessage> = message_rows
        .iter()
        .filter_map(|row| {
            let timestamp = row.get("timestamp").and_then(|v| v.as_f64()).unwrap_or(0.0);

            let tool_calls_str = row.get("tool_calls").and_then(|v| v.as_str()).unwrap_or("");
            let tool_calls = parse_tool_calls(tool_calls_str);

            // Get reasoning content
            let reasoning = row
                .get("reasoning")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());

            // Get and clean content
            let raw_content = row
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            // Get raw role - may be corrupted with file content
            let raw_role = row
                .get("role")
                .and_then(|v| v.as_str())
                .unwrap_or("user")
                .to_string();

            // Extract the real role from possibly corrupted role field
            let role = extract_real_role(&raw_role);

            // ONLY keep user and assistant messages
            // Skip everything else (tool, session_meta, corrupted data)
            if role != "user" && role != "assistant" {
                return None;
            }

            // Also skip if the content looks like tool output (file dumps, JSON)
            let raw_content_check = raw_content.trim();
            if raw_content_check.starts_with('{')
                && (raw_content_check.contains("\"total_lines\"")
                    || raw_content_check.contains("\"file_size\"")
                    || raw_content_check.contains("\"bytes_written\"")
                    || raw_content_check.contains("\"files_modified\"")
                    || raw_content_check.contains("\"_warning\"")
                    || raw_content_check.contains("\"is_binary\"")
                    || raw_content_check.contains("\"diff\"")
                    || raw_content_check.contains("\"success\"")
                    || raw_content_check.contains("\"output\"")
                    || raw_content_check.contains("\"dirs_created\"")
                    || raw_content_check.contains("\"exit_code\""))
            {
                return None;
            }

            // Clean content
            let clean_content = clean_message_content(&raw_content);

            // Skip empty messages after cleaning
            if clean_content.is_empty() {
                return None;
            }

            // Skip empty messages
            if clean_content.is_empty() && tool_calls.is_none() && reasoning.is_none() {
                return None;
            }

            Some(SessionMessage {
                role,
                content: clean_content,
                timestamp: timestamp_to_iso(timestamp),
                tool_calls,
                reasoning,
            })
        })
        .collect();

    println!("[Sessions] Session {} has {} messages", id, messages.len());

    Ok(SessionMessagesResponse {
        session_id: id,
        messages,
    })
}

/// Extract the real role from a possibly corrupted role field.
/// Hermes Agent sometimes stores file content, JSON output in the role field.
fn extract_real_role(raw_role: &str) -> String {
    // Normal roles
    let trimmed = raw_role.trim();

    // Exact match for normal roles
    if trimmed == "user" || trimmed == "assistant" || trimmed == "system" {
        return trimmed.to_string();
    }

    // Starts with a valid role
    if trimmed.starts_with("user") && !trimmed.starts_with("user_") {
        return "user".to_string();
    }
    if trimmed.starts_with("assistant") {
        return "assistant".to_string();
    }
    if trimmed.starts_with("tool") {
        return "tool".to_string();
    }
    if trimmed.starts_with("session_meta") {
        return "session_meta".to_string();
    }

    // Contains JSON or file content - this is corrupted data, skip it
    if trimmed.contains('{') || trimmed.contains('}') || trimmed.contains('|')
        || trimmed.contains("files_modified") || trimmed.contains("content\":")
        || trimmed.contains("\"lint\"") || trimmed.contains("\"_warning\"")
    {
        // Try to find a real role at the end
        if trimmed.ends_with(":tool") || trimmed.ends_with(": tool") {
            return "tool".to_string();
        }
        if trimmed.ends_with(":user") || trimmed.ends_with(": user") {
            return "user".to_string();
        }
        if trimmed.ends_with(":assistant") || trimmed.ends_with(": assistant") {
            return "assistant".to_string();
        }
        // Corrupted, skip
        return "tool".to_string();
    }

    // Looks like user message content stored in role field
    // This happens when Hermes Agent stores Chinese text in role
    if !trimmed.is_empty() && !trimmed.contains('\n') && trimmed.len() < 200 {
        return "user".to_string();
    }

    // Default: skip corrupted
    "tool".to_string()
}

/// Clean up malformed patterns in message content
/// Uses generic patterns to catch all similar issues at once
fn clean_message_content(content: &str) -> String {
    let mut result = String::new();
    let chars = content.chars().collect::<Vec<char>>();
    let mut i = 0;

    while i < chars.len() {
        // Check for pattern [xxx](http://xxx) or [xxx](https://xxx)
        if chars[i] == '[' {
            let mut bracket_end = i + 1;
            let mut bracket_content = String::new();

            while bracket_end < chars.len() && chars[bracket_end] != ']' {
                bracket_content.push(chars[bracket_end]);
                bracket_end += 1;
            }

            if bracket_end < chars.len() && chars[bracket_end] == ']'
               && bracket_end + 1 < chars.len() && chars[bracket_end + 1] == '(' {
                // Found [xxx]( pattern
                let mut url_end = bracket_end + 2;
                let mut url_content = String::new();

                while url_end < chars.len() && chars[url_end] != ')' {
                    url_content.push(chars[url_end]);
                    url_end += 1;
                }

                if url_end < chars.len() && chars[url_end] == ')' {
                    // Check if this is a malformed link using generic patterns
                    let is_malformed = is_malformed_markdown_link(&bracket_content, &url_content);

                    if is_malformed {
                        // Skip this entire malformed link
                        i = url_end + 1;
                        continue;
                    }
                }
            }
        }

        result.push(chars[i]);
        i += 1;
    }

    // Additional cleanup for common patterns using generic regex-like matching
    result = cleanup_common_patterns(&result);

    result.trim().to_string()
}

/// Check if a Markdown link is malformed (variable-like content that shouldn't be a link)
fn is_malformed_markdown_link(bracket_content: &str, url_content: &str) -> bool {
    // Pattern 1: [xxx](http://xxx) where bracket matches URL path
    if url_content.starts_with("http://") || url_content.starts_with("https://") {
        let url_path = url_content.trim_start_matches("http://").trim_start_matches("https://");

        // Exact match: [msg.id](http://msg.id)
        if bracket_content == url_path {
            return true;
        }

        // Variable-like patterns: starts with common prefixes
        let prefixes = ["msg.", "e.", "errors.", "sessionSearchResults.", "data.", "result.", "response.", "item.", "row.", "val.", "key.", "obj.", "arr.", "str.", "num.", "idx.", "index.", "count.", "len.", "length."];
        for prefix in prefixes {
            if bracket_content.starts_with(prefix) {
                return true;
            }
        }

        // Contains dots (likely a variable path)
        if bracket_content.contains('.') && !bracket_content.contains(' ') && !bracket_content.contains('/') {
            return true;
        }

        // URL path contains the bracket content
        if url_path.contains(bracket_content) && bracket_content.len() > 3 {
            return true;
        }
    }

    false
}

/// Clean up common malformed patterns using string operations
fn cleanup_common_patterns(content: &str) -> String {
    let mut result = content.to_string();

    // Remove npm error lines
    let npm_patterns = [
        "npm error",
        "npm  error",
        "npm   error",
    ];
    for pattern in npm_patterns {
        result = remove_lines_containing(&result, pattern);
    }

    // Remove file listing artifacts
    result = remove_lines_starting_with(&result, "-rwxrwxrwx");
    result = remove_lines_starting_with(&result, "drwxrwxrwx");
    result = remove_lines_starting_with(&result, "total ");

    // Remove Chinese debug messages
    result = remove_lines_containing(&result, "生成");
    result = remove_lines_containing(&result, "架构图");
    result = remove_lines_containing(&result, "继续检查状态");

    // Remove tool execution messages
    result = remove_lines_starting_with(&result, "Tool result:");
    result = remove_lines_starting_with(&result, "Running tool:");
    result = remove_lines_starting_with(&result, "Executing:");

    // Remove JSON tool output patterns (common from Hermes Agent)
    result = remove_json_patterns(&result);

    // Clean up extra whitespace
    while result.contains("\n\n\n") {
        result = result.replace("\n\n\n", "\n\n");
    }

    result
}

/// Remove JSON patterns that are tool outputs, not user content
fn remove_json_patterns(content: &str) -> String {
    let lines: Vec<&str> = content.lines().collect();
    let mut result = Vec::new();

    for line in lines {
        let trimmed = line.trim();

        // Skip lines that are pure JSON tool outputs
        if is_json_tool_output(trimmed) {
            continue;
        }

        // Skip lines that are JSON fragments
        if is_json_fragment(trimmed) {
            continue;
        }

        result.push(line);
    }

    result.join("\n")
}

/// Check if a line is a JSON tool output that should be removed
fn is_json_tool_output(line: &str) -> bool {
    // Complete JSON objects that are tool outputs
    if line.starts_with("{\"success\":") && line.ends_with("}") {
        return true;
    }
    if line.starts_with("{\"output\":") && line.ends_with("}") {
        return true;
    }
    if line.starts_with("{\"bytes_written\":") && line.ends_with("}") {
        return true;
    }
    if line.starts_with("{\"total_count\":") {
        return true;
    }
    if line.starts_with("{\"content\":") && line.contains("\"total_lines\"") {
        return true;
    }
    if line.starts_with("{\"session_id\":") && line.contains("\"pid\"") {
        return true;
    }

    // Lines that are just JSON array continuations
    if line.starts_with(", {\"name\":") || line.starts_with(",{\"name\":") {
        return true;
    }
    if line.starts_with(", {\"session_id\":") || line.starts_with(",{\"session_id\":") {
        return true;
    }

    // File content dumps - lines with line number prefixes like " 501|"
    if line.contains("|") && line.trim().chars().next().map(|c| c.is_numeric()).unwrap_or(false) {
        // Check if it looks like a file dump (number|number|content pattern)
        let parts: Vec<&str> = line.splitn(3, '|').collect();
        if parts.len() >= 2 && parts[0].trim().parse::<u32>().is_ok() {
            return true;
        }
    }

    false
}

/// Check if a line is a JSON fragment that should be removed
fn is_json_fragment(line: &str) -> bool {
    // Lines like ": 0, \"error\": null}"
    if line.starts_with(": ") && line.contains("\"error\":") {
        return true;
    }

    // Lines that are just closing braces with error
    if line == "}" || line.starts_with(": 0, \"error\"") || line.starts_with(": 1, \"error\"") {
        return true;
    }

    // Truncated JSON lines
    if line == "{\"total_count\"" || line == "{\"output\"" {
        return true;
    }

    // Lines with just JSON field fragments
    if line.starts_with("\"error\":") && line.ends_with("}") {
        return true;
    }

    // JSON metadata lines (from file read outputs)
    if line.contains("\"total_lines\":") || line.contains("\"file_size\":") {
        return true;
    }
    if line.contains("\"truncated\":") || line.contains("\"hint\":") {
        return true;
    }
    if line.contains("\"is_binary\":") || line.contains("\"is_image\":") {
        return true;
    }

    false
}

/// Remove lines containing a specific pattern
fn remove_lines_containing(content: &str, pattern: &str) -> String {
    content
        .lines()
        .filter(|line| !line.contains(pattern))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Remove lines starting with a specific pattern
fn remove_lines_starting_with(content: &str, pattern: &str) -> String {
    content
        .lines()
        .filter(|line| !line.trim().starts_with(pattern))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Delete a session
#[tauri::command]
pub fn delete_session(id: String) -> Result<(), String> {
    exec_db(
        "DELETE FROM messages WHERE session_id = ?",
        &[serde_json::json!(id)],
    )?;
    exec_db(
        "DELETE FROM sessions WHERE id = ?",
        &[serde_json::json!(id)],
    )?;

    println!("[Sessions] Deleted session: {}", id);
    Ok(())
}

/// Get sessions directory path
#[tauri::command]
pub fn get_sessions_path() -> String {
    "~/.hermes/sessions".to_string()
}

/// Update session title (name)
#[tauri::command]
pub fn update_session_title(id: String, title: String) -> Result<(), String> {
    println!("[Sessions] Updating title for session {}: {}", id, title);

    exec_db(
        "UPDATE sessions SET title = ? WHERE id = ?",
        &[serde_json::json!(title), serde_json::json!(id)],
    )?;

    println!("[Sessions] Updated title for session: {}", id);
    Ok(())
}

/// Search sessions by text content in messages
#[tauri::command]
pub fn search_sessions(
    q: String,
    platform: Option<String>,
    days: Option<u64>,
) -> Result<SearchResults, String> {
    println!(
        "[Sessions] Searching for: \"{}\" (platform: {:?}, days: {:?})",
        q, platform, days
    );

    // Build the SQL query with filters
    let mut conditions = vec![r#"m.content LIKE '%' || ? || '%'"#.to_string()];
    let mut params: Vec<serde_json::Value> = vec![serde_json::json!(q)];

    if let Some(ref p) = platform {
        conditions.push("s.source = ?".to_string());
        params.push(serde_json::json!(p));
    }

    if let Some(d) = days {
        conditions.push("s.started_at >= strftime('%s', 'now', '-' || ? || ' days')".to_string());
        params.push(serde_json::json!(d.to_string()));
    }

    let where_clause = conditions.join(" AND ");

    // Count total matching results
    let count_sql = format!(
        r#"SELECT COUNT(DISTINCT s.id) as total
           FROM sessions s
           JOIN messages m ON m.session_id = s.id
           WHERE {}"#,
        where_clause
    );
    let count_rows = query_db(&count_sql, &params)?;
    let total = count_rows
        .first()
        .and_then(|row| row.get("total"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as usize;

    // Fetch results with LIMIT
    let sql = format!(
        r#"SELECT DISTINCT s.id, s.source, s.started_at, s.title,
           SUBSTR(m.content, 1, 200) as matched_content
           FROM sessions s
           JOIN messages m ON m.session_id = s.id
           WHERE {}
           ORDER BY s.started_at DESC
           LIMIT 50"#,
        where_clause
    );

    let rows = query_db(&sql, &params)?;

    let results: Vec<serde_json::Value> = rows
        .into_iter()
        .filter_map(|row| {
            let session_id = row.get("id")?.as_str()?.to_string();
            let platform = row
                .get("source")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let started_at = row
                .get("started_at")
                .and_then(|v| v.as_f64())
                .map(timestamp_to_iso)
                .unwrap_or_default();
            let context = row
                .get("matched_content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            // Relevance score: exact matches score higher
            let q_lower = q.to_lowercase();
            let context_lower = context.to_lowercase();
            let relevance_score = if context_lower.starts_with(&q_lower) {
                0.95
            } else if context_lower.contains(&q_lower) {
                0.75
            } else {
                0.5
            };

            Some(serde_json::json!({
                "session_id": session_id,
                "platform": platform,
                "matched_at": started_at,
                "context": context,
                "relevance_score": relevance_score
            }))
        })
        .collect();

    println!(
        "[Sessions] Found {} results for query: \"{}\" (total: {})",
        results.len(),
        q,
        total
    );
    Ok(SearchResults { results, total })
}

/// Export a session in the specified format
#[tauri::command]
pub fn export_session(format: String, session_id: String) -> Result<String, String> {
    println!("[Sessions] Exporting session {} as {}", session_id, format);

    // Fetch session data
    let sql = "SELECT * FROM sessions WHERE id = ?";
    let rows = query_db(sql, &[serde_json::json!(session_id)])?;
    let session = rows
        .into_iter()
        .next()
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    // Fetch messages
    let msg_sql = "SELECT role, content, timestamp, tool_calls FROM messages WHERE session_id = ? ORDER BY timestamp ASC";
    let messages = query_db(msg_sql, &[serde_json::json!(session_id)])?;

    match format.as_str() {
        "json" => {
            // Single JSON object with session + messages
            let export = serde_json::json!({
                "session": session,
                "messages": messages
            });
            serde_json::to_string_pretty(&export).map_err(|e| format!("Failed to serialize: {}", e))
        }
        "jsonl" => {
            // One JSON object per line: first line = session, rest = messages
            let mut lines = Vec::new();
            lines.push(
                serde_json::to_string(&session)
                    .map_err(|e| format!("Failed to serialize session: {}", e))?,
            );
            for msg in &messages {
                lines.push(
                    serde_json::to_string(msg)
                        .map_err(|e| format!("Failed to serialize message: {}", e))?,
                );
            }
            Ok(lines.join("\n"))
        }
        "markdown" => {
            // Human-readable markdown
            let mut md = String::new();
            md.push_str(&format!("# Session: {}\n\n", session_id));
            md.push_str(&format!(
                "- **Platform**: {}\n",
                session
                    .get("source")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
            ));
            md.push_str(&format!(
                "- **Started**: {}\n",
                session
                    .get("started_at")
                    .and_then(|v| v.as_f64())
                    .map(timestamp_to_iso)
                    .unwrap_or_default()
            ));
            if let Some(title) = session.get("title").and_then(|v| v.as_str()) {
                if !title.is_empty() {
                    md.push_str(&format!("- **Title**: {}\n", title));
                }
            }
            md.push('\n');

            md.push_str("## Messages\n\n");
            for msg in &messages {
                let role = msg
                    .get("role")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
                let timestamp = msg
                    .get("timestamp")
                    .and_then(|v| v.as_f64())
                    .map(timestamp_to_iso)
                    .unwrap_or_default();

                md.push_str(&format!("### {} ({})\n\n", role, timestamp));
                md.push_str(&format!("{}\n\n", content));
            }

            Ok(md)
        }
        _ => Err(format!("Unsupported export format: {}", format)),
    }
}

// ============================================
// Checkpoint Commands
// ============================================

/// Checkpoint metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub id: String,
    pub session_id: String,
    pub name: Option<String>,
    pub created_at: String,
    pub message_count: usize,
    pub size_bytes: u64,
    pub description: Option<String>,
}

/// Checkpoint list response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointListResponse {
    pub checkpoints: Vec<Checkpoint>,
    pub total: usize,
}

/// Restore checkpoint result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreCheckpointResult {
    pub success: bool,
    pub session_id: String,
    pub checkpoint_id: String,
    pub restored_at: String,
    pub message_count: usize,
}

/// Get checkpoints directory path via WSL
fn get_checkpoints_dir() -> Result<String, String> {
    let script = r#"python3 -c '
import os
print(os.path.expanduser("~/.hermes/checkpoints"))
'"#;

    let output = create_command("wsl")
        .args(["bash", "-c", script])
        .output()
        .map_err(|e| format!("Failed to get checkpoints dir: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err("Failed to get checkpoints directory".to_string())
    }
}

/// Ensure checkpoints directory exists
fn ensure_checkpoints_dir() -> Result<String, String> {
    let dir = get_checkpoints_dir()?;

    let script = format!(
        r#"python3 -c '
import os
os.makedirs("{}", exist_ok=True)
print("ok")
'"#,
        dir
    );

    let output = create_command("wsl")
        .args(["bash", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to create checkpoints dir: {}", e))?;

    if output.status.success() {
        Ok(dir)
    } else {
        Err("Failed to create checkpoints directory".to_string())
    }
}

/// Generate a unique checkpoint ID
fn generate_checkpoint_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    format!("cp_{}", timestamp)
}

/// List all checkpoints for a session
#[tauri::command]
pub fn list_checkpoints(session_id: String) -> Result<CheckpointListResponse, String> {
    println!("[Checkpoints] Listing checkpoints for session: {}", session_id);

    let dir = get_checkpoints_dir()?;

    // Use base64 to avoid shell injection
    let session_id_b64 = STANDARD.encode(&session_id);

    // List checkpoint files for this session
    let script = format!(
        r#"python3 -c '
import os, json, glob, base64

session_id = base64.b64decode("{}").decode("utf-8")
pattern = os.path.join("{}", f"{{session_id}}_*.json")
files = sorted(glob.glob(pattern), key=os.path.getmtime, reverse=True)

checkpoints = []
for f in files:
    try:
        with open(f, "r") as fp:
            data = json.load(fp)
            data["size_bytes"] = os.path.getsize(f)
            checkpoints.append(data)
    except:
        pass

print(json.dumps({{"checkpoints": checkpoints, "total": len(checkpoints)}}))
'"#,
        session_id_b64, dir
    );

    let output = create_command("wsl")
        .args(["bash", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to list checkpoints: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to list checkpoints: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();

    if trimmed.is_empty() {
        return Ok(CheckpointListResponse {
            checkpoints: vec![],
            total: 0,
        });
    }

    let response: serde_json::Value =
        serde_json::from_str(trimmed).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let checkpoints: Vec<Checkpoint> = response
        .get("checkpoints")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect()
        })
        .unwrap_or_default();

    let total = response
        .get("total")
        .and_then(|v| v.as_u64())
        .unwrap_or(checkpoints.len() as u64) as usize;

    println!(
        "[Checkpoints] Found {} checkpoints for session {}",
        checkpoints.len(),
        session_id
    );

    Ok(CheckpointListResponse { checkpoints, total })
}

/// Create a checkpoint for a session
#[tauri::command]
pub fn create_checkpoint(
    session_id: String,
    name: Option<String>,
    description: Option<String>,
) -> Result<Checkpoint, String> {
    println!(
        "[Checkpoints] Creating checkpoint for session: {} (name: {:?})",
        session_id, name
    );

    let dir = ensure_checkpoints_dir()?;
    let checkpoint_id = generate_checkpoint_id();
    let created_at = chrono::Utc::now().to_rfc3339();

    // Fetch session messages
    let messages_sql = r#"
        SELECT role, content, timestamp, tool_calls, reasoning
        FROM messages
        WHERE session_id = ?
        ORDER BY timestamp ASC
    "#;

    let messages = query_db(messages_sql, &[serde_json::json!(session_id)])?;

    let message_count = messages.len();

    // Create checkpoint data
    let checkpoint_data = serde_json::json!({
        "id": checkpoint_id,
        "session_id": session_id,
        "name": name,
        "created_at": created_at,
        "message_count": message_count,
        "description": description,
        "messages": messages
    });
    let checkpoint_data_b64 = STANDARD.encode(
        serde_json::to_string(&checkpoint_data)
            .map_err(|e| format!("Failed to serialize checkpoint: {}", e))?,
    );

    // Save checkpoint file
    let filename = format!("{}_{}.json", session_id, checkpoint_id);
    let filepath = format!("{}/{}", dir, filename);

    let script = format!(
        r#"python3 -c '
import base64, os, json

data = json.loads(base64.b64decode("{}").decode("utf-8"))
filepath = "{}"

with open(filepath, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

size = os.path.getsize(filepath)
print(json.dumps({{"ok": true, "size": size}}))
'"#,
        checkpoint_data_b64,
        filepath
    );

    let output = create_command("wsl")
        .args(["bash", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to create checkpoint: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to save checkpoint: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let size_response: serde_json::Value =
        serde_json::from_str(stdout.trim()).unwrap_or(serde_json::json!({"size": 0}));

    let size_bytes = size_response
        .get("size")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    println!(
        "[Checkpoints] Created checkpoint {} for session {} ({} messages, {} bytes)",
        checkpoint_id, session_id, message_count, size_bytes
    );

    Ok(Checkpoint {
        id: checkpoint_id,
        session_id,
        name,
        created_at,
        message_count,
        size_bytes,
        description,
    })
}

/// Get checkpoint info
#[tauri::command]
pub fn get_checkpoint_info(checkpoint_id: String) -> Result<Checkpoint, String> {
    println!("[Checkpoints] Getting checkpoint info: {}", checkpoint_id);

    let dir = get_checkpoints_dir()?;

    // Use base64 to avoid shell injection
    let checkpoint_id_b64 = STANDARD.encode(&checkpoint_id);

    // Find checkpoint file
    let script = format!(
        r#"python3 -c '
import os, json, glob, base64

checkpoint_id = base64.b64decode("{}").decode("utf-8")
pattern = os.path.join("{}", f"*_{{checkpoint_id}}.json")
files = glob.glob(pattern)

if not files:
    print(json.dumps({{"error": "Checkpoint not found"}}))
else:
    with open(files[0], "r") as f:
        data = json.load(f)
        data["size_bytes"] = os.path.getsize(files[0])
        del data["messages"]  # Remove messages from info
        print(json.dumps(data))
'"#,
        checkpoint_id_b64, dir
    );

    let output = create_command("wsl")
        .args(["bash", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to get checkpoint info: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to get checkpoint info: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();

    let data: serde_json::Value =
        serde_json::from_str(trimmed).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    if data.get("error").is_some() {
        return Err(format!("Checkpoint not found: {}", checkpoint_id));
    }

    let checkpoint: Checkpoint =
        serde_json::from_value(data).map_err(|e| format!("Failed to parse checkpoint: {}", e))?;

    Ok(checkpoint)
}

/// Restore a checkpoint
#[tauri::command]
pub fn restore_checkpoint(
    session_id: String,
    checkpoint_id: String,
) -> Result<RestoreCheckpointResult, String> {
    println!(
        "[Checkpoints] Restoring checkpoint {} for session {}",
        checkpoint_id, session_id
    );

    let dir = get_checkpoints_dir()?;

    // Use base64 to avoid shell injection
    let checkpoint_id_b64 = STANDARD.encode(&checkpoint_id);

    // Load checkpoint file
    let script = format!(
        r#"python3 -c '
import os, json, glob, base64

checkpoint_id = base64.b64decode("{}").decode("utf-8")
pattern = os.path.join("{}", f"*_{{checkpoint_id}}.json")
files = glob.glob(pattern)

if not files:
    print(json.dumps({{"error": "Checkpoint not found"}}))
else:
    with open(files[0], "r") as f:
        data = json.load(f)
        print(json.dumps(data))
'"#,
        checkpoint_id_b64, dir
    );

    let output = create_command("wsl")
        .args(["bash", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to load checkpoint: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to load checkpoint: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let data: serde_json::Value =
        serde_json::from_str(stdout.trim()).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    if data.get("error").is_some() {
        return Err(format!("Checkpoint not found: {}", checkpoint_id));
    }

    let messages = data
        .get("messages")
        .and_then(|v| v.as_array())
        .ok_or("No messages in checkpoint")?;

    // Delete existing messages for this session
    exec_db(
        "DELETE FROM messages WHERE session_id = ?",
        &[serde_json::json!(session_id)],
    )?;

    // Insert messages from checkpoint
    for msg in messages {
        let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("user");
        let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let timestamp = msg.get("timestamp").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let tool_calls = msg
            .get("tool_calls")
            .and_then(|v| serde_json::to_string(v).ok())
            .unwrap_or_default();
        let reasoning = msg.get("reasoning").and_then(|v| v.as_str()).unwrap_or("");

        exec_db(
            "INSERT INTO messages (session_id, role, content, timestamp, tool_calls, reasoning) VALUES (?, ?, ?, ?, ?, ?)",
            &[
                serde_json::json!(session_id),
                serde_json::json!(role),
                serde_json::json!(content),
                serde_json::json!(timestamp),
                serde_json::json!(tool_calls),
                serde_json::json!(reasoning),
            ],
        )?;
    }

    // Update session message count
    exec_db(
        "UPDATE sessions SET message_count = ? WHERE id = ?",
        &[
            serde_json::json!(messages.len()),
            serde_json::json!(session_id),
        ],
    )?;

    let restored_at = chrono::Utc::now().to_rfc3339();

    println!(
        "[Checkpoints] Restored {} messages for session {}",
        messages.len(),
        session_id
    );

    Ok(RestoreCheckpointResult {
        success: true,
        session_id,
        checkpoint_id,
        restored_at,
        message_count: messages.len(),
    })
}

/// Delete a checkpoint
#[tauri::command]
pub fn delete_checkpoint(checkpoint_id: String) -> Result<(), String> {
    println!("[Checkpoints] Deleting checkpoint: {}", checkpoint_id);

    let dir = get_checkpoints_dir()?;

    // Use base64 to avoid shell injection
    let checkpoint_id_b64 = STANDARD.encode(&checkpoint_id);

    let script = format!(
        r#"python3 -c '
import os, glob, base64

checkpoint_id = base64.b64decode("{}").decode("utf-8")
pattern = os.path.join("{}", f"*_{{checkpoint_id}}.json")
files = glob.glob(pattern)

for f in files:
    os.remove(f)

print("ok")
'"#,
        checkpoint_id_b64, dir
    );

    let output = create_command("wsl")
        .args(["bash", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to delete checkpoint: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to delete checkpoint: {}", stderr));
    }

    println!("[Checkpoints] Deleted checkpoint: {}", checkpoint_id);
    Ok(())
}

/// Cleanup result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResult {
    pub success: bool,
    pub messages_checked: usize,
    pub messages_updated: usize,
    pub chars_removed: usize,
}

/// Clean up all malformed content in the database
/// This runs the cleanup script to fix all historical messages
#[tauri::command]
pub fn cleanup_database_messages() -> Result<CleanupResult, String> {
    println!("[Sessions] Running database cleanup...");

    // Create the cleanup script in WSL
    let script_content = r#"
import sqlite3, re, os, json

def clean_message_content(content):
    if not content:
        return content
    result = content
    # Pattern 1: Generic malformed Markdown links [xxx](http://xxx)
    result = re.sub(r'\[[a-zA-Z_][\w.]*\]\(https?://[\w.]+\)', '', result)
    # Pattern 2: Variable-like patterns with dots
    result = re.sub(r'\[(?:msg|e|errors|sessionSearchResults|data|result|response|item|row|val|key|obj|arr|str|num|idx|index|count|len|length)[\w.]*\]\(https?://[\w.]+\)', '', result, flags=re.IGNORECASE)
    # Pattern 3: npm error lines
    result = re.sub(r'^npm error.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error.*$', '', result, flags=re.MULTILINE)
    # Pattern 4: File listing artifacts
    result = re.sub(r'^-rwxrwxrwx.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^drwxrwxrwx.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^total\s+\d+.*$', '', result, flags=re.MULTILINE)
    # Pattern 5: Tool execution messages
    result = re.sub(r'^Tool result:.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^Running tool:.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^Executing:.*$', '', result, flags=re.MULTILINE)
    # Pattern 6: JSON fragments
    result = re.sub(r'\{"output":\s*"[\s\S]*?",\s*"exit_code"', '', result)
    result = re.sub(r'\{"bytes_written":\s*\d+[\s\S]*?\}', '', result)
    result = re.sub(r'\{[\s\S]*?"output"[\s\S]*?\}', '', result)
    # Clean up whitespace
    result = re.sub(r'\n{3,}', '\n\n', result)
    return result.strip()

db_path = os.path.expanduser("~/.hermes/state.db")
if not os.path.exists(db_path):
    print(json.dumps({"error": "Database not found"}))
    exit(1)

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("SELECT id, content FROM messages ORDER BY timestamp ASC")
messages = cursor.fetchall()

updated_count = 0
chars_removed = 0

for msg in messages:
    original = msg["content"] or ""
    cleaned = clean_message_content(original)
    if cleaned != original:
        chars_removed += len(original) - len(cleaned)
        updated_count += 1
        cursor.execute("UPDATE messages SET content = ? WHERE id = ?", (cleaned, msg["id"]))

conn.commit()
conn.close()

print(json.dumps({
    "success": True,
    "messages_checked": len(messages),
    "messages_updated": updated_count,
    "chars_removed": chars_removed
}))
"#;

    // Execute the cleanup script
    let output = create_command("wsl")
        .args(["bash", "-c", &format!("python3 -c '{}'", script_content.replace('\n', " ").replace('\'', "'\\''"))])
        .output()
        .map_err(|e| format!("Failed to run cleanup: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Cleanup failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: serde_json::Value =
        serde_json::from_str(stdout.trim()).map_err(|e| format!("Failed to parse result: {}", e))?;

    if result.get("error").is_some() {
        return Err(result.get("error").and_then(|v| v.as_str()).unwrap_or("Unknown error").to_string());
    }

    println!("[Sessions] Database cleanup completed");

    Ok(CleanupResult {
        success: result.get("success").and_then(|v| v.as_bool()).unwrap_or(false),
        messages_checked: result.get("messages_checked").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
        messages_updated: result.get("messages_updated").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
        chars_removed: result.get("chars_removed").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
    })
}
