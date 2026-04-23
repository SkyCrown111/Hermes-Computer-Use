//! Configuration Commands
//!
//! Commands for loading and saving Hermes Agent configuration.

use serde::{Deserialize, Serialize};
use std::fs;
use super::utils::{get_hermes_data_dir, create_command};

/// Model configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelConfig {
    pub default: Option<String>,
    pub provider: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
}

/// Agent configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentConfig {
    pub max_turns: Option<i32>,
    pub timeout: Option<i32>,
    pub reasoning_effort: Option<String>,
}

/// Terminal configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TerminalConfig {
    pub backend: Option<String>,
    pub timeout: Option<i32>,
    pub cwd: Option<String>,
}

/// Compression configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CompressionConfig {
    pub enabled: Option<bool>,
    pub threshold: Option<f64>,
    pub target_ratio: Option<f64>,
}

/// Checkpoint configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CheckpointConfig {
    pub enabled: Option<bool>,
    pub max_snapshots: Option<i32>,
}

/// Hermes configuration structure
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HermesConfig {
    /// Raw config.yaml content
    pub raw: Option<String>,
    /// Agent mode
    pub agent_mode: Option<String>,
    /// Active workspace roots
    pub active_workspace_roots: Option<Vec<String>>,
    /// Model configuration
    pub model: Option<ModelConfig>,
    /// Agent configuration
    pub agent: Option<AgentConfig>,
    /// Terminal configuration
    pub terminal: Option<TerminalConfig>,
    /// Compression configuration
    pub compression: Option<CompressionConfig>,
    /// Checkpoint configuration
    pub checkpoint: Option<CheckpointConfig>,
}

/// Read file content, trying WSL first then Windows
fn read_file_content(path_in_hermes: &str) -> Option<String> {
    // Try WSL command first
    let wsl_path = format!("~/.hermes/{}", path_in_hermes);
    if let Ok(output) = create_command("wsl")
        .args(["cat", &wsl_path])
        .output()
    {
        if output.status.success() && !output.stdout.is_empty() {
            return Some(String::from_utf8_lossy(&output.stdout).to_string());
        }
    }

    // Fallback to Windows path
    let data_dir = get_hermes_data_dir();
    let file_path = data_dir.join(path_in_hermes);
    if file_path.exists() {
        return fs::read_to_string(&file_path).ok();
    }

    None
}

/// Parse YAML config into structured config
fn parse_config(yaml_content: &str) -> HermesConfig {
    let mut config = HermesConfig {
        raw: Some(yaml_content.to_string()),
        ..Default::default()
    };

    // Track current YAML section based on indentation
    let mut current_section: Option<&str> = None;
    let mut section_indent: usize = 0;

    for line in yaml_content.lines() {
        let trimmed = line.trim();

        // Skip empty lines and comments
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        // Calculate indentation level
        let indent = line.len() - line.trim_start().len();

        // Detect top-level sections (no indentation)
        if indent == 0 && trimmed.ends_with(':') && !trimmed.contains(' ') {
            current_section = Some(trimmed.trim_end_matches(':'));
            section_indent = 0;
            continue;
        }

        // Update section if we're back to a lower indentation
        if indent <= section_indent {
            current_section = None;
        }

        // Only parse fields inside specific sections
        match current_section {
            Some("model") => {
                // Only parse model fields at indent level 2 (inside model:)
                if indent == 2 {
                    if trimmed.starts_with("default:") {
                        config.model.get_or_insert_with(Default::default).default =
                            Some(trimmed.strip_prefix("default:").unwrap_or("").trim().trim_matches('"').to_string());
                    } else if trimmed.starts_with("provider:") {
                        config.model.get_or_insert_with(Default::default).provider =
                            Some(trimmed.strip_prefix("provider:").unwrap_or("").trim().trim_matches('"').to_string());
                    } else if trimmed.starts_with("api_key:") {
                        config.model.get_or_insert_with(Default::default).api_key =
                            Some(trimmed.strip_prefix("api_key:").unwrap_or("").trim().trim_matches('"').to_string());
                    } else if trimmed.starts_with("base_url:") {
                        config.model.get_or_insert_with(Default::default).base_url =
                            Some(trimmed.strip_prefix("base_url:").unwrap_or("").trim().trim_matches('"').to_string());
                    }
                }
                section_indent = indent;
            }
            Some("agent") => {
                if indent == 2 {
                    if trimmed.starts_with("max_turns:") {
                        config.agent.get_or_insert_with(Default::default).max_turns =
                            trimmed.strip_prefix("max_turns:").unwrap_or("").trim().parse().ok();
                    } else if trimmed.starts_with("timeout:") {
                        config.agent.get_or_insert_with(Default::default).timeout =
                            trimmed.strip_prefix("timeout:").unwrap_or("").trim().parse().ok();
                    } else if trimmed.starts_with("reasoning_effort:") {
                        config.agent.get_or_insert_with(Default::default).reasoning_effort =
                            Some(trimmed.strip_prefix("reasoning_effort:").unwrap_or("").trim().trim_matches('"').to_string());
                    }
                }
                section_indent = indent;
            }
            Some("terminal") => {
                if indent == 2 {
                    if trimmed.starts_with("backend:") {
                        config.terminal.get_or_insert_with(Default::default).backend =
                            Some(trimmed.strip_prefix("backend:").unwrap_or("").trim().trim_matches('"').to_string());
                    } else if trimmed.starts_with("timeout:") {
                        config.terminal.get_or_insert_with(Default::default).timeout =
                            trimmed.strip_prefix("timeout:").unwrap_or("").trim().parse().ok();
                    } else if trimmed.starts_with("cwd:") {
                        config.terminal.get_or_insert_with(Default::default).cwd =
                            Some(trimmed.strip_prefix("cwd:").unwrap_or("").trim().trim_matches('"').to_string());
                    }
                }
                section_indent = indent;
            }
            Some("compression") => {
                if indent == 2 {
                    if trimmed.starts_with("enabled:") {
                        config.compression.get_or_insert_with(Default::default).enabled =
                            trimmed.strip_prefix("enabled:").unwrap_or("").trim().parse().ok();
                    } else if trimmed.starts_with("threshold:") {
                        config.compression.get_or_insert_with(Default::default).threshold =
                            trimmed.strip_prefix("threshold:").unwrap_or("").trim().parse().ok();
                    } else if trimmed.starts_with("target_ratio:") {
                        config.compression.get_or_insert_with(Default::default).target_ratio =
                            trimmed.strip_prefix("target_ratio:").unwrap_or("").trim().parse().ok();
                    }
                }
                section_indent = indent;
            }
            Some("checkpoints") => {
                if indent == 2 {
                    if trimmed.starts_with("enabled:") {
                        config.checkpoint.get_or_insert_with(Default::default).enabled =
                            trimmed.strip_prefix("enabled:").unwrap_or("").trim().parse().ok();
                    } else if trimmed.starts_with("max_snapshots:") {
                        config.checkpoint.get_or_insert_with(Default::default).max_snapshots =
                            trimmed.strip_prefix("max_snapshots:").unwrap_or("").trim().parse().ok();
                    }
                }
                section_indent = indent;
            }
            _ => {}
        }
    }

    config
}

/// Load Hermes configuration
#[tauri::command]
pub fn load_config() -> Result<HermesConfig, String> {
    println!("[Config] Loading configuration...");

    // Try WSL first (primary location for Hermes Agent)
    if let Ok(output) = create_command("wsl")
        .args(["cat", "~/.hermes/config.yaml"])
        .output()
    {
        if output.status.success() && !output.stdout.is_empty() {
            let raw = String::from_utf8_lossy(&output.stdout).to_string();
            println!("[Config] Raw YAML:\n{}", raw);
            let config = parse_config(&raw);
            println!("[Config] Parsed config - model: {:?}, provider: {:?}",
                config.model.as_ref().and_then(|m| m.default.as_ref()),
                config.model.as_ref().and_then(|m| m.provider.as_ref()));
            // Log the serialized JSON for debugging
            match serde_json::to_string_pretty(&config) {
                Ok(json) => println!("[Config] Serialized JSON:\n{}", json),
                Err(e) => println!("[Config] Failed to serialize JSON: {}", e),
            }
            return Ok(config);
        }
    }

    // Fallback to Windows path
    if let Some(raw) = read_file_content("config.yaml") {
        let config = parse_config(&raw);
        println!("[Config] Loaded from Windows - model: {:?}, provider: {:?}",
            config.model.as_ref().and_then(|m| m.default.as_ref()),
            config.model.as_ref().and_then(|m| m.provider.as_ref()));
        return Ok(config);
    }

    println!("[Config] No configuration found, returning defaults");
    Ok(HermesConfig::default())
}

/// Helper function to set a config value using Hermes CLI
fn hermes_config_set(key: &str, value: &str) -> Result<(), String> {
    println!("[Config] Setting {} = {}", key, value);

    let output = create_command("wsl")
        .args(["-e", "bash", "-c",
            &format!("~/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main config set {} '{}'",
                key, value.replace("'", "'\\''"))])
        .output()
        .map_err(|e| format!("Failed to run hermes config set: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to set {}: {}", key, stderr));
    }

    Ok(())
}

/// Save Hermes configuration - uses Hermes CLI for proper YAML handling
#[tauri::command]
pub fn save_config(config: HermesConfig) -> Result<(), String> {
    println!("[Config] Saving configuration...");
    println!("[Config] Received config: {:?}", config);

    // If raw content is provided, write directly
    if let Some(raw) = &config.raw {
        let script = format!("cat > ~/.hermes/config.yaml << 'HERMES_CONFIG_EOF'\n{}\nHERMES_CONFIG_EOF", raw);
        let wsl_result = create_command("wsl")
            .args(["bash", "-c", &script])
            .output();

        if wsl_result.is_ok() && wsl_result.unwrap().status.success() {
            println!("[Config] Raw configuration saved to WSL");
            return Ok(());
        }
    }

    // Use Hermes CLI to set individual config values
    // This ensures proper YAML handling and validation

    // Model config
    if let Some(model) = &config.model {
        println!("[Config] Model config: {:?}", model);
        if let Some(default) = &model.default {
            if !default.is_empty() {
                hermes_config_set("model.default", default)?;
            }
        }
        if let Some(provider) = &model.provider {
            if !provider.is_empty() {
                hermes_config_set("model.provider", provider)?;
            }
        }
        if let Some(api_key) = &model.api_key {
            if !api_key.is_empty() {
                hermes_config_set("model.api_key", api_key)?;
            }
        }
        if let Some(base_url) = &model.base_url {
            if !base_url.is_empty() {
                hermes_config_set("model.base_url", base_url)?;
            }
        }
    } else {
        println!("[Config] No model config provided");
    }

    // Agent config
    if let Some(agent) = &config.agent {
        println!("[Config] Agent config: {:?}", agent);
        if let Some(max_turns) = agent.max_turns {
            hermes_config_set("agent.max_turns", &max_turns.to_string())?;
        }
        if let Some(timeout) = agent.timeout {
            hermes_config_set("agent.timeout", &timeout.to_string())?;
        }
        if let Some(reasoning_effort) = &agent.reasoning_effort {
            if !reasoning_effort.is_empty() {
                hermes_config_set("agent.reasoning_effort", reasoning_effort)?;
            }
        }
    }

    // Terminal config
    if let Some(terminal) = &config.terminal {
        if let Some(backend) = &terminal.backend {
            if !backend.is_empty() {
                hermes_config_set("terminal.backend", backend)?;
            }
        }
        if let Some(timeout) = terminal.timeout {
            hermes_config_set("terminal.timeout", &timeout.to_string())?;
        }
        if let Some(cwd) = &terminal.cwd {
            if !cwd.is_empty() {
                hermes_config_set("terminal.cwd", cwd)?;
            }
        }
    }

    // Compression config
    if let Some(compression) = &config.compression {
        if let Some(enabled) = compression.enabled {
            hermes_config_set("compression.enabled", &enabled.to_string())?;
        }
        if let Some(threshold) = compression.threshold {
            hermes_config_set("compression.threshold", &threshold.to_string())?;
        }
        if let Some(target_ratio) = compression.target_ratio {
            hermes_config_set("compression.target_ratio", &target_ratio.to_string())?;
        }
    }

    // Checkpoint config
    if let Some(checkpoint) = &config.checkpoint {
        if let Some(enabled) = checkpoint.enabled {
            hermes_config_set("checkpoints.enabled", &enabled.to_string())?;
        }
        if let Some(max_snapshots) = checkpoint.max_snapshots {
            hermes_config_set("checkpoints.max_snapshots", &max_snapshots.to_string())?;
        }
    }

    println!("[Config] Configuration saved successfully via Hermes CLI");
    Ok(())
}

/// Get the Hermes data directory path
#[tauri::command]
pub fn get_data_dir() -> String {
    get_hermes_data_dir().to_string_lossy().to_string()
}

/// Check if Hermes data directory exists (async)
#[tauri::command]
pub async fn check_data_dir_exists() -> bool {
    println!("[Config] Checking if Hermes data directory exists...");
    // Use spawn_blocking to avoid blocking main thread
    let result = tokio::task::spawn_blocking(|| {
        // Check WSL first
        if let Ok(output) = create_command("wsl")
            .args(["bash", "-c", "test -d ~/.hermes && echo yes"])
            .output()
        {
            if output.status.success() {
                let result = String::from_utf8_lossy(&output.stdout);
                println!("[Config] WSL check result: '{}'", result.trim());
                if result.trim() == "yes" {
                    return true;
                }
            }
        }

        // Fallback to Windows path
        let exists = get_hermes_data_dir().exists();
        println!("[Config] Windows path check: {}", exists);
        exists
    }).await.unwrap_or(false);

    println!("[Config] check_data_dir_exists returning: {}", result);
    result
}
