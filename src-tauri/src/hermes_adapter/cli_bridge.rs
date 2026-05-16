#![allow(dead_code)]
//! Unified Hermes CLI bridge for Rust command modules.
//!
//! Prefer [`crate::core::HermesCli`] from Tauri app state (`Arc<HermesCli>`) in commands. This module
//! wraps a short-lived [`HermesCli`] when shared state is unavailable.

use crate::core::errors::{HermesError, Result};
use crate::core::hermes_cli::{CliResult, HermesCli};
use std::time::Duration;

/// Synchronous wrapper: same as [`HermesCli::execute_sync`] on a short-lived client.
pub fn execute_hermes_sync(args: &[&str]) -> Result<CliResult> {
    HermesCli::new().execute_sync(args)
}

/// Execute a Hermes CLI command and return structured output.
pub async fn execute_hermes(args: &[&str]) -> Result<CliResult> {
    HermesCli::new().execute(args).await
}

/// Execute with a custom timeout.
pub async fn execute_hermes_with_timeout(
    args: &[&str],
    timeout: Duration,
) -> Result<CliResult> {
    HermesCli::new().execute_with_timeout(args, timeout).await
}

/// Execute and return stdout on success, or a user-facing error string for Tauri commands.
pub async fn execute_hermes_stdout(args: &[&str]) -> std::result::Result<String, String> {
    let result = execute_hermes(args).await.map_err(String::from)?;
    if result.success {
        Ok(result.stdout)
    } else {
        Err(HermesError::CliError {
            code: "CLI_FAILED",
            message: if result.stderr.is_empty() {
                "Hermes CLI command failed".to_string()
            } else {
                result.stderr.clone()
            },
            command: Some(format!("hermes {}", args.join(" "))),
            exit_code: Some(result.exit_code),
        }
        .into())
    }
}

#[cfg(test)]
mod tests {
    use super::{execute_hermes_sync, HermesCli};

    #[test]
    fn hermes_cli_can_be_constructed() {
        let _ = HermesCli::new();
    }

    #[test]
    fn execute_hermes_sync_smoke() {
        let _ = execute_hermes_sync(&["--version"]);
    }
}
