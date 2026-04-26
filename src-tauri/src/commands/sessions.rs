//! Session Commands
//!
//! Commands for managing Hermes Agent sessions.
//! Queries the Hermes SQLite database directly via WSL.

use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use super::utils::create_command;

/// Session metadata - matches frontend Session type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub platform: String,
    pub chat_id: String,
    pub chat_name: String,
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
                let args: serde_json::Value = serde_json::from_str(&f.arguments)
                    .unwrap_or_else(|_| serde_json::json!({}));
                ToolCall {
                    name: f.name,
                    args,
                }
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
    let params_json = serde_json::to_string(params)
        .map_err(|e| format!("Failed to serialize params: {}", e))?;
    let params_b64 = STANDARD.encode(params_json);

    // Escape single quotes for the shell-embedded Python string
    let escaped_sql = sql.replace('\n', " ").replace('\'', "'\\''");

    let script = format!(
        r#"python3 -c "
import sqlite3, json, os, base64
conn = sqlite3.connect(os.path.expanduser('~/.hermes/state.db'))
conn.row_factory = sqlite3.Row
cursor = conn.cursor()
params = json.loads(base64.b64decode('{}').decode())
cursor.execute('{}', params)
rows = cursor.fetchall()
result = [dict(row) for row in rows]
print(json.dumps(result))
conn.close()
"#,
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

    serde_json::from_str(trimmed)
        .map_err(|e| format!("Failed to parse JSON: {}", e))
}

/// Execute SQL via WSL Python with parameterized queries (no rows returned)
fn exec_db(sql: &str, params: &[serde_json::Value]) -> Result<(), String> {
    let params_json = serde_json::to_string(params)
        .map_err(|e| format!("Failed to serialize params: {}", e))?;
    let params_b64 = STANDARD.encode(params_json);
    let escaped_sql = sql.replace('\n', " ").replace('\'', "'\\''");

    let script = format!(
        r#"python3 -c "
import sqlite3, json, os, base64
conn = sqlite3.connect(os.path.expanduser('~/.hermes/state.db'))
cursor = conn.cursor()
params = json.loads(base64.b64decode('{}').decode())
cursor.execute('{}', params)
conn.commit()
conn.close()
print('ok')
"#,
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
        ("SELECT COUNT(*) as count FROM sessions WHERE source = ?".to_string(),
         vec![serde_json::json!(p)])
    } else {
        ("SELECT COUNT(*) as count FROM sessions".to_string(), vec![])
    };

    let rows = query_db(&sql, &params)?;
    
    if let Some(row) = rows.first() {
        let count = row.get("count")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize;
        Ok(count)
    } else {
        Ok(0)
    }
}

/// List all sessions from Hermes database
#[tauri::command]
pub fn list_sessions(platform: Option<String>, limit: Option<usize>, offset: Option<usize>) -> Result<SessionListResponse, String> {
    println!("[Sessions] Listing sessions from database (platform: {:?})...", platform);

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
            "#.to_string(),
            vec![serde_json::json!(p), serde_json::json!(limit), serde_json::json!(offset)],
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
            "#.to_string(),
            vec![serde_json::json!(limit), serde_json::json!(offset)],
        )
    };

    let rows = query_db(&sql, &params)?;

    let sessions: Vec<Session> = rows.iter().map(|row| {
        let started_at = row.get("started_at")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);

        let ended_at = row.get("ended_at")
            .and_then(|v| v.as_f64());

        let _end_reason = row.get("end_reason")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let status = if ended_at.is_none() { "active" } else { "completed" };

        Session {
            id: row.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            platform: row.get("source").and_then(|v| v.as_str()).unwrap_or("cli").to_string(),
            chat_id: "".to_string(),
            chat_name: row.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            started_at: timestamp_to_iso(started_at),
            last_activity_at: ended_at.map(timestamp_to_iso).unwrap_or_else(|| timestamp_to_iso(started_at)),
            message_count: row.get("message_count").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
            model: row.get("model").and_then(|v| v.as_str()).unwrap_or("unknown").to_string(),
            input_tokens: row.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
            output_tokens: row.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
            cache_read_tokens: row.get("cache_read_tokens").and_then(|v| v.as_u64()),
            reasoning_tokens: row.get("reasoning_tokens").and_then(|v| v.as_u64()),
            estimated_cost_usd: row.get("estimated_cost_usd").and_then(|v| v.as_f64()).unwrap_or(0.0),
            actual_cost_usd: row.get("actual_cost_usd").and_then(|v| v.as_f64()),
            status: status.to_string(),
        }
    }).collect();

    println!("[Sessions] Found {} sessions (total: {})", sessions.len(), total);
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

    let started_at = row.get("started_at")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let ended_at = row.get("ended_at")
        .and_then(|v| v.as_f64());

    let session = Session {
        id: row.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        platform: row.get("source").and_then(|v| v.as_str()).unwrap_or("cli").to_string(),
        chat_id: "".to_string(),
        chat_name: row.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        started_at: timestamp_to_iso(started_at),
        last_activity_at: ended_at.map(timestamp_to_iso).unwrap_or_else(|| timestamp_to_iso(started_at)),
        message_count: row.get("message_count").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
        model: row.get("model").and_then(|v| v.as_str()).unwrap_or("unknown").to_string(),
        input_tokens: row.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        output_tokens: row.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        cache_read_tokens: row.get("cache_read_tokens").and_then(|v| v.as_u64()),
        reasoning_tokens: row.get("reasoning_tokens").and_then(|v| v.as_u64()),
        estimated_cost_usd: row.get("estimated_cost_usd").and_then(|v| v.as_f64()).unwrap_or(0.0),
        actual_cost_usd: row.get("actual_cost_usd").and_then(|v| v.as_f64()),
        status: if ended_at.is_none() { "active" } else { "completed" }.to_string(),
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

    let messages: Vec<SessionMessage> = message_rows.iter().map(|row| {
        let timestamp = row.get("timestamp")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);

        let tool_calls_str = row.get("tool_calls")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let tool_calls = parse_tool_calls(tool_calls_str);

        // Get reasoning content
        let reasoning = row.get("reasoning")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        SessionMessage {
            role: row.get("role").and_then(|v| v.as_str()).unwrap_or("user").to_string(),
            content: row.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            timestamp: timestamp_to_iso(timestamp),
            tool_calls,
            reasoning,
        }
    }).collect();

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
pub fn search_sessions(q: String, platform: Option<String>, days: Option<u64>) -> Result<SearchResults, String> {
    println!("[Sessions] Searching for: \"{}\" (platform: {:?}, days: {:?})", q, platform, days);

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
    let total = count_rows.first()
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

    let results: Vec<serde_json::Value> = rows.into_iter().filter_map(|row| {
        let session_id = row.get("id")?.as_str()?.to_string();
        let platform = row.get("source").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
        let started_at = row.get("started_at").and_then(|v| v.as_f64()).map(timestamp_to_iso).unwrap_or_default();
        let context = row.get("matched_content").and_then(|v| v.as_str()).unwrap_or("").to_string();

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
    }).collect();

    println!("[Sessions] Found {} results for query: \"{}\" (total: {})", results.len(), q, total);
    Ok(SearchResults { results, total })
}

/// Export a session in the specified format
#[tauri::command]
pub fn export_session(format: String, session_id: String) -> Result<String, String> {
    println!("[Sessions] Exporting session {} as {}", session_id, format);

    // Fetch session data
    let sql = "SELECT * FROM sessions WHERE id = ?";
    let rows = query_db(sql, &[serde_json::json!(session_id)])?;
    let session = rows.into_iter().next().ok_or_else(|| format!("Session not found: {}", session_id))?;

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
            serde_json::to_string_pretty(&export)
                .map_err(|e| format!("Failed to serialize: {}", e))
        }
        "jsonl" => {
            // One JSON object per line: first line = session, rest = messages
            let mut lines = Vec::new();
            lines.push(serde_json::to_string(&session)
                .map_err(|e| format!("Failed to serialize session: {}", e))?);
            for msg in &messages {
                lines.push(serde_json::to_string(msg)
                    .map_err(|e| format!("Failed to serialize message: {}", e))?);
            }
            Ok(lines.join("\n"))
        }
        "markdown" => {
            // Human-readable markdown
            let mut md = String::new();
            md.push_str(&format!("# Session: {}\n\n", session_id));
            md.push_str(&format!("- **Platform**: {}\n", session.get("source").and_then(|v| v.as_str()).unwrap_or("unknown")));
            md.push_str(&format!("- **Started**: {}\n", session.get("started_at").and_then(|v| v.as_f64()).map(timestamp_to_iso).unwrap_or_default()));
            if let Some(title) = session.get("title").and_then(|v| v.as_str()) {
                if !title.is_empty() {
                    md.push_str(&format!("- **Title**: {}\n", title));
                }
            }
            md.push('\n');

            md.push_str("## Messages\n\n");
            for msg in &messages {
                let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("unknown");
                let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
                let timestamp = msg.get("timestamp").and_then(|v| v.as_f64()).map(timestamp_to_iso).unwrap_or_default();

                md.push_str(&format!("### {} ({})\n\n", role, timestamp));
                md.push_str(&format!("{}\n\n", content));
            }

            Ok(md)
        }
        _ => Err(format!("Unsupported export format: {}", format)),
    }
}
