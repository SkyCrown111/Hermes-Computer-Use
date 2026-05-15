//! Tool invocation commands for Hermes Agent
//! Direct tool calling without chat conversation

use super::utils::create_command;
use crate::hermes_adapter::resolve_environment;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Max serialized args payload for direct IPC tool invocation (1 MiB).
const MAX_INVOKE_ARGS_BYTES: usize = 1_048_576;

/// Tool names blocked from direct IPC invoke; use chat approval flow instead.
const IPC_BLOCKED_TOOLS: &[&str] = &[
    "run_terminal_cmd",
    "run_terminal",
    "terminal",
    "execute_shell",
    "shell",
    "bash",
    "computer_use",
    "computer",
];

fn is_ipc_blocked_tool(tool_name: &str) -> bool {
    let lower = tool_name.to_ascii_lowercase();
    IPC_BLOCKED_TOOLS.iter().any(|blocked| lower == *blocked)
}

fn validate_invoke_args(args: &Value) -> Result<(), String> {
    if !args.is_object() {
        return Err("Tool args must be a JSON object".to_string());
    }
    let serialized = serde_json::to_string(args)
        .map_err(|e| format!("Failed to serialize tool args: {}", e))?;
    if serialized.len() > MAX_INVOKE_ARGS_BYTES {
        return Err("Tool args payload is too large".to_string());
    }
    Ok(())
}

/// Tool information schema
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInfo {
    pub name: String,
    pub toolset: String,
    pub description: Option<String>,
    pub emoji: Option<String>,
    pub is_async: bool,
}

/// Tool execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub output: serde_json::Value,
    pub error: Option<String>,
    pub duration_ms: Option<u64>,
}

/// Check if hermes-agent Python modules are available
fn hermes_agent_available() -> bool {
    resolve_environment()
        .map(|env| env.runtime.import_root.is_some() && env.runtime.python_path.is_some())
        .unwrap_or(false)
}

/// List all available tools from Hermes Agent
#[tauri::command(rename_all = "snake_case")]
pub fn list_available_tools() -> Result<Vec<ToolInfo>, String> {
    let env = resolve_environment().map_err(|e| e.to_string())?;
    let import_root = env
        .runtime
        .import_root
        .clone()
        .ok_or_else(|| "Hermes import root is not available".to_string())?;
    let python_path = env
        .runtime
        .python_path
        .clone()
        .ok_or_else(|| "Hermes Python runtime is not available".to_string())?;

    if !hermes_agent_available() {
        return Ok(vec![]);
    }

    let script = r#"
import sys, json
try:
    sys.path.insert(0, __IMPORT_ROOT__)
    from tools.registry import registry
    from tools import discover_builtin_tools
    discover_builtin_tools()
    tools = registry.get_all_tools()
    result = []
    for t in tools:
        result.append({
            'name': t.name,
            'toolset': t.toolset,
            'description': t.description,
            'emoji': t.emoji,
            'is_async': t.is_async
        })
    print(json.dumps(result))
except Exception as e:
    print(json.dumps([]))
"#
    .replace("__IMPORT_ROOT__", &format!("{import_root:?}"));

    let output = create_command("wsl")
        .args([&python_path, "-c", &script])
        .output()
        .map_err(|e| format!("Failed to list tools: {}", e))?;

    if !output.status.success() {
        return Ok(vec![]);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let tools: Vec<ToolInfo> = serde_json::from_str(&stdout.trim())
        .map_err(|e| format!("Failed to parse tools: {}", e))?;

    Ok(tools)
}

/// Get schema for a specific tool.
/// Uses base64-encoded tool_name passed via stdin to prevent shell injection.
#[tauri::command(rename_all = "snake_case")]
pub fn get_tool_schema(tool_name: String) -> Result<serde_json::Value, String> {
    // Validate tool_name: only allow alphanumeric, underscores, hyphens, and dots
    if tool_name.chars().any(|c| !c.is_alphanumeric() && c != '_' && c != '-' && c != '.') {
        return Err(format!("Invalid tool name: {}", tool_name));
    }

    let env = resolve_environment().map_err(|e| e.to_string())?;
    let import_root = env
        .runtime
        .import_root
        .clone()
        .ok_or_else(|| "Hermes import root is not available".to_string())?;
    let python_path = env
        .runtime
        .python_path
        .clone()
        .ok_or_else(|| "Hermes Python runtime is not available".to_string())?;

    if !hermes_agent_available() {
        return Err("Hermes Agent is not installed".to_string());
    }

    let script = r#"
import sys, json, base64
try:
    sys.path.insert(0, __IMPORT_ROOT__)
    from tools.registry import registry
    from tools import discover_builtin_tools
    discover_builtin_tools()

    tool_name = base64.b64decode(sys.stdin.read().strip()).decode('utf-8')
    entry = registry.get_entry(tool_name)
    if entry:
        print(json.dumps({'schema': entry.schema, 'description': entry.description}))
    else:
        print(json.dumps({'error': 'Tool not found'}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
"#
    .replace("__IMPORT_ROOT__", &format!("{import_root:?}"));

    let tool_name_b64 = STANDARD.encode(&tool_name);

    // Use stdin pipe instead of echo+pipe to avoid shell escaping issues
    let mut child = create_command("wsl")
        .args([&python_path, "-c", &script])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to get tool schema: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        stdin
            .write_all(format!("{}\n", tool_name_b64).as_bytes())
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to get tool schema: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to get tool schema: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: serde_json::Value = serde_json::from_str(&stdout.trim())
        .map_err(|e| format!("Failed to parse schema: {}", e))?;

    if let Some(error) = result.get("error") {
        return Err(error.as_str().unwrap_or("Tool not found").to_string());
    }

    Ok(result)
}

/// Invoke a tool directly.
/// Uses base64-encoded payload passed via stdin to prevent shell injection.
#[tauri::command(rename_all = "snake_case")]
pub async fn invoke_tool(
    tool_name: String,
    args: serde_json::Value,
    session_id: Option<String>,
) -> Result<ToolResult, String> {
    // Validate tool_name: only allow alphanumeric, underscores, hyphens, and dots
    if tool_name.chars().any(|c| !c.is_alphanumeric() && c != '_' && c != '-' && c != '.') {
        return Err(format!("Invalid tool name: {}", tool_name));
    }

    if is_ipc_blocked_tool(&tool_name) {
        return Err(format!(
            "Tool '{}' cannot be invoked directly from the desktop UI; use chat with approval instead",
            tool_name
        ));
    }

    validate_invoke_args(&args)?;

    let env = resolve_environment().map_err(|e| e.to_string())?;
    let import_root = env
        .runtime
        .import_root
        .clone()
        .ok_or_else(|| "Hermes import root is not available".to_string())?;
    let python_path = env
        .runtime
        .python_path
        .clone()
        .ok_or_else(|| "Hermes Python runtime is not available".to_string())?;

    if !hermes_agent_available() {
        return Err("Hermes Agent is not installed".to_string());
    }

    let _session_arg = session_id.map(|s| format!("--session-id {}", s)).unwrap_or_default();

    // Encode the entire payload as base64 and pass via stdin
    let payload = serde_json::json!({
        "tool_name": tool_name,
        "args": args,
    });
    let payload_b64 = STANDARD.encode(serde_json::to_string(&payload).map_err(|e| format!("Failed to encode payload: {}", e))?);

    let script = r#"
import sys, json, base64, time
try:
    sys.path.insert(0, __IMPORT_ROOT__)
    from tools.registry import registry
    from tools import discover_builtin_tools
    discover_builtin_tools()

    payload = json.loads(base64.b64decode(sys.stdin.read().strip()).decode('utf-8'))
    tool_name = payload['tool_name']
    args = payload.get('args', {})

    entry = registry.get_entry(tool_name)
    if not entry:
        print(json.dumps({'success': False, 'output': None, 'error': 'Tool not found'}))
        sys.exit(0)

    start = time.time()
    try:
        if entry.is_async:
            import asyncio
            result = asyncio.run(entry.handler(**args))
        else:
            result = entry.handler(**args)
        duration = int((time.time() - start) * 1000)
        print(json.dumps({'success': True, 'output': result, 'error': None, 'duration_ms': duration}))
    except Exception as e:
        duration = int((time.time() - start) * 1000)
        print(json.dumps({'success': False, 'output': None, 'error': str(e), 'duration_ms': duration}))
except Exception as e:
    print(json.dumps({'success': False, 'output': None, 'error': str(e)}))
"#
    .replace("__IMPORT_ROOT__", &format!("{import_root:?}"));

    // Use stdin pipe instead of echo+pipe to avoid shell escaping issues
    let mut child = create_command("wsl")
        .args([&python_path, "-c", &script])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to invoke tool: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        stdin
            .write_all(format!("{}\n", payload_b64).as_bytes())
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to invoke tool: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: ToolResult = serde_json::from_str(&stdout.trim())
        .map_err(|e| format!("Failed to parse result: {}", e))?;

    Ok(result)
}

/// Get list of toolsets
#[tauri::command(rename_all = "snake_case")]
pub fn list_toolsets() -> Result<Vec<serde_json::Value>, String> {
    let env = resolve_environment().map_err(|e| e.to_string())?;
    let import_root = env
        .runtime
        .import_root
        .clone()
        .ok_or_else(|| "Hermes import root is not available".to_string())?;
    let python_path = env
        .runtime
        .python_path
        .clone()
        .ok_or_else(|| "Hermes Python runtime is not available".to_string())?;

    if !hermes_agent_available() {
        return Ok(vec![]);
    }

    let script = r#"
import sys, json
try:
    sys.path.insert(0, __IMPORT_ROOT__)
    from toolsets import TOOLSETS
    result = []
    for name, info in TOOLSETS.items():
        result.append({
            'name': name,
            'description': info.get('description', ''),
            'tools': info.get('tools', []),
            'includes': info.get('includes', [])
        })
    print(json.dumps(result))
except Exception:
    print(json.dumps([]))
"#
    .replace("__IMPORT_ROOT__", &format!("{import_root:?}"));

    let output = create_command("wsl")
        .args([&python_path, "-c", &script])
        .output()
        .map_err(|e| format!("Failed to list toolsets: {}", e))?;

    if !output.status.success() {
        return Ok(vec![]);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let toolsets: Vec<serde_json::Value> = serde_json::from_str(&stdout.trim())
        .map_err(|e| format!("Failed to parse toolsets: {}", e))?;

    Ok(toolsets)
}
