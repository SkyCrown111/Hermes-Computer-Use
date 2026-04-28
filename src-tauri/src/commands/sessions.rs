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

    // Try to parse as array of database-format tool calls
    let db_calls: Vec<DatabaseToolCall> = match serde_json::from_str(tool_calls_str) {
        Ok(calls) => calls,
        Err(_) => return None,
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

/// Session detail response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionDetail {
    pub session: Session,
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
pub fn get_session(id: String) -> Result<SessionDetail, String> {
    println!("[Sessions] Getting session: {}", id);

    // Get session info
    let session_sql = r#"
        SELECT
            id, source, model, started_at, ended_at, message_count,
            input_tokens, output_tokens, cache_read_tokens, reasoning_tokens,
            estimated_cost_usd, actual_cost_usd, end_reason, title
        FROM sessions
        WHERE id = ?
        "#;

    let session_rows = query_db(session_sql, &[serde_json::json!(id)])?;

    if session_rows.is_empty() {
        return Err(format!("Session not found: {}", id));
    }

    let row = &session_rows[0];

    let started_at = row
        .get("started_at")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let ended_at = row.get("ended_at").and_then(|v| v.as_f64());

    let session = Session {
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
        status: if ended_at.is_none() {
            "active"
        } else {
            "completed"
        }
        .to_string(),
    };

    // Get messages
    let messages_sql = r#"
        SELECT role, content, timestamp, tool_calls, reasoning
        FROM messages
        WHERE session_id = ?
        ORDER BY timestamp ASC
        LIMIT 200
        "#;

    let message_rows = query_db(messages_sql, &[serde_json::json!(id)])?;

    let messages: Vec<SessionMessage> = message_rows
        .iter()
        .map(|row| {
            let timestamp = row.get("timestamp").and_then(|v| v.as_f64()).unwrap_or(0.0);

            let tool_calls_str = row.get("tool_calls").and_then(|v| v.as_str()).unwrap_or("");

            let tool_calls = parse_tool_calls(tool_calls_str);

            // Get reasoning content
            let reasoning = row
                .get("reasoning")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());

            SessionMessage {
                role: row
                    .get("role")
                    .and_then(|v| v.as_str())
                    .unwrap_or("user")
                    .to_string(),
                content: row
                    .get("content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                timestamp: timestamp_to_iso(timestamp),
                tool_calls,
                reasoning,
            }
        })
        .collect();

    println!("[Sessions] Session {} has {} messages", id, messages.len());

    Ok(SessionDetail { session, messages })
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
