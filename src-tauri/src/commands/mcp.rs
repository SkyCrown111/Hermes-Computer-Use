//! MCP (Model Context Protocol) Commands
//!
//! Commands for managing MCP server connections.
//! Reads from and writes to ~/.hermes/config.yaml mcp section.

use super::utils::create_command;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

/// MCP Server Status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum McpServerStatus {
    Connected,
    Disconnected,
    Error,
    Starting,
}

/// MCP Server Configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Option<Vec<String>>,
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
    #[serde(default)]
    pub auto_start: Option<bool>,
    #[serde(default)]
    pub restart_on_failure: Option<bool>,
    #[serde(default)]
    pub max_restarts: Option<i32>,
}

/// MCP Server Information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub name: String,
    pub status: McpServerStatus,
    pub config: McpServerConfig,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uptime_seconds: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resources_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_activity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_count: Option<i64>,
}

/// MCP Tool Definition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
    pub server_name: String,
}

/// MCP Resource Definition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpResource {
    pub uri: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    pub server_name: String,
}

/// MCP Server Statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStats {
    pub total_servers: i32,
    pub connected: i32,
    pub disconnected: i32,
    pub error: i32,
    pub total_tools: i32,
    pub total_resources: i32,
    pub total_requests: i64,
    pub total_errors: i64,
}

/// MCP Connection Test Result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConnectionTestResult {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<McpTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resources: Option<Vec<McpResource>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// MCP Log Entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpLogEntry {
    pub timestamp: String,
    pub level: String,
    pub server_name: String,
    pub message: String,
}

/// Add MCP Server Request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddMcpServerRequest {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Option<Vec<String>>,
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
    #[serde(default)]
    pub auto_start: Option<bool>,
}

/// Read MCP config from WSL
fn read_mcp_config() -> Result<serde_json::Value, String> {
    let script = r#"
import os
import json
import yaml

filepath = os.path.expanduser("~/.hermes/config.yaml")
try:
    with open(filepath, 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f) or {}
    mcp_config = config.get('mcp', {})
    print(json.dumps(mcp_config))
except FileNotFoundError:
    print('{}')
except Exception as e:
    print('{}')
"#;

    let output = create_command("wsl")
        .args(["python3", "-c", script])
        .output()
        .map_err(|e| format!("Failed to read MCP config: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(serde_json::from_str(&stdout).unwrap_or(serde_json::json!({})))
    } else {
        Ok(serde_json::json!({}))
    }
}

/// Write MCP config using ConfigLock for safe concurrent access
async fn write_mcp_config_with_lock(mcp_config: &serde_json::Value) -> Result<(), String> {
    // Get config path
    let home = std::env::var("USERPROFILE").unwrap_or_else(|_| String::from("C:\\Users\\Default"));
    let config_path = std::path::PathBuf::from(home)
        .join("AppData")
        .join("Local")
        .join("Packages")
        .join("CanonicalGroupLimited.Ubuntu_79rhkp1fndgsc")
        .join("LocalState")
        .join("rootfs")
        .join("home")
        .join(std::env::var("USER").unwrap_or_else(|_| String::from("user")))
        .join(".hermes")
        .join("config.yaml");
    
    // Create ConfigLock instance
    let config_lock = crate::core::config_lock::ConfigLock::new(config_path);
    
    // Acquire lock
    let mut guard = config_lock.acquire().await?;
    
    // Read existing config
    let mut config = config_lock.read_config().await.unwrap_or_else(|_| {
        serde_yaml::Value::Mapping(serde_yaml::Mapping::new())
    });
    
    // Ensure top-level is a mapping
    let config_map = match config.as_mapping_mut() {
        Some(m) => m,
        None => {
            config = serde_yaml::Value::Mapping(serde_yaml::Mapping::new());
            config.as_mapping_mut().unwrap()
        }
    };
    
    // Convert MCP config to YAML value
    let mcp_yaml = serde_yaml::to_value(mcp_config)
        .map_err(|e| format!("Failed to convert MCP config to YAML: {}", e))?;
    
    // Update MCP section
    config_map.insert(
        serde_yaml::Value::String("mcp".to_string()),
        mcp_yaml
    );
    
    // Write back with lock
    config_lock.write_config(&mut guard, &config).await?;
    
    println!("[MCP] MCP config saved successfully with ConfigLock");
    Ok(())
}

/// Write MCP config to WSL using base64 encoding via stdin for safe transport
/// NOTE: This is the legacy implementation. New code should use write_mcp_config_with_lock.
fn write_mcp_config(mcp_config: &serde_json::Value) -> Result<(), String> {
    let mcp_str = serde_json::to_string(mcp_config)
        .map_err(|e| format!("Failed to serialize MCP config: {}", e))?;

    // Use base64 encoding to avoid shell escaping issues
    let encoded = STANDARD.encode(&mcp_str);

    let script = r#"
import os
import json
import yaml
import base64
import sys

filepath = os.path.expanduser("~/.hermes/config.yaml")
os.makedirs(os.path.dirname(filepath), exist_ok=True)

# Read existing config
config = {}
try:
    with open(filepath, 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f) or {}
except:
    pass

# Decode MCP config from base64 read from stdin
encoded_data = sys.stdin.read().strip()
mcp_json = json.loads(base64.b64decode(encoded_data).decode('utf-8'))
config['mcp'] = mcp_json

# Write back
with open(filepath, 'w', encoding='utf-8') as f:
    yaml.dump(config, f, default_flow_style=False, allow_unicode=True)

print("Config saved successfully")
"#;

    let mut child = create_command("wsl")
        .args(["-e", "bash", "-c", &format!("python3 -c '{}'", script.replace("'", "'\\''"))])
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to write MCP config: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        stdin
            .write_all(encoded.as_bytes())
            .map_err(|e| format!("Failed to write MCP config to stdin: {}", e))?;
    }

    let status = child
        .wait()
        .map_err(|e| format!("Failed to wait for MCP config write: {}", e))?;

    if !status.success() {
        return Err("Failed to save MCP config".to_string());
    }

    Ok(())
}

/// List all MCP servers
#[tauri::command(rename_all = "snake_case")]
pub async fn list_mcp_servers(
    mcp_manager: tauri::State<'_, Arc<crate::features::McpServerManager>>,
) -> Result<Vec<McpServer>, String> {
    println!("[MCP] Listing MCP servers...");

    let mcp_config = read_mcp_config()?;
    let servers = mcp_config.get("servers").and_then(|s| s.as_object()).cloned().unwrap_or_default();

    let mut result = Vec::new();

    for (name, server_config) in servers {
        let config = parse_server_config(&name, &server_config);

        // Get real-time status from manager
        let status = mcp_manager.get_server_status(&name).await.unwrap_or(McpServerStatus::Disconnected);

        result.push(McpServer {
            name: name.clone(),
            status,
            config,
            uptime_seconds: None,
            tools_count: None,
            resources_count: None,
            last_error: None,
            last_activity: None,
            request_count: None,
            error_count: None,
        });
    }

    println!("[MCP] Found {} MCP servers", result.len());
    Ok(result)
}

/// Parse server config from JSON value
fn parse_server_config(name: &str, value: &serde_json::Value) -> McpServerConfig {
    let empty_map = serde_json::Map::new();
    let obj = value.as_object().unwrap_or(&empty_map);

    McpServerConfig {
        name: name.to_string(),
        command: obj.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        args: obj.get("args").and_then(|v| v.as_array()).map(|arr| {
            arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()
        }),
        env: obj.get("env").and_then(|v| v.as_object()).map(|map| {
            map.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect()
        }),
        auto_start: obj.get("auto_start").and_then(|v| v.as_bool()),
        restart_on_failure: obj.get("restart_on_failure").and_then(|v| v.as_bool()),
        max_restarts: obj.get("max_restarts").and_then(|v| v.as_i64()).map(|v| v as i32),
    }
}

/// Get a single MCP server by name
#[tauri::command(rename_all = "snake_case")]
pub fn get_mcp_server(name: String) -> Result<McpServer, String> {
    println!("[MCP] Getting MCP server: {}", name);

    let mcp_config = read_mcp_config()?;
    let servers = mcp_config.get("servers").and_then(|s| s.as_object()).cloned().unwrap_or_default();

    let server_config = servers.get(&name)
        .ok_or_else(|| format!("Server not found: {}", name))?;

    let config = parse_server_config(&name, server_config);

    Ok(McpServer {
        name: name.clone(),
        status: McpServerStatus::Disconnected,
        config,
        uptime_seconds: None,
        tools_count: None,
        resources_count: None,
        last_error: None,
        last_activity: None,
        request_count: None,
        error_count: None,
    })
}

/// Add a new MCP server
#[tauri::command(rename_all = "snake_case")]
pub async fn add_mcp_server(request: AddMcpServerRequest) -> Result<(), String> {
    println!("[MCP] Adding MCP server: {}", request.name);

    if request.name.is_empty() {
        return Err("Server name cannot be empty".to_string());
    }

    if request.command.is_empty() {
        return Err("Command cannot be empty".to_string());
    }

    let mut mcp_config = read_mcp_config()?;

    // Ensure servers object exists
    if mcp_config.get("servers").is_none() {
        mcp_config["servers"] = serde_json::json!({});
    }

    let servers = mcp_config.get_mut("servers").unwrap().as_object_mut().unwrap();

    // Check if server already exists
    if servers.contains_key(&request.name) {
        return Err(format!("Server already exists: {}", request.name));
    }

    // Create server config
    let mut server_obj = serde_json::Map::new();
    server_obj.insert("command".to_string(), serde_json::json!(request.command));

    if let Some(args) = &request.args {
        server_obj.insert("args".to_string(), serde_json::json!(args));
    }

    if let Some(env) = &request.env {
        server_obj.insert("env".to_string(), serde_json::json!(env));
    }

    if let Some(auto_start) = request.auto_start {
        server_obj.insert("auto_start".to_string(), serde_json::json!(auto_start));
    }

    servers.insert(request.name.clone(), serde_json::Value::Object(server_obj));

    write_mcp_config_with_lock(&mcp_config).await?;
    println!("[MCP] Added MCP server: {}", request.name);

    Ok(())
}

/// Remove an MCP server
#[tauri::command(rename_all = "snake_case")]
pub async fn remove_mcp_server(name: String) -> Result<(), String> {
    println!("[MCP] Removing MCP server: {}", name);

    let mut mcp_config = read_mcp_config()?;

    let servers = mcp_config.get_mut("servers")
        .and_then(|s| s.as_object_mut())
        .ok_or_else(|| "No servers configured".to_string())?;

    if servers.remove(&name).is_none() {
        return Err(format!("Server not found: {}", name));
    }

    write_mcp_config_with_lock(&mcp_config).await?;
    println!("[MCP] Removed MCP server: {}", name);

    Ok(())
}

/// Start an MCP server
#[tauri::command(rename_all = "snake_case")]
pub async fn start_mcp_server(
    name: String,
    mcp_manager: tauri::State<'_, Arc<crate::features::McpServerManager>>,
) -> Result<(), String> {
    println!("[MCP] Starting MCP server: {}", name);
    mcp_manager.start_server(&name).await
}

/// Stop an MCP server
#[tauri::command(rename_all = "snake_case")]
pub async fn stop_mcp_server(
    name: String,
    mcp_manager: tauri::State<'_, Arc<crate::features::McpServerManager>>,
) -> Result<(), String> {
    println!("[MCP] Stopping MCP server: {}", name);
    mcp_manager.stop_server(&name).await
}

/// Test MCP connection
#[tauri::command(rename_all = "snake_case")]
pub fn test_mcp_connection(config: McpServerConfig) -> Result<McpConnectionTestResult, String> {
    println!("[MCP] Testing MCP connection for: {}", config.name);

    // Basic validation
    if config.command.is_empty() {
        return Ok(McpConnectionTestResult {
            success: false,
            message: "Command is required".to_string(),
            tools: None,
            resources: None,
            error: Some("Command cannot be empty".to_string()),
        });
    }

    Ok(McpConnectionTestResult {
        success: false,
        message: format!(
            "Connection testing for '{}' is not implemented in this desktop build yet",
            config.name
        ),
        tools: None,
        resources: None,
        error: Some("MCP runtime bridge not implemented".to_string()),
    })
}

/// Get MCP tools for a server
#[tauri::command(rename_all = "snake_case")]
pub async fn get_mcp_tools(
    name: String,
    mcp_manager: tauri::State<'_, Arc<crate::features::McpServerManager>>,
) -> Result<Vec<McpTool>, String> {
    println!("[MCP] Getting tools for server: {}", name);
    mcp_manager.get_server_tools(&name).await
}

/// Get MCP resources for a server
#[tauri::command(rename_all = "snake_case")]
pub async fn get_mcp_resources(
    name: String,
    mcp_manager: tauri::State<'_, Arc<crate::features::McpServerManager>>,
) -> Result<Vec<McpResource>, String> {
    println!("[MCP] Getting resources for server: {}", name);
    mcp_manager.get_server_resources(&name).await
}

/// Get MCP server logs
#[tauri::command(rename_all = "snake_case")]
pub async fn get_mcp_logs(
    name: String,
    mcp_manager: tauri::State<'_, Arc<crate::features::McpServerManager>>,
) -> Result<Vec<McpLogEntry>, String> {
    println!("[MCP] Getting logs for server: {}", name);
    mcp_manager.get_server_logs(&name, 100).await
}

/// Get MCP server statistics
#[tauri::command(rename_all = "snake_case")]
pub async fn get_mcp_stats(
    mcp_manager: tauri::State<'_, Arc<crate::features::McpServerManager>>,
) -> Result<McpServerStats, String> {
    println!("[MCP] Getting MCP statistics...");

    let servers = list_mcp_servers(mcp_manager).await?;

    let total_servers = servers.len() as i32;
    let connected = servers.iter().filter(|s| s.status == McpServerStatus::Connected).count() as i32;
    let disconnected = servers.iter().filter(|s| s.status == McpServerStatus::Disconnected).count() as i32;
    let error = servers.iter().filter(|s| s.status == McpServerStatus::Error).count() as i32;

    Ok(McpServerStats {
        total_servers,
        connected,
        disconnected,
        error,
        total_tools: 0,
        total_resources: 0,
        total_requests: 0,
        total_errors: 0,
    })
}

/// Update MCP server configuration
#[tauri::command(rename_all = "snake_case")]
pub async fn update_mcp_server(name: String, config: McpServerConfig) -> Result<(), String> {
    println!("[MCP] Updating MCP server: {}", name);

    let mut mcp_config = read_mcp_config()?;

    let servers = mcp_config.get_mut("servers")
        .and_then(|s| s.as_object_mut())
        .ok_or_else(|| "No servers configured".to_string())?;

    if !servers.contains_key(&name) {
        return Err(format!("Server not found: {}", name));
    }

    // Create updated server config
    let mut server_obj = serde_json::Map::new();
    server_obj.insert("command".to_string(), serde_json::json!(config.command));

    if let Some(args) = &config.args {
        server_obj.insert("args".to_string(), serde_json::json!(args));
    }

    if let Some(env) = &config.env {
        server_obj.insert("env".to_string(), serde_json::json!(env));
    }

    if let Some(auto_start) = config.auto_start {
        server_obj.insert("auto_start".to_string(), serde_json::json!(auto_start));
    }

    if let Some(restart_on_failure) = config.restart_on_failure {
        server_obj.insert("restart_on_failure".to_string(), serde_json::json!(restart_on_failure));
    }

    if let Some(max_restarts) = config.max_restarts {
        server_obj.insert("max_restarts".to_string(), serde_json::json!(max_restarts));
    }

    servers.insert(name.clone(), serde_json::Value::Object(server_obj));

    write_mcp_config_with_lock(&mcp_config).await?;
    println!("[MCP] Updated MCP server: {}", name);

    Ok(())
}
