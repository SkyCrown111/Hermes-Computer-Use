//! Unified Hermes CLI bridge for Rust command modules.
//!
//! Prefer this module over ad-hoc `wsl`/`bash` invocations when calling the `hermes` CLI.

use crate::core::errors::{HermesError, Result};
use crate::core::hermes_cli::{CliResult, HermesCli};
use std::time::Duration;

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
    use super::HermesCli;

    #[test]
    fn hermes_cli_can_be_constructed() {
        let _ = HermesCli::new();
    }
}
