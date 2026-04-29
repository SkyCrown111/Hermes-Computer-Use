//! Tool invocation commands for Hermes Agent
//! Direct tool calling without chat conversation

use super::utils::create_command;
use serde::{Deserialize, Serialize};

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

/// List all available tools from Hermes Agent
#[tauri::command]
pub fn list_available_tools() -> Result<Vec<ToolInfo>, String> {
    let script = r#"
import sys
sys.path.insert(0, str(__import__('pathlib').Path.home() / '.hermes' / 'hermes-agent'))
from tools.registry import registry
from tools import discover_builtin_tools
discover_builtin_tools()
tools = registry.get_all_tools()
import json
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
"#;

    let output = create_command("wsl")
        .args(["-e", "python3", "-c", script])
        .output()
        .map_err(|e| format!("Failed to list tools: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to list tools: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let tools: Vec<ToolInfo> = serde_json::from_str(&stdout.trim())
        .map_err(|e| format!("Failed to parse tools: {}", e))?;

    Ok(tools)
}

/// Get schema for a specific tool
#[tauri::command]
pub fn get_tool_schema(tool_name: String) -> Result<serde_json::Value, String> {
    let script = format!(r#"
import sys
sys.path.insert(0, str(__import__('pathlib').Path.home() / '.hermes' / 'hermes-agent'))
from tools.registry import registry
from tools import discover_builtin_tools
discover_builtin_tools()
entry = registry.get_entry('{}')
if entry:
    import json
    print(json.dumps({{'schema': entry.schema, 'description': entry.description}}))
else:
    print('{{"error": "Tool not found"}}')
"#, tool_name);

    let output = create_command("wsl")
        .args(["-e", "python3", "-c", &script])
        .output()
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

/// Invoke a tool directly
#[tauri::command]
pub async fn invoke_tool(
    tool_name: String,
    args: serde_json::Value,
    session_id: Option<String>,
) -> Result<ToolResult, String> {
    let args_json = serde_json::to_string(&args).map_err(|e| format!("Invalid args: {}", e))?;
    let _session_arg = session_id.map(|s| format!("--session-id {}", s)).unwrap_or_default();

    let script = format!(r#"
import sys
import json
sys.path.insert(0, str(__import__('pathlib').Path.home() / '.hermes' / 'hermes-agent'))
from tools.registry import registry
from tools import discover_builtin_tools
discover_builtin_tools()

tool_name = '{}'
args = json.loads('''{}''')

entry = registry.get_entry(tool_name)
if not entry:
    print(json.dumps({{'success': False, 'output': None, 'error': 'Tool not found'}}))
    sys.exit(0)

import time
start = time.time()
try:
    if entry.is_async:
        import asyncio
        result = asyncio.run(entry.handler(**args))
    else:
        result = entry.handler(**args)
    duration = int((time.time() - start) * 1000)
    print(json.dumps({{'success': True, 'output': result, 'error': None, 'duration_ms': duration}}))
except Exception as e:
    duration = int((time.time() - start) * 1000)
    print(json.dumps({{'success': False, 'output': None, 'error': str(e), 'duration_ms': duration}}))
"#, tool_name, args_json);

    let output = create_command("wsl")
        .args(["-e", "python3", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to invoke tool: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: ToolResult = serde_json::from_str(&stdout.trim())
        .map_err(|e| format!("Failed to parse result: {}", e))?;

    Ok(result)
}

/// Get list of toolsets
#[tauri::command]
pub fn list_toolsets() -> Result<Vec<serde_json::Value>, String> {
    let script = r#"
import sys
sys.path.insert(0, str(__import__('pathlib').Path.home() / '.hermes' / 'hermes-agent'))
from toolsets import TOOLSETS
import json
result = []
for name, info in TOOLSETS.items():
    result.append({
        'name': name,
        'description': info.get('description', ''),
        'tools': info.get('tools', []),
        'includes': info.get('includes', [])
    })
print(json.dumps(result))
"#;

    let output = create_command("wsl")
        .args(["-e", "python3", "-c", script])
        .output()
        .map_err(|e| format!("Failed to list toolsets: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to list toolsets: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let toolsets: Vec<serde_json::Value> = serde_json::from_str(&stdout.trim())
        .map_err(|e| format!("Failed to parse toolsets: {}", e))?;

    Ok(toolsets)
}
