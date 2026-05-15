use serde::{Deserialize, Serialize};

use super::{errors::HermesAdapterError, paths::HermesPaths};
use crate::commands::utils::run_shell_command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesRuntime {
    pub python_path: Option<String>,
    pub cli_command: Option<String>,
    pub agent_root: Option<String>,
    pub import_root: Option<String>,
}

fn shell_probe(command: &str) -> Option<String> {
    let output = run_shell_command(command).ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        None
    } else {
        Some(stdout)
    }
}

pub fn resolve_runtime(paths: &HermesPaths) -> Result<HermesRuntime, HermesAdapterError> {
    let python_path = [
        format!("{}/hermes-agent/.venv/bin/python", paths.hermes_home),
        format!("{}/hermes-agent/venv/bin/python", paths.hermes_home),
    ]
    .iter()
    .find_map(|candidate| {
        shell_probe(&format!(
            "test -f '{}' && printf '%s' '{}' || true",
            candidate, candidate
        ))
    })
    .or_else(|| {
        ["python3", "python"].iter().find_map(|cmd| {
            shell_probe(&format!(
                "{cmd} -c 'import hermes_agent' >/dev/null 2>&1 && printf '%s' '{cmd}' || true"
            ))
        })
    });

    let cli_command = shell_probe("command -v hermes || true");

    let agent_root = [
        format!("{}/hermes-agent", paths.hermes_home),
        format!("{}/hermes-agent/src", paths.hermes_home),
    ]
    .iter()
    .find_map(|candidate| {
        shell_probe(&format!(
            "test -d '{}' && printf '%s' '{}' || true",
            candidate, candidate
        ))
    });

    let import_root = [
        format!("{}/hermes-agent/src", paths.hermes_home),
        format!("{}/hermes-agent", paths.hermes_home),
    ]
    .iter()
    .find_map(|candidate| {
        shell_probe(&format!(
            "test -d '{}' && printf '%s' '{}' || true",
            candidate, candidate
        ))
    });

    if python_path.is_none() && cli_command.is_none() && agent_root.is_none() {
        return Err(HermesAdapterError::HermesRuntimeNotFound);
    }

    Ok(HermesRuntime {
        python_path,
        cli_command,
        agent_root,
        import_root,
    })
}
