// Hermes Chat Proxy Commands
// Direct Hermes Agent calling with real-time streaming via Python wrapper

use super::utils::create_command;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri::Emitter;

// Global state to track running chat processes
// Key: session_id (or empty string for single session), Value: process handle
lazy_static::lazy_static! {
    static ref RUNNING_PROCESSES: Arc<Mutex<Option<u32>>> = Arc::new(Mutex::new(None));
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
    let check_cmd =
        "test -f ~/.hermes/hermes-app/stream_agent.py && echo 'exists' || echo 'not_found'";
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

/// Find the Python executable path for running Hermes
/// Returns the Python command to use (with path if needed)
fn find_python_path() -> Result<String, String> {
    // Method 1: Check for Python venv at standard location (try both .venv and venv)
    let venv_paths = [
        "~/.hermes/hermes-agent/.venv/bin/python", // uv default
        "~/.hermes/hermes-agent/venv/bin/python",  // legacy
    ];

    for venv_path in &venv_paths {
        let check_cmd = format!("test -f {} && echo 'venv' || echo 'not_found'", venv_path);
        if let Ok(output) = create_command("wsl")
            .args(["-e", "bash", "-c", &check_cmd])
            .output()
        {
            let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if result == "venv" {
                println!("[ChatDirect] Using Python from venv: {}", venv_path);
                return Ok(venv_path.to_string());
            }
        }
    }

    // Method 2: Check if hermes CLI is available - try to find its Python
    let hermes_python_check = create_command("wsl")
        .args(["-e", "bash", "-c", "cat $(which hermes 2>/dev/null | head -1) 2>/dev/null | grep -oE 'python[3]?[^\"]*' | head -1"])
        .output();

    if let Ok(output) = hermes_python_check {
        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !result.is_empty() && result.contains("python") {
            println!("[ChatDirect] Using Python from hermes CLI: {}", result);
            return Ok(result);
        }
    }

    // Method 3: Check for hermes-agent module in system Python3
    let module_check = create_command("wsl")
        .args([
            "-e",
            "bash",
            "-c",
            "python3 -c 'import hermes_agent' 2>/dev/null && echo 'available' || echo 'not_found'",
        ])
        .output();

    if let Ok(output) = module_check {
        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if result == "available" {
            println!("[ChatDirect] Using system Python3 with hermes_agent module");
            return Ok("python3".to_string());
        }
    }

    // Method 4: Check for hermes-agent module in system Python
    let module_check2 = create_command("wsl")
        .args([
            "-e",
            "bash",
            "-c",
            "python -c 'import hermes_agent' 2>/dev/null && echo 'available' || echo 'not_found'",
        ])
        .output();

    if let Ok(output) = module_check2 {
        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if result == "available" {
            println!("[ChatDirect] Using system Python with hermes_agent module");
            return Ok("python".to_string());
        }
    }

    // Method 5: Check if python3 exists at all
    let python3_check = create_command("wsl")
        .args([
            "-e",
            "bash",
            "-c",
            "command -v python3 && echo 'found' || echo 'not_found'",
        ])
        .output();

    if let Ok(output) = python3_check {
        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if result == "found" {
            println!("[ChatDirect] Falling back to system python3");
            return Ok("python3".to_string());
        }
    }

    // Method 6: Check if python exists
    let python_check = create_command("wsl")
        .args([
            "-e",
            "bash",
            "-c",
            "command -v python && echo 'found' || echo 'not_found'",
        ])
        .output();

    if let Ok(output) = python_check {
        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if result == "found" {
            println!("[ChatDirect] Falling back to system python");
            return Ok("python".to_string());
        }
    }

    Err("No Python found in WSL. Please install Python or hermes-agent.".to_string())
}

/// Check if Hermes Agent runtime used by stream_agent.py is importable.
fn check_hermes_runtime_imports(python_path: &str) -> Result<bool, String> {
    let script = r#"
import os
import sys

candidate_paths = [
    os.path.expanduser('~/.hermes/hermes-agent/src'),
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
"#;
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
#[tauri::command]
pub fn check_hermes_health() -> Result<bool, String> {
    println!("[ChatDirect] Checking Hermes Agent runtime availability...");

    #[cfg(windows)]
    {
        if !check_wsl_available() {
            println!("[ChatDirect] WSL is not available on this system");
            return Ok(false);
        }
    }

    if let Err(e) = ensure_scripts_installed() {
        println!("[ChatDirect] Warning: Failed to install scripts: {}", e);
    }

    match find_python_path() {
        Ok(python_path) => check_hermes_runtime_imports(&python_path),
        Err(e) => {
            println!("[ChatDirect] Python runtime not available: {}", e);
            Ok(false)
        }
    }
}

/// Send a chat message (simple version)
#[tauri::command]
pub fn send_chat_message(
    messages: Vec<ChatMessage>,
    session_id: Option<String>,
) -> Result<String, String> {
    println!(
        "[ChatDirect] Sending chat message, session: {:?}",
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

    // Use stream_agent.py for simple call
    let mut cmd_str = format!(
        "{} ~/.hermes/hermes-app/stream_agent.py '{}'",
        python_path,
        query.replace("'", "'\\''")
    );

    if let Some(sid) = session_id {
        cmd_str.push_str(&format!(" '{}'", sid.replace("'", "'\\''")));
    }

    let output = create_command("wsl")
        .args(["-e", "bash", "-c", &cmd_str])
        .output()
        .map_err(|e| format!("Failed to run Hermes: {}", e))?;

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

    println!("[ChatStream] Query: {}", query);

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

    let handle = tokio::task::spawn_blocking(move || {
        // Build command to run stream_agent.py with --stdin flag
        let script_path = "~/.hermes/hermes-app/stream_agent.py";
        let cmd_str = format!("{} {} --stdin", python_path, script_path);

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
            let mut processes = RUNNING_PROCESSES
                .lock()
                .map_err(|e| format!("Failed to lock processes: {}", e))?;
            *processes = Some(pid);
            println!("[ChatStream] Stored process PID: {}", pid);
        }

        // Write JSON to stdin
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(stdin_data.as_bytes())
                .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        }

        let stdout = child.stdout.take().expect("Failed to capture stdout");
        let reader = BufReader::new(stdout);

        let mut session_id_result = String::new();
        let mut accumulated_content = String::new();
        let mut accumulated_reasoning = String::new();

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
                        println!("[ChatStream] DONE JSON: {}", result_json);
                        if let Ok(result) = serde_json::from_str::<serde_json::Value>(result_json) {
                            session_id_result = result
                                .get("session_id")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();

                            let content = result
                                .get("content")
                                .and_then(|v| v.as_str())
                                .unwrap_or(&accumulated_content)
                                .to_string();

                            println!("[ChatStream] Session ID: {}", session_id_result);
                            println!(
                                "[ChatStream] Content from result: {}",
                                result
                                    .get("content")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("(none)")
                            );
                            println!("[ChatStream] Accumulated content: {}", accumulated_content);
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

        // Wait for process and capture stderr
        let status = child.wait().map_err(|e| format!("Failed to wait: {}", e))?;

        // Clear the process ID
        {
            let mut processes = RUNNING_PROCESSES
                .lock()
                .map_err(|e| format!("Failed to lock processes: {}", e))?;
            *processes = None;
            println!("[ChatStream] Cleared process PID");
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

        Ok(session_id_result)
    });

    handle.await.map_err(|e| format!("Task error: {}", e))?
}

/// Respond to an approval request
#[tauri::command]
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
#[tauri::command]
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
#[tauri::command]
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

    let mut processes = RUNNING_PROCESSES
        .lock()
        .map_err(|e| format!("Failed to lock processes: {}", e))?;

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
                println!(
                    "[ChatAbort] Failed to kill process: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
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

/// Interrupt a specific session by ID
/// This is an alias for abort_chat but with session_id parameter for API consistency
#[tauri::command]
pub fn interrupt_session(session_id: String) -> Result<(), String> {
    println!("[ChatInterrupt] Interrupting session: {}", session_id);
    
    // For now, we use the global abort since we track a single process
    // In the future, this could be extended to support multiple sessions
    let mut processes = RUNNING_PROCESSES
        .lock()
        .map_err(|e| format!("Failed to lock processes: {}", e))?;

    if let Some(pid) = processes.take() {
        println!("[ChatInterrupt] Killing process with PID: {} for session: {}", pid, session_id);

        // On Windows, kill the process tree
        #[cfg(windows)]
        {
            let output = create_command("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output()
                .map_err(|e| format!("Failed to kill process: {}", e))?;

            if output.status.success() {
                println!("[ChatInterrupt] Process killed successfully");
            }
        }

        // On Linux/macOS, kill the process
        #[cfg(not(windows))]
        {
            let output = std::process::Command::new("kill")
                .args(["-9", &pid.to_string()])
                .output()
                .map_err(|e| format!("Failed to kill process: {}", e))?;

            if output.status.success() {
                println!("[ChatInterrupt] Process killed successfully");
            }
        }

        println!("[ChatInterrupt] Session {} interrupted successfully", session_id);
    } else {
        println!("[ChatInterrupt] No running process for session {}", session_id);
    }

    Ok(())
}
