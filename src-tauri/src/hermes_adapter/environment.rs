use serde::{Deserialize, Serialize};

use super::{
    capabilities::{detect_capabilities, HermesCapabilities},
    errors::HermesAdapterError,
    paths::HermesPaths,
    runtime::{resolve_runtime, HermesRuntime},
};
use crate::commands::utils::{needs_wsl, run_shell_command};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesEnvironment {
    pub hermes_home: String,
    pub active_profile: Option<String>,
    pub runtime: HermesRuntime,
    pub paths: HermesPaths,
    pub capabilities: HermesCapabilities,
    pub uses_wsl: bool,
}

fn resolve_hermes_home() -> Result<String, HermesAdapterError> {
    let output = run_shell_command("printf '%s' \"${HERMES_HOME:-$HOME/.hermes}\"")
        .map_err(HermesAdapterError::CommandFailed)?;
    if !output.status.success() {
        return Err(HermesAdapterError::HermesHomeNotFound);
    }
    let home = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if home.is_empty() {
        return Err(HermesAdapterError::HermesHomeNotFound);
    }
    Ok(home)
}

fn resolve_active_profile() -> Option<String> {
    let output = run_shell_command("printf '%s' \"${HERMES_PROFILE:-}\"").ok()?;
    if !output.status.success() {
        return None;
    }
    let profile = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if profile.is_empty() {
        None
    } else {
        Some(profile)
    }
}

pub fn resolve_environment() -> Result<HermesEnvironment, HermesAdapterError> {
    println!("[HermesAdapter] Resolving Hermes environment...");
    let hermes_home = resolve_hermes_home()?;
    let paths = HermesPaths::from_home(&hermes_home);
    let runtime = resolve_runtime(&paths)?;
    let capabilities = detect_capabilities(&paths, &runtime);

    Ok(HermesEnvironment {
        hermes_home,
        active_profile: resolve_active_profile(),
        runtime,
        paths,
        capabilities,
        uses_wsl: needs_wsl(),
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_hermes_environment() -> Result<HermesEnvironment, String> {
    resolve_environment().map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_hermes_paths() -> Result<HermesPaths, String> {
    resolve_environment()
        .map(|env| env.paths)
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_hermes_runtime() -> Result<HermesRuntime, String> {
    resolve_environment()
        .map(|env| env.runtime)
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn check_hermes_capabilities() -> Result<HermesCapabilities, String> {
    resolve_environment()
        .map(|env| env.capabilities)
        .map_err(|e| e.to_string())
}
