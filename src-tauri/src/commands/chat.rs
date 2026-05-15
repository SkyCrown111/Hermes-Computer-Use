// Hermes Chat Proxy Commands
// Direct Hermes Agent calling with real-time streaming via Python wrapper

use super::utils::create_command;
use crate::hermes_adapter::resolve_environment;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::Stdio;
use std::sync::{Arc, LazyLock, Mutex, OnceLock};
use tauri::AppHandle;
use tauri::Emitter;

// Global state to track running chat processes by session ID
// Key: session_id, Value: process PID
static RUNNING_PROCESSES: LazyLock<Arc<Mutex<HashMap<String, u32>>>> =
    LazyLock::new(|| Arc::new(Mutex::new(HashMap::new())));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendChatMessageResponse {
    pub session_id: String,
    pub response: String,
    pub tool_calls_count: usize,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub estimated_cost_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayCommandResponse {
    pub ok: bool,
    pub status: String,
    pub message: Option<String>,
}

/// The stream_agent.py script content (embedded in binary)
const STREAM_AGENT_SCRIPT: &str = include_str!("../../scripts/stream_agent.py");

/// Cached result of ensure_scripts_installed to avoid repeated WSL checks
static SCRIPTS_INSTALL_CHECK: OnceLock<Result<(), String>> = OnceLock::new();

/// Initialize hermes-app scripts in user directory
fn ensure_scripts_installed() -> Result<(), String> {
    SCRIPTS_INSTALL_CHECK.get_or_init(|| {
        let env = resolve_environment().map_err(|e| e.to_string())?;
        let app_dir = &env.paths.app_dir;
        let script_path = format!("{app_dir}/stream_agent.py");
        // Create directory
        let mkdir_cmd = format!("mkdir -p '{}'", app_dir);
        create_command("wsl")
            .args(["-e", "bash", "-c", &mkdir_cmd])
            .output()
            .map_err(|e| format!("Failed to create directory: {}", e))?;

        // Check if file exists and skip if it does
        let check_cmd = format!("test -f '{}' && echo 'exists' || echo 'not_found'", script_path);
        let output = create_command("wsl")
            .args(["-e", "bash", "-c", &check_cmd])
            .output()
            .map_err(|e| format!("Failed to check script: {}", e))?;

        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if result == "exists" {
            println!("[ChatDirect] Script already installed");
            return Ok(());
        }

        // Write script using base64 encoding (most reliable)
        let encoded = STANDARD.encode(STREAM_AGENT_SCRIPT);
        let write_cmd = format!(
            "mkdir -p '{}' && echo '{}' | base64 -d > '{}'",
            app_dir, encoded, script_path
        );

        create_command("wsl")
            .args(["-e", "bash", "-c", &write_cmd])
            .output()
            .map_err(|e| format!("Failed to install script: {}", e))?;

        println!("[ChatDirect] Script installed to {}", script_path);
        Ok(())
    }).clone()
}

/// Find the Python executable path for running Hermes
/// Returns the Python command to use (with path if needed)
fn find_python_path() -> Result<String, String> {
    let env = resolve_environment().map_err(|e| e.to_string())?;
    env.runtime
        .python_path
        .ok_or_else(|| "No Python found in Hermes runtime. Please install Python or hermes-agent.".to_string())
}

/// Check if Hermes Agent runtime used by stream_agent.py is importable.
fn check_hermes_runtime_imports(python_path: &str) -> Result<bool, String> {
    let import_root = resolve_environment()
        .ok()
        .and_then(|env| env.runtime.import_root)
        .unwrap_or_else(|| "~/.hermes/hermes-agent/src".to_string());
    let script = r#"
import os
import sys

candidate_paths = [
    os.path.expanduser(__IMPORT_ROOT__),
    '/usr/local/lib/hermes-agent/src',
]
for path in candidate_paths:
    if path not in sys.path:
        sys.path.insert(0, path)

try:
    from run_agent import AIAgent
    from tools.terminal_tool import set_approval_callback
    print('available')
except Exception as exc:
    print(f'not_found:{type(exc).__name__}:{exc}')
"#
    .replace("__IMPORT_ROOT__", &format!("{import_root:?}"));
    let encoded = STANDARD.encode(script);
    let check_cmd = format!("echo '{}' | base64 -d | {} -", encoded, python_path);

    let output = create_command("wsl")
        .args(["-e", "bash", "-c", &check_cmd])
        .output()
        .map_err(|e| format!("Failed to check Hermes runtime imports: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if output.status.success() && stdout == "available" {
        println!("[ChatDirect] Hermes Agent runtime imports are available");
        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        println!(
            "[ChatDirect] Hermes Agent runtime imports unavailable: stdout='{}' stderr='{}'",
            stdout, stderr
        );
        Ok(false)
    }
}

/// Check if WSL is available on the system
fn check_wsl_available() -> bool {
    #[cfg(windows)]
    {
        create_command("wsl")
            .args(["--status"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        true // On non-Windows, we don't need WSL
    }
}

/// Check if Hermes Agent is available for the actual streaming path.
/// This validates the Python runtime and imports used by stream_agent.py instead of only checking a CLI binary.
/// Returns a JSON object `{ status: string }` so the frontend can match on known values.
#[tauri::command(rename_all = "snake_case")]
pub fn check_hermes_health() -> Result<serde_json::Value, String> {
    println!("[ChatDirect] Checking Hermes Agent runtime availability...");

    #[cfg(windows)]
    {
        if !check_wsl_available() {
            println!("[ChatDirect] WSL is not available on this system");
            return Ok(serde_json::json!({ "status": "unhealthy" }));
        }
    }

    if let Err(e) = ensure_scripts_installed() {
        println!("[ChatDirect] Warning: Failed to install scripts: {}", e);
    }

    match resolve_environment() {
        Ok(env) => {
            let python_path = match env.runtime.python_path {
                Some(path) => path,
                None => return Ok(serde_json::json!({ "status": "unhealthy" })),
            };
            match check_hermes_runtime_imports(&python_path) {
                Ok(true) => Ok(serde_json::json!({ "status": "healthy" })),
                Ok(false) => Ok(serde_json::json!({ "status": "degraded" })),
                Err(e) => {
                    println!("[ChatDirect] Runtime import check failed: {}", e);
                    Ok(serde_json::json!({ "status": "unhealthy" }))
                }
            }
        }
        Err(e) => {
            println!("[ChatDirect] Python runtime not available: {}", e);
            Ok(serde_json::json!({ "status": "unhealthy" }))
        }
    }
}

/// Send a chat message (simple version)
/// Uses base64-encoded arguments passed via stdin to prevent shell injection.
#[tauri::command(rename_all = "snake_case")]
pub fn send_chat_message(
    messages: Vec<ChatMessage>,
    session_id: Option<String>,
) -> Result<SendChatMessageResponse, String> {
    println!(
        "[ChatDirect] Sending chat message ({} messages, session: {:?})",
        messages.len(),
        session_id
    );

    // Find the correct Python path
    let python_path = find_python_path()?;

    let query = messages
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.clone())
        .unwrap_or_else(|| "Hello".to_string());

    // Encode query and session_id as base64 to avoid shell injection
    // Use the stdin-based approach with stream_agent.py --stdin flag
    let env = resolve_environment().map_err(|e| e.to_string())?;
    let script_path = format!("{}/stream_agent.py", env.paths.app_dir);
    let cmd = format!(
        "{} '{}' --stdin",
        python_path, script_path
    );

    let stdin_json = serde_json::json!({
        "query": query,
        "session_id": session_id,
    });
    let stdin_data = stdin_json.to_string();

    let mut child = create_command("wsl")
        .args(["-e", "bash", "-c", &cmd])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Hermes: {}", e))?;

    // Write JSON payload to stdin
    {
        let mut stdin = child.stdin.take().expect("Failed to capture stdin");
        stdin
            .write_all(stdin_data.as_bytes())
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        stdin.flush().ok();
        // stdin is dropped here, closing the pipe
    }

    let output = child.wait_with_output()
        .map_err(|e| format!("Failed to read Hermes output: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    // Find DONE line and extract content
    for line in stdout.lines() {
        if let Some(stripped) = line.strip_prefix("DONE:") {
            let data: serde_json::Value = serde_json::from_str(stripped)
                .map_err(|e| format!("Failed to parse result: {}", e))?;
            let sid = data
                .get("session_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let content = data.get("content").and_then(|v| v.as_str()).unwrap_or("");
            return Ok(SendChatMessageResponse {
                session_id: sid.to_string(),
                response: content.to_string(),
                tool_calls_count: 0,
                input_tokens: 0,
                output_tokens: 0,
                estimated_cost_usd: 0.0,
            });
        }
    }

    Err("No response received".to_string())
}

/// Start Hermes Gateway (now just checks CLI)
#[tauri::command(rename_all = "snake_case")]
pub fn start_hermes_gateway() -> Result<GatewayCommandResponse, String> {
    let health = check_hermes_health()?;
    let status = health.get("status").and_then(|v| v.as_str()).unwrap_or("unhealthy");
    if status == "healthy" || status == "degraded" {
        return Ok(GatewayCommandResponse {
            ok: true,
            status: status.to_string(),
            message: Some(format!("Hermes CLI available (status: {}) - direct mode enabled", status)),
        });
    }
    Err("Hermes CLI not found".to_string())
}

/// Restart Hermes Gateway
#[tauri::command(rename_all = "snake_case")]
pub fn restart_hermes_gateway() -> Result<GatewayCommandResponse, String> {
    let response = start_hermes_gateway()?;
    Ok(GatewayCommandResponse {
        ok: response.ok,
        status: response.status,
        message: Some(response.message.unwrap_or_else(|| "Hermes gateway checked".to_string())),
    })
}

/// Stream a chat message (simple version)
#[tauri::command(rename_all = "snake_case")]
pub fn stream_chat_message(
    messages: Vec<ChatMessage>,
    session_id: Option<String>,
) -> Result<SendChatMessageResponse, String> {
    send_chat_message(messages, session_id)
}

/// Stream chat with real-time events - full streaming with tool/reasoning callbacks
/// Emits events: "chat:token", "chat:reasoning", "chat:tool", "chat:complete", "chat:error"
#[tauri::command(rename_all = "snake_case")]
pub async fn stream_chat_realtime(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    session_id: Option<String>,
    model_override: Option<serde_json::Value>,
) -> Result<String, String> {
    println!(
        "[ChatStream] Starting realtime stream, session: {:?}",
        session_id
    );
    println!("[ChatStream] Messages count: {}", messages.len());

    // Find the correct Python path before spawning blocking task
    let python_path = find_python_path()?;

    let query = messages
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.clone())
        .unwrap_or_else(|| "Hello".to_string());

    println!("[ChatStream] Query length: {} chars", query.len());

    // Build history from all messages except the last user message
    let history: Vec<serde_json::Value> = messages
        .iter()
        .rev()
        .skip(1) // Skip the last user message
        .rev() // Restore original order
        .map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": m.content
            })
        })
        .collect();

    println!("[ChatStream] History messages: {}", history.len());

    let app_clone = app.clone();
    let session_clone = session_id.clone();
    let env = resolve_environment().map_err(|e| e.to_string())?;
    let script_path = format!("{}/stream_agent.py", env.paths.app_dir);

    let handle = tokio::task::spawn_blocking(move || {
        // Clean up stale process entries before spawning a new one
        cleanup_stale_processes();

        // Build command to run stream_agent.py with --stdin flag
        let cmd_str = format!("{} '{}' --stdin", python_path, script_path);

        // Build JSON input for stdin
        let stdin_json = serde_json::json!({
            "query": query,
            "session_id": session_clone,
            "history": history,
            "model_override": model_override
        });
        let stdin_data = stdin_json.to_string();

        println!("[ChatStream] Executing: {}", cmd_str);
        println!("[ChatStream] Stdin data length: {} bytes", stdin_data.len());

        // Spawn process with stdin
        let mut child = create_command("wsl")
            .args(["-e", "bash", "-c", &cmd_str])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn Hermes: {}", e))?;

        // Store the process ID for potential abort
        let pid = child.id();
        let session_key = session_clone.clone().unwrap_or_else(|| "default".to_string());
        {
            let mut processes = RUNNING_PROCESSES
                .lock()
                .map_err(|e| format!("Failed to lock processes: {}", e))?;
            processes.insert(session_key.clone(), pid);
            println!("[ChatStream] Stored process PID: {} for session: {}", pid, session_key);
        }

        // Write JSON to stdin then close it (signals EOF to child)
        {
            let mut stdin = child.stdin.take().expect("Failed to capture stdin");
            stdin
                .write_all(stdin_data.as_bytes())
                .map_err(|e| format!("Failed to write to stdin: {}", e))?;
            stdin.flush().ok();
            // stdin is dropped here, closing the pipe
        }

        let stdout = child.stdout.take().expect("Failed to capture stdout");
        let reader = BufReader::new(stdout);

        let mut session_id_result = String::new();
        let mut accumulated_content = String::new();
        let mut accumulated_reasoning = String::new();
        let mut done_received: Option<String> = None;

        // Maximum content size to prevent memory issues (10MB)
        const MAX_CONTENT_SIZE: usize = 10 * 1024 * 1024;

        // Read output line by line and emit events
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    let trimmed = text.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    println!("[ChatStream] Line: {}", trimmed);

                    // Parse event type from prefix using unified message protocol
                    // Supported prefixes: STATUS, TOKEN, REASONING, TOOL, APPROVAL, CLARIFY, SECRET, SESSION, USAGE, DONE, ERROR
                    if let Some(status_json) = trimmed.strip_prefix("STATUS:") {
                        if let Ok(status_data) = serde_json::from_str::<serde_json::Value>(status_json)
                        {
                            let _ = app_clone.emit("chat:status", status_data);
                        }
                    } else if let Some(token) = trimmed.strip_prefix("TOKEN:") {
                        // Limit content size to prevent memory issues
                        if accumulated_content.len() + token.len() <= MAX_CONTENT_SIZE {
                            accumulated_content.push_str(token);
                        } else if accumulated_content.len() < MAX_CONTENT_SIZE {
                            // Truncate to fit
                            let remaining = MAX_CONTENT_SIZE - accumulated_content.len();
                            accumulated_content.push_str(&token[..remaining.min(token.len())]);
                        }
                        let _ = app_clone.emit(
                            "chat:chunk",
                            serde_json::json!({
                                "content": token,
                                "accumulated": accumulated_content.clone()
                            }),
                        );
                    } else if let Some(reasoning) = trimmed.strip_prefix("REASONING:") {
                        // Limit reasoning size to prevent memory issues
                        if accumulated_reasoning.len() + reasoning.len() <= MAX_CONTENT_SIZE {
                            accumulated_reasoning.push_str(reasoning);
                        } else if accumulated_reasoning.len() < MAX_CONTENT_SIZE {
                            let remaining = MAX_CONTENT_SIZE - accumulated_reasoning.len();
                            accumulated_reasoning
                                .push_str(&reasoning[..remaining.min(reasoning.len())]);
                        }
                        let _ = app_clone.emit(
                            "chat:reasoning",
                            serde_json::json!({
                                "text": reasoning,
                                "accumulated": accumulated_reasoning.clone()
                            }),
                        );
                    } else if let Some(tool_json) = trimmed.strip_prefix("TOOL:") {
                        if let Ok(tool_data) = serde_json::from_str::<serde_json::Value>(tool_json)
                        {
                            let _ = app_clone.emit("chat:tool", tool_data);
                        }
                    } else if let Some(approval_json) = trimmed.strip_prefix("APPROVAL:") {
                        if let Ok(approval_data) =
                            serde_json::from_str::<serde_json::Value>(approval_json)
                        {
                            let _ = app_clone.emit("chat:approval", approval_data);
                        }
                    } else if let Some(clarify_json) = trimmed.strip_prefix("CLARIFY:") {
                        if let Ok(clarify_data) =
                            serde_json::from_str::<serde_json::Value>(clarify_json)
                        {
                            let _ = app_clone.emit("chat:clarify", clarify_data);
                        }
                    } else if let Some(secret_json) = trimmed.strip_prefix("SECRET:") {
                        if let Ok(secret_data) =
                            serde_json::from_str::<serde_json::Value>(secret_json)
                        {
                            let _ = app_clone.emit("chat:secret", secret_data);
                        }
                    } else if let Some(usage_json) = trimmed.strip_prefix("USAGE:") {
                        if let Ok(usage_data) =
                            serde_json::from_str::<serde_json::Value>(usage_json)
                        {
                            let _ = app_clone.emit("chat:usage", usage_data);
                        }
                    } else if let Some(session_json) = trimmed.strip_prefix("SESSION:") {
                        if let Ok(session_data) =
                            serde_json::from_str::<serde_json::Value>(session_json)
                        {
                            let _ = app_clone.emit("chat:session", session_data);
                        }
                    } else if let Some(result_json) = trimmed.strip_prefix("DONE:") {
                        done_received = Some(result_json.to_string());
                        println!("[ChatStream] DONE received ({} bytes)", result_json.len());
                        if let Ok(result) = serde_json::from_str::<serde_json::Value>(result_json) {
                            session_id_result = result
                                .get("session_id")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();

                            // Try to get content from result, then from messages, then from accumulated
                            let content = result
                                .get("content")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                                .filter(|s| !s.is_empty())
                                .or_else(|| {
                                    // Try to extract from messages array
                                    result.get("messages")
                                        .and_then(|v| v.as_array())
                                        .and_then(|msgs| msgs.iter().rev().find(|m| m.get("role").and_then(|r| r.as_str()) == Some("assistant")))
                                        .and_then(|m| m.get("content").and_then(|c| c.as_str()))
                                        .map(|s| s.to_string())
                                })
                                .unwrap_or_else(|| accumulated_content.clone());

                            println!("[ChatStream] Session ID: {}", session_id_result);
                            println!("[ChatStream] Final content length: {}", content.len());

                            // Emit complete (usage is emitted separately by Python via USAGE: prefix)
                            let _ = app_clone.emit(
                                "chat:complete",
                                serde_json::json!({
                                    "id": session_id_result.clone(),
                                    "content": content,
                                    "reasoning": accumulated_reasoning.clone()
                                }),
                            );
                        }
                    } else if let Some(error_msg) = trimmed.strip_prefix("ERROR:") {
                        let _ = app_clone.emit(
                            "chat:error",
                            serde_json::json!({
                                "error": error_msg
                            }),
                        );
                        return Err(error_msg.to_string());
                    }
                }
                Err(e) => {
                    println!("[ChatStream] Error reading: {}", e);
                    break;
                }
            }
        }

        // reader is consumed by .lines() above, pipe is closed.
        // Wait for process and capture stderr
        let status = child.wait().map_err(|e| format!("Failed to wait: {}", e))?;

        // Clear the process ID for this session
        {
            let mut processes = RUNNING_PROCESSES
                .lock()
                .map_err(|e| format!("Failed to lock processes: {}", e))?;
            processes.remove(&session_key);
            println!("[ChatStream] Cleared process PID for session: {}", session_key);
        }

        if !status.success() {
            // Try to read stderr for more detailed error
            let stderr = if let Some(stderr_handle) = child.stderr.take() {
                use std::io::Read;
                let mut stderr_output = String::new();
                let _ = BufReader::new(stderr_handle).read_to_string(&mut stderr_output);
                stderr_output
            } else {
                String::new()
            };

            let error_msg = if !stderr.trim().is_empty() {
                format!("Process failed: {}", stderr.trim())
            } else {
                "Process failed - check if Python/hermes-agent is installed in WSL".to_string()
            };

            println!("[ChatStream] Process failed with stderr: {}", stderr);
            let _ = app_clone.emit(
                "chat:error",
                serde_json::json!({
                    "error": error_msg.clone()
                }),
            );
            return Err(error_msg);
        }

        // If DONE: was never received but process exited successfully,
        // emit a completion event with whatever content was accumulated
        if done_received.is_none() {
            println!("[ChatStream] Process exited successfully but DONE: was not received. Emitting fallback completion.");
            let content = if !accumulated_content.is_empty() {
                accumulated_content.clone()
            } else {
                "No response received.".to_string()
            };
            let _ = app_clone.emit(
                "chat:complete",
                serde_json::json!({
                    "id": session_id_result.clone(),
                    "content": content,
                    "reasoning": accumulated_reasoning.clone()
                }),
            );
        }

        Ok(session_id_result)
    });

    handle.await.map_err(|e| format!("Task error: {}", e))?
}

/// Respond to an approval request
#[tauri::command(rename_all = "snake_case")]
pub fn respond_approval(approval_id: String, choice: String) -> Result<(), String> {
    println!(
        "[Approval] Responding to approval {}: {}",
        approval_id, choice
    );

    // Validate approval_id to prevent shell injection (only allow safe chars)
    if approval_id
        .chars()
        .any(|c| !c.is_alphanumeric() && c != '-' && c != '_')
    {
        return Err("Invalid approval_id".to_string());
    }

    let response = serde_json::json!({ "choice": choice });
    let encoded = STANDARD.encode(response.to_string());
    let response_cmd = format!(
        "mkdir -p ~/.hermes/approvals && echo '{}' | base64 -d > ~/.hermes/approvals/{}.response",
        encoded, approval_id
    );

    let output = create_command("wsl")
        .args(["-e", "bash", "-c", &response_cmd])
        .output()
        .map_err(|e| format!("Failed to write approval response: {}", e))?;

    if !output.status.success() {
        return Err("Failed to write approval response".to_string());
    }

    Ok(())
}

/// Respond to a clarify question
#[tauri::command(rename_all = "snake_case")]
pub fn respond_clarify(clarify_id: String, answer: String) -> Result<(), String> {
    println!(
        "[Clarify] Responding to clarify {}: {}",
        clarify_id, answer
    );

    // Validate clarify_id to prevent shell injection (only allow safe chars)
    if clarify_id
        .chars()
        .any(|c| !c.is_alphanumeric() && c != '-' && c != '_')
    {
        return Err("Invalid clarify_id".to_string());
    }

    let response = serde_json::json!({ "answer": answer });
    let encoded = STANDARD.encode(response.to_string());
    let response_cmd = format!(
        "mkdir -p ~/.hermes/clarify && echo '{}' | base64 -d > ~/.hermes/clarify/{}.response",
        encoded, clarify_id
    );

    let output = create_command("wsl")
        .args(["-e", "bash", "-c", &response_cmd])
        .output()
        .map_err(|e| format!("Failed to write clarify response: {}", e))?;

    if !output.status.success() {
        return Err("Failed to write clarify response".to_string());
    }

    Ok(())
}

/// Respond to a secret capture request
#[tauri::command(rename_all = "snake_case")]
pub fn respond_secret(secret_id: String, value: String) -> Result<(), String> {
    println!(
        "[Secret] Responding to secret {}: {}",
        secret_id,
        if value.is_empty() { "(skipped)" } else { "***" }
    );

    // Validate secret_id to prevent shell injection (only allow safe chars)
    if secret_id
        .chars()
        .any(|c| !c.is_alphanumeric() && c != '-' && c != '_')
    {
        return Err("Invalid secret_id".to_string());
    }

    let response = serde_json::json!({ "value": value });
    let encoded = STANDARD.encode(response.to_string());
    let response_cmd = format!(
        "mkdir -p ~/.hermes/secrets && echo '{}' | base64 -d > ~/.hermes/secrets/{}.response",
        encoded, secret_id
    );

    let output = create_command("wsl")
        .args(["-e", "bash", "-c", &response_cmd])
        .output()
        .map_err(|e| format!("Failed to write secret response: {}", e))?;

    if !output.status.success() {
        return Err("Failed to write secret response".to_string());
    }

    Ok(())
}

/// Stream chat with progress (legacy)
#[tauri::command(rename_all = "snake_case")]
pub async fn stream_chat_with_progress(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    session_id: Option<String>,
    model_override: Option<serde_json::Value>,
) -> Result<String, String> {
    let result = stream_chat_realtime(app, messages, session_id, model_override).await?;
    Ok(result)
}

/// Abort the currently running chat stream.
/// If `session_id` is provided, only kills the process for that session.
/// Otherwise, kills all running chat processes.
#[tauri::command(rename_all = "snake_case")]
pub fn abort_chat(session_id: Option<String>) -> Result<(), String> {
    println!("[ChatAbort] Attempting to abort chat, session_id: {:?}", session_id);

    let mut processes = RUNNING_PROCESSES
        .lock()
        .map_err(|e| format!("Failed to lock processes: {}", e))?;

    let pids: Vec<(String, u32)> = if let Some(sid) = session_id {
        // Only kill the specific session
        if let Some(pid) = processes.remove(&sid) {
            vec![(sid, pid)]
        } else {
            println!("[ChatAbort] No running process for session: {}", sid);
            return Ok(());
        }
    } else {
        // Kill all running processes
        processes.drain().collect()
    };

    if pids.is_empty() {
        println!("[ChatAbort] No running processes to abort");
        return Ok(());
    }

    for (sid, pid) in &pids {
        println!("[ChatAbort] Killing process PID: {} for session: {}", pid, sid);
        match kill_process(*pid) {
            Ok(()) => println!("[ChatAbort] Process killed successfully"),
            Err(e) => println!("[ChatAbort] Failed to kill process: {}", e),
        }
    }

    println!("[ChatAbort] Aborted {} process(es)", pids.len());
    Ok(())
}

/// Kill a process by PID (cross-platform)
fn kill_process(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        let output = create_command("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output()
            .map_err(|e| format!("Failed to kill process: {}", e))?;
        if !output.status.success() {
            return Err(format!("taskkill failed: {}", String::from_utf8_lossy(&output.stderr)));
        }
    }
    #[cfg(not(windows))]
    {
        let output = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .map_err(|e| format!("Failed to kill process: {}", e))?;
        if !output.status.success() {
            return Err("kill failed".to_string());
        }
    }
    Ok(())
}

/// Interrupt a specific session by ID
#[tauri::command(rename_all = "snake_case")]
pub fn interrupt_session(session_id: String) -> Result<(), String> {
    println!("[ChatInterrupt] Interrupting session: {}", session_id);

    let mut processes = RUNNING_PROCESSES
        .lock()
        .map_err(|e| format!("Failed to lock processes: {}", e))?;

    if let Some(pid) = processes.remove(&session_id) {
        println!("[ChatInterrupt] Killing process with PID: {} for session: {}", pid, session_id);
        kill_process(pid)?;
        println!("[ChatInterrupt] Session {} interrupted successfully", session_id);
    } else {
        println!("[ChatInterrupt] No running process for session {}", session_id);
    }

    Ok(())
}

/// Clean up stale entries from RUNNING_PROCESSES.
/// Removes entries whose processes have already exited, preventing stale PID accumulation.
/// Called periodically or before new process creation.
pub fn cleanup_stale_processes() {
    let mut processes = match RUNNING_PROCESSES.lock() {
        Ok(p) => p,
        Err(_) => return,
    };

    let stale_keys: Vec<String> = processes
        .iter()
        .filter(|(_, pid)| {
            // Check if the process is still running.
            // The PIDs stored are the Windows-side PIDs of the wsl.exe process tree.
            #[cfg(windows)]
            {
                // Use std::process::Command directly �?tasklist is a native Windows command,
                // not a WSL command, so it must not go through create_command.
                let check = std::process::Command::new("tasklist")
                    .args(["/FI", &format!("PID eq {}", pid), "/NH"])
                    .output();
                match check {
                    Ok(output) => {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        // If the PID appears in tasklist output, process is still alive
                        !stdout.contains(&pid.to_string())
                    }
                    Err(_) => true, // Assume stale if we can't check
                }
            }
            #[cfg(not(windows))]
            {
                // On Linux/macOS, use kill -0 to check if process exists
                std::process::Command::new("kill")
                    .args(["-0", &pid.to_string()])
                    .output()
                    .map(|o| !o.status.success())
                    .unwrap_or(true)
            }
        })
        .map(|(k, _)| k.clone())
        .collect();

    for key in &stale_keys {
        if let Some(pid) = processes.remove(key) {
            println!("[ChatCleanup] Removed stale entry: session={}, pid={}", key, pid);
        }
    }

    if !stale_keys.is_empty() {
        println!("[ChatCleanup] Cleaned up {} stale process entr(ies)", stale_keys.len());
    }
}
