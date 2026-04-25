// Hermes Chat Proxy Commands
// Direct Hermes Agent calling with real-time streaming via Python wrapper

use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader, Write};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri::Emitter;
use base64::{Engine as _, engine::general_purpose::STANDARD};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// Global state to track running chat processes
// Key: session_id (or empty string for single session), Value: process handle
lazy_static::lazy_static! {
    static ref RUNNING_PROCESSES: Arc<Mutex<Option<u32>>> = Arc::new(Mutex::new(None));
}

#[cfg(windows)]
fn create_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[cfg(not(windows))]
fn create_command(program: &str) -> Command {
    Command::new(program)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// The stream_agent.py script content (embedded in binary)
const STREAM_AGENT_SCRIPT: &str = include_str!("../../scripts/stream_agent.py");

/// Initialize hermes-app scripts in user directory
fn ensure_scripts_installed() -> Result<(), String> {
    // Create directory
    let mkdir_cmd = "mkdir -p ~/.hermes/hermes-app";
    create_command("wsl")
        .args(["-e", "bash", "-c", mkdir_cmd])
        .output()
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    // Actually, let's just check if file exists and skip if it does
    let check_cmd = "test -f ~/.hermes/hermes-app/stream_agent.py && echo 'exists' || echo 'not_found'";
    let output = create_command("wsl")
        .args(["-e", "bash", "-c", check_cmd])
        .output()
        .map_err(|e| format!("Failed to check script: {}", e))?;

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if result == "exists" {
        println!("[ChatDirect] Script already installed");
        return Ok(());
    }

    // Write script using base64 encoding (most reliable)
    // Use temp file in WSL, not Windows
    let encoded = STANDARD.encode(STREAM_AGENT_SCRIPT);
    let write_cmd = format!(
        "mkdir -p ~/.hermes/hermes-app && echo '{}' | base64 -d > ~/.hermes/hermes-app/stream_agent.py",
        encoded
    );

    create_command("wsl")
        .args(["-e", "bash", "-c", &write_cmd])
        .output()
        .map_err(|e| format!("Failed to install script: {}", e))?;

    println!("[ChatDirect] Script installed to ~/.hermes/hermes-app/stream_agent.py");
    Ok(())
}

/// Check if Hermes CLI is available
#[tauri::command]
pub fn check_hermes_health() -> Result<bool, String> {
    println!("[ChatDirect] Checking Hermes CLI availability...");

    // Ensure scripts are installed
    if let Err(e) = ensure_scripts_installed() {
        println!("[ChatDirect] Warning: Failed to install scripts: {}", e);
    }

    let check_cmd = "test -f ~/.hermes/hermes-agent/venv/bin/python && echo 'available' || echo 'not_found'";
    let output = create_command("wsl")
        .args(["-e", "bash", "-c", check_cmd])
        .output()
        .map_err(|e| format!("Failed to check Hermes CLI: {}", e))?;

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    println!("[ChatDirect] CLI available: {}", result == "available");
    Ok(result == "available")
}

/// Send a chat message (simple version)
#[tauri::command]
pub fn send_chat_message(
    messages: Vec<ChatMessage>,
    session_id: Option<String>,
) -> Result<String, String> {
    println!("[ChatDirect] Sending chat message, session: {:?}", session_id);

    let query = messages
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.clone())
        .unwrap_or_else(|| "Hello".to_string());

    // Use stream_agent.py for simple call
    let mut cmd_str = format!(
        "~/.hermes/hermes-agent/venv/bin/python ~/.hermes/hermes-app/stream_agent.py '{}'",
        query.replace("'", "'\\''")
    );

    if let Some(sid) = session_id {
        cmd_str.push_str(&format!(" '{}'", sid));
    }

    let output = create_command("wsl")
        .args(["-e", "bash", "-c", &cmd_str])
        .output()
        .map_err(|e| format!("Failed to run Hermes: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    // Find DONE line and extract content
    for line in stdout.lines() {
        if line.starts_with("DONE:") {
            let data: serde_json::Value = serde_json::from_str(&line[5..])
                .map_err(|e| format!("Failed to parse result: {}", e))?;
            let sid = data.get("session_id").and_then(|v| v.as_str()).unwrap_or("");
            let content = data.get("content").and_then(|v| v.as_str()).unwrap_or("");
            return Ok(format!("session_id: {}\n{}", sid, content));
        }
    }

    Err("No response received".to_string())
}

/// Start Hermes Gateway (now just checks CLI)
#[tauri::command]
pub fn start_hermes_gateway() -> Result<String, String> {
    if check_hermes_health()? {
        return Ok("Hermes CLI available - direct mode enabled".to_string());
    }
    Err("Hermes CLI not found".to_string())
}

/// Restart Hermes Gateway
#[tauri::command]
pub fn restart_hermes_gateway() -> Result<String, String> {
    start_hermes_gateway()
}

/// Stream a chat message (simple version)
#[tauri::command]
pub fn stream_chat_message(
    messages: Vec<ChatMessage>,
    session_id: Option<String>,
) -> Result<String, String> {
    send_chat_message(messages, session_id)
}

/// Stream chat with real-time events - full streaming with tool/reasoning callbacks
/// Emits events: "chat:token", "chat:reasoning", "chat:tool", "chat:complete", "chat:error"
#[tauri::command]
pub async fn stream_chat_realtime(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    session_id: Option<String>,
) -> Result<String, String> {
    println!("[ChatStream] Starting realtime stream, session: {:?}", session_id);
    println!("[ChatStream] Messages count: {}", messages.len());

    // Emit thinking status
    let _ = app.emit("chat:status", serde_json::json!({
        "status": "thinking",
        "message": "正在连接 AI 服务..."
    }));

    let query = messages
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.clone())
        .unwrap_or_else(|| "Hello".to_string());

    println!("[ChatStream] Query: {}", query);

    // Build history from all messages except the last user message
    let history: Vec<serde_json::Value> = messages
        .iter()
        .rev()
        .skip(1)  // Skip the last user message
        .rev()    // Restore original order
        .map(|m| serde_json::json!({
            "role": m.role,
            "content": m.content
        }))
        .collect();

    println!("[ChatStream] History messages: {}", history.len());

    let app_clone = app.clone();
    let session_clone = session_id.clone();

    let handle = tokio::task::spawn_blocking(move || {
        // Build command to run stream_agent.py with --stdin flag
        let script_path = "~/.hermes/hermes-app/stream_agent.py";
        let cmd_str = format!(
            "~/.hermes/hermes-agent/venv/bin/python {} --stdin",
            script_path
        );

        // Build JSON input for stdin
        let stdin_json = serde_json::json!({
            "query": query,
            "session_id": session_clone,
            "history": history
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
        {
            let mut processes = RUNNING_PROCESSES.lock().map_err(|e| format!("Failed to lock processes: {}", e))?;
            *processes = Some(pid);
            println!("[ChatStream] Stored process PID: {}", pid);
        }

        // Write JSON to stdin
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(stdin_data.as_bytes())
                .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        }

        let stdout = child.stdout.take().expect("Failed to capture stdout");
        let reader = BufReader::new(stdout);

        let mut session_id_result = String::new();
        let mut accumulated_content = String::new();
        let mut accumulated_reasoning = String::new();

        // Emit streaming status
        let _ = app_clone.emit("chat:status", serde_json::json!({
            "status": "streaming",
            "message": "正在接收响应..."
        }));

        // Read output line by line and emit events
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    let trimmed = text.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    println!("[ChatStream] Line: {}", trimmed);

                    // Parse event type from prefix
                    if trimmed.starts_with("TOKEN:") {
                        let token = &trimmed[6..];
                        accumulated_content.push_str(token);
                        let _ = app_clone.emit("chat:chunk", serde_json::json!({
                            "content": token,
                            "accumulated": accumulated_content.clone()
                        }));
                    }
                    else if trimmed.starts_with("REASONING:") {
                        let reasoning = &trimmed[10..];
                        accumulated_reasoning.push_str(reasoning);
                        let _ = app_clone.emit("chat:reasoning", serde_json::json!({
                            "text": reasoning,
                            "accumulated": accumulated_reasoning.clone()
                        }));
                    }
                    else if trimmed.starts_with("TOOL:") {
                        let tool_json = &trimmed[5..];
                        if let Ok(tool_data) = serde_json::from_str::<serde_json::Value>(tool_json) {
                            let _ = app_clone.emit("chat:tool", tool_data);
                        }
                    }
                    else if trimmed.starts_with("APPROVAL:") {
                        let approval_json = &trimmed[9..];
                        if let Ok(approval_data) = serde_json::from_str::<serde_json::Value>(approval_json) {
                            let _ = app_clone.emit("chat:approval", approval_data);
                        }
                    }
                    else if trimmed.starts_with("SESSION:") {
                        let session_json = &trimmed[8..];
                        if let Ok(session_data) = serde_json::from_str::<serde_json::Value>(session_json) {
                            let _ = app_clone.emit("chat:session", session_data);
                        }
                    }
                    else if trimmed.starts_with("DONE:") {
                        let result_json = &trimmed[5..];
                        println!("[ChatStream] DONE JSON: {}", result_json);
                        if let Ok(result) = serde_json::from_str::<serde_json::Value>(result_json) {
                            session_id_result = result.get("session_id")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();

                            let content = result.get("content")
                                .and_then(|v| v.as_str())
                                .unwrap_or(&accumulated_content)
                                .to_string();

                            println!("[ChatStream] Session ID: {}", session_id_result);
                            println!("[ChatStream] Content from result: {}", result.get("content").and_then(|v| v.as_str()).unwrap_or("(none)"));
                            println!("[ChatStream] Accumulated content: {}", accumulated_content);
                            println!("[ChatStream] Final content length: {}", content.len());

                            let input_tokens = result.get("input_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0);

                            let output_tokens = result.get("output_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0);

                            // Emit usage
                            let _ = app_clone.emit("chat:usage", serde_json::json!({
                                "prompt_tokens": input_tokens,
                                "completion_tokens": output_tokens,
                                "total_tokens": input_tokens + output_tokens
                            }));

                            // Emit complete
                            let _ = app_clone.emit("chat:complete", serde_json::json!({
                                "id": session_id_result.clone(),
                                "content": content,
                                "reasoning": accumulated_reasoning.clone(),
                                "usage": {
                                    "prompt_tokens": input_tokens,
                                    "completion_tokens": output_tokens,
                                    "total_tokens": input_tokens + output_tokens
                                }
                            }));
                        }
                    }
                    else if trimmed.starts_with("ERROR:") {
                        let error_msg = &trimmed[6..];
                        let _ = app_clone.emit("chat:error", serde_json::json!({
                            "error": error_msg
                        }));
                        return Err(error_msg.to_string());
                    }
                }
                Err(e) => {
                    println!("[ChatStream] Error reading: {}", e);
                    break;
                }
            }
        }

        // Wait for process
        let status = child.wait().map_err(|e| format!("Failed to wait: {}", e))?;

        // Clear the process ID
        {
            let mut processes = RUNNING_PROCESSES.lock().map_err(|e| format!("Failed to lock processes: {}", e))?;
            *processes = None;
            println!("[ChatStream] Cleared process PID");
        }

        if !status.success() {
            let _ = app_clone.emit("chat:error", serde_json::json!({
                "error": "Process exited with error"
            }));
            return Err("Process failed".to_string());
        }

        Ok(session_id_result)
    });

    handle.await.map_err(|e| format!("Task error: {}", e))?
}

/// Respond to an approval request
#[tauri::command]
pub fn respond_approval(approval_id: String, choice: String) -> Result<(), String> {
    println!("[Approval] Responding to approval {}: {}", approval_id, choice);

    // Write response file in WSL
    let response_cmd = format!(
        "echo '{}' > ~/.hermes/approvals/{}.response",
        choice, approval_id
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

/// Stream chat with progress (legacy)
#[tauri::command]
pub async fn stream_chat_with_progress(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    session_id: Option<String>,
) -> Result<String, String> {
    let result = stream_chat_realtime(app, messages, session_id).await?;
    Ok(result)
}

/// Abort the currently running chat stream
#[tauri::command]
pub fn abort_chat() -> Result<(), String> {
    println!("[ChatAbort] Attempting to abort chat...");

    let mut processes = RUNNING_PROCESSES.lock().map_err(|e| format!("Failed to lock processes: {}", e))?;

    if let Some(pid) = processes.take() {
        println!("[ChatAbort] Killing process with PID: {}", pid);

        // On Windows, we need to kill the process tree
        #[cfg(windows)]
        {
            // Use taskkill to kill the process tree
            let output = create_command("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output()
                .map_err(|e| format!("Failed to kill process: {}", e))?;

            if output.status.success() {
                println!("[ChatAbort] Process killed successfully");
            } else {
                println!("[ChatAbort] Failed to kill process: {}", String::from_utf8_lossy(&output.stderr));
            }
        }

        // On Linux/macOS, kill the process group
        #[cfg(not(windows))]
        {
            // Kill the process
            let output = std::process::Command::new("kill")
                .args(["-9", &pid.to_string()])
                .output()
                .map_err(|e| format!("Failed to kill process: {}", e))?;

            if output.status.success() {
                println!("[ChatAbort] Process killed successfully");
            }
        }

        println!("[ChatAbort] Chat aborted successfully");
    } else {
        println!("[ChatAbort] No running process to abort");
    }

    Ok(())
}
