//! Hermes CLI
//!
//! Unified Hermes CLI calling layer.

use std::time::Duration;
use tokio::process::Command;
use crate::core::errors::{HermesError, Result};
use crate::core::retry::{retry_async_if, is_retryable_error, RetryPolicy};

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

    /// Execute Hermes CLI command with automatic retry
    pub async fn execute(&self, args: &[&str]) -> Result<CliResult> {
        self.execute_with_timeout(args, self.timeout).await
    }

    /// Execute command with timeout and retry logic
    pub async fn execute_with_timeout(
        &self,
        args: &[&str],
        timeout: Duration,
    ) -> Result<CliResult> {
        let retry_policy = RetryPolicy::new()
            .with_max_retries(2)
            .with_initial_delay(Duration::from_millis(500));

        // Clone args for use in retry closure
        let args_vec: Vec<String> = args.iter().map(|s| s.to_string()).collect();
        let wsl_enabled = self.wsl_enabled;

        retry_async_if(&retry_policy, || async {
            // Build command
            let mut cmd = if wsl_enabled {
                let mut c = Command::new("wsl");
                c.arg("-e").arg("hermes");
                for arg in &args_vec {
                    c.arg(arg);
                }
                c
            } else {
                let mut c = Command::new("hermes");
                for arg in &args_vec {
                    c.arg(arg);
                }
                c
            };

            // Execute with timeout
            let output = tokio::time::timeout(timeout, cmd.output())
                .await
                .map_err(|_| HermesError::timeout(
                    format!("Command timed out: hermes {}", args_vec.join(" ")),
                    timeout.as_millis() as u64
                ))?
                .map_err(|e| HermesError::CliError {
                    code: "CLI_EXEC_FAILED",
                    message: format!("Failed to execute command: {}", e),
                    command: Some(format!("hermes {}", args_vec.join(" "))),
                    exit_code: None,
                })?;

            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code().unwrap_or(-1);
            let success = output.status.success();

            println!("[HermesCli] Executed: hermes {} (exit: {})", args_vec.join(" "), exit_code);

            if !success && exit_code != 0 {
                return Err(HermesError::cli_failed(
                    format!("hermes {}", args_vec.join(" ")),
                    exit_code
                ));
            }

            Ok(CliResult {
                stdout,
                stderr,
                exit_code,
                success,
            })
        }, is_retryable_error).await
    }

    /// Gateway commands
    pub async fn start_gateway(&self) -> Result<()> {
        let result = self.execute(&["gateway", "start"]).await?;
        if !result.success {
            return Err(HermesError::CliError {
                code: "GATEWAY_START_FAILED",
                message: format!("Failed to start gateway: {}", result.stderr),
                command: Some("hermes gateway start".to_string()),
                exit_code: Some(result.exit_code),
            });
        }
        Ok(())
    }

    pub async fn stop_gateway(&self) -> Result<()> {
        let result = self.execute(&["gateway", "stop"]).await?;
        if !result.success {
            return Err(HermesError::CliError {
                code: "GATEWAY_STOP_FAILED",
                message: format!("Failed to stop gateway: {}", result.stderr),
                command: Some("hermes gateway stop".to_string()),
                exit_code: Some(result.exit_code),
            });
        }
        Ok(())
    }

    /// MCP commands
    pub async fn get_mcp_tools(&self, server_name: &str) -> Result<Vec<serde_json::Value>> {
        let result = self.execute(&["mcp", "tools", server_name, "--json"]).await?;
        if !result.success {
            return Err(HermesError::CliError {
                code: "MCP_TOOLS_FAILED",
                message: format!("Failed to get MCP tools: {}", result.stderr),
                command: Some(format!("hermes mcp tools {} --json", server_name)),
                exit_code: Some(result.exit_code),
            });
        }
        
        serde_json::from_str(&result.stdout)
            .map_err(|e| e.into())
    }

    pub async fn get_mcp_resources(&self, server_name: &str) -> Result<Vec<serde_json::Value>> {
        let result = self.execute(&["mcp", "resources", server_name, "--json"]).await?;
        if !result.success {
            return Err(HermesError::CliError {
                code: "MCP_RESOURCES_FAILED",
                message: format!("Failed to get MCP resources: {}", result.stderr),
                command: Some(format!("hermes mcp resources {} --json", server_name)),
                exit_code: Some(result.exit_code),
            });
        }
        
        serde_json::from_str(&result.stdout)
            .map_err(|e| e.into())
    }
}

impl Default for HermesCli {
    fn default() -> Self {
        Self::new()
    }
}
