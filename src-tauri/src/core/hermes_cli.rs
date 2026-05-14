//! Hermes CLI
//!
//! Unified Hermes CLI calling layer.

use std::time::Duration;
use tokio::process::Command;

/// CLI execution result
#[derive(Debug, Clone)]
pub struct CliResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub success: bool,
}

/// Hermes CLI caller
pub struct HermesCli {
    wsl_enabled: bool,
    timeout: Duration,
}

impl HermesCli {
    pub fn new() -> Self {
        Self {
            wsl_enabled: cfg!(windows),
            timeout: Duration::from_secs(30),
        }
    }

    /// Execute Hermes CLI command
    pub async fn execute(&self, args: &[&str]) -> Result<CliResult, String> {
        self.execute_with_timeout(args, self.timeout).await
    }

    /// Execute command with timeout
    pub async fn execute_with_timeout(
        &self,
        args: &[&str],
        timeout: Duration,
    ) -> Result<CliResult, String> {
        // Build command
        let mut cmd = if self.wsl_enabled {
            let mut c = Command::new("wsl");
            c.arg("-e").arg("hermes");
            c.args(args);
            c
        } else {
            let mut c = Command::new("hermes");
            c.args(args);
            c
        };

        // Execute with timeout
        let output = tokio::time::timeout(timeout, cmd.output())
            .await
            .map_err(|_| format!("Command timed out after {:?}", timeout))?
            .map_err(|e| format!("Failed to execute command: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);
        let success = output.status.success();

        println!("[HermesCli] Executed: hermes {} (exit: {})", args.join(" "), exit_code);

        Ok(CliResult {
            stdout,
            stderr,
            exit_code,
            success,
        })
    }

    /// Gateway commands
    pub async fn start_gateway(&self) -> Result<(), String> {
        let result = self.execute(&["gateway", "start"]).await?;
        if !result.success {
            return Err(format!("Failed to start gateway: {}", result.stderr));
        }
        Ok(())
    }

    pub async fn stop_gateway(&self) -> Result<(), String> {
        let result = self.execute(&["gateway", "stop"]).await?;
        if !result.success {
            return Err(format!("Failed to stop gateway: {}", result.stderr));
        }
        Ok(())
    }

    /// MCP commands
    pub async fn get_mcp_tools(&self, server_name: &str) -> Result<Vec<serde_json::Value>, String> {
        let result = self.execute(&["mcp", "tools", server_name, "--json"]).await?;
        if !result.success {
            return Err(format!("Failed to get MCP tools: {}", result.stderr));
        }
        
        serde_json::from_str(&result.stdout)
            .map_err(|e| format!("Failed to parse tools: {}", e))
    }

    pub async fn get_mcp_resources(&self, server_name: &str) -> Result<Vec<serde_json::Value>, String> {
        let result = self.execute(&["mcp", "resources", server_name, "--json"]).await?;
        if !result.success {
            return Err(format!("Failed to get MCP resources: {}", result.stderr));
        }
        
        serde_json::from_str(&result.stdout)
            .map_err(|e| format!("Failed to parse resources: {}", e))
    }
}

impl Default for HermesCli {
    fn default() -> Self {
        Self::new()
    }
}
