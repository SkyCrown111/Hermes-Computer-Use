//! MCP Server Manager
//!
//! Manages MCP server lifecycle and runtime operations.

use crate::commands::mcp::{McpServerConfig, McpServerStatus, McpTool, McpResource, McpLogEntry};
use crate::core::{ProcessManager, HermesCli, ConfigLock, EventBus};
use crate::core::process_manager::{ProcessConfig, ProcessStatus};
use crate::core::event_bus::Event;
use std::sync::Arc;

/// MCP Server Manager
pub struct McpServerManager {
    process_manager: Arc<ProcessManager>,
    hermes_cli: Arc<HermesCli>,
    config_lock: Arc<ConfigLock>,
    event_bus: Arc<EventBus>,
}

impl McpServerManager {
    pub fn new(
        process_manager: Arc<ProcessManager>,
        hermes_cli: Arc<HermesCli>,
        config_lock: Arc<ConfigLock>,
        event_bus: Arc<EventBus>,
    ) -> Self {
        Self {
            process_manager,
            hermes_cli,
            config_lock,
            event_bus,
        }
    }

    /// Start MCP server
    pub async fn start_server(&self, name: &str) -> Result<(), String> {
        println!("[McpManager] Starting MCP server: {}", name);

        // Read server config
        let config = self.read_server_config(name).await?;

        // Build process config
        let process_config = ProcessConfig {
            id: format!("mcp_{}", name),
            command: config.command.clone(),
            args: config.args.unwrap_or_default(),
            env: config.env.unwrap_or_default(),
            working_dir: None,
            auto_restart: config.restart_on_failure.unwrap_or(false),
            max_restarts: config.max_restarts.unwrap_or(3) as u32,
            restart_delay_ms: 5000,
        };

        // Start process
        self.process_manager.start_process(process_config).await?;

        // Emit event
        self.event_bus.publish(Event::McpServerConnected {
            name: name.to_string(),
        });

        println!("[McpManager] MCP server started: {}", name);
        Ok(())
    }

    /// Stop MCP server
    pub async fn stop_server(&self, name: &str) -> Result<(), String> {
        println!("[McpManager] Stopping MCP server: {}", name);

        let process_id = format!("mcp_{}", name);
        self.process_manager.stop_process(&process_id).await?;

        self.event_bus.publish(Event::McpServerDisconnected {
            name: name.to_string(),
        });

        println!("[McpManager] MCP server stopped: {}", name);
        Ok(())
    }

    /// Get server status
    pub async fn get_server_status(&self, name: &str) -> Result<McpServerStatus, String> {
        let process_id = format!("mcp_{}", name);
        
        match self.process_manager.get_process_status(&process_id).await {
            Ok(info) => {
                let status = match info.status {
                    ProcessStatus::Running => McpServerStatus::Connected,
                    ProcessStatus::Stopped => McpServerStatus::Disconnected,
                    ProcessStatus::Error => McpServerStatus::Error,
                    ProcessStatus::Starting => McpServerStatus::Starting,
                    ProcessStatus::Stopping => McpServerStatus::Disconnected,
                };
                Ok(status)
            }
            Err(_) => Ok(McpServerStatus::Disconnected),
        }
    }

    /// Get server tools
    pub async fn get_server_tools(&self, name: &str) -> Result<Vec<McpTool>, String> {
        // Check if server is running
        let status = self.get_server_status(name).await?;
        if status != McpServerStatus::Connected {
            return Err(format!("Server not running: {}", name));
        }

        // Get tools via CLI
        let tools_json = self.hermes_cli.get_mcp_tools(name).await?;

        // Convert to McpTool
        let tools: Vec<McpTool> = tools_json
            .into_iter()
            .filter_map(|tool| {
                Some(McpTool {
                    name: tool.get("name")?.as_str()?.to_string(),
                    description: tool.get("description")?.as_str()?.to_string(),
                    input_schema: tool.get("inputSchema")?.clone(),
                    server_name: name.to_string(),
                })
            })
            .collect();

        Ok(tools)
    }

    /// Get server resources
    pub async fn get_server_resources(&self, name: &str) -> Result<Vec<McpResource>, String> {
        // Check if server is running
        let status = self.get_server_status(name).await?;
        if status != McpServerStatus::Connected {
            return Err(format!("Server not running: {}", name));
        }

        // Get resources via CLI
        let resources_json = self.hermes_cli.get_mcp_resources(name).await?;

        // Convert to McpResource
        let resources: Vec<McpResource> = resources_json
            .into_iter()
            .filter_map(|res| {
                Some(McpResource {
                    uri: res.get("uri")?.as_str()?.to_string(),
                    name: res.get("name")?.as_str()?.to_string(),
                    description: res.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    mime_type: res.get("mimeType").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    server_name: name.to_string(),
                })
            })
            .collect();

        Ok(resources)
    }

    /// Get server logs
    pub async fn get_server_logs(&self, name: &str, lines: usize) -> Result<Vec<McpLogEntry>, String> {
        let process_id = format!("mcp_{}", name);
        let logs = self.process_manager.get_process_logs(&process_id, lines).await?;

        Ok(logs
            .into_iter()
            .map(|line| McpLogEntry {
                timestamp: chrono::Utc::now().to_rfc3339(),
                level: "INFO".to_string(),
                server_name: name.to_string(),
                message: line,
            })
            .collect())
    }

    /// Read server config from config file
    async fn read_server_config(&self, name: &str) -> Result<McpServerConfig, String> {
        let config = self.config_lock.read_config().await?;

        let servers = config
            .get("mcp")
            .and_then(|mcp| mcp.get("servers"))
            .and_then(|s| s.as_mapping())
            .ok_or_else(|| "No MCP servers configured".to_string())?;

        let server_config = servers
            .get(&serde_yaml::Value::String(name.to_string()))
            .ok_or_else(|| format!("Server not found: {}", name))?;

        let command = server_config
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Server command not found".to_string())?
            .to_string();

        let args = server_config
            .get("args")
            .and_then(|v| v.as_sequence())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            });

        let env = server_config
            .get("env")
            .and_then(|v| v.as_mapping())
            .map(|map| {
                map.iter()
                    .filter_map(|(k, v)| {
                        Some((
                            k.as_str()?.to_string(),
                            v.as_str()?.to_string(),
                        ))
                    })
                    .collect()
            });

        Ok(McpServerConfig {
            name: name.to_string(),
            command,
            args,
            env,
            auto_start: server_config
                .get("auto_start")
                .and_then(|v| v.as_bool()),
            restart_on_failure: server_config
                .get("restart_on_failure")
                .and_then(|v| v.as_bool()),
            max_restarts: server_config
                .get("max_restarts")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32),
        })
    }
}
