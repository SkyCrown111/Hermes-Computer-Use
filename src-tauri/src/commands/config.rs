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

/// Parse YAML config into structured config using serde_yaml
fn parse_config(yaml_content: &str) -> HermesConfig {
    let mut config = HermesConfig {
        raw: Some(yaml_content.to_string()),
        ..Default::default()
    };

    // Parse YAML to generic value (handles comments, variable indentation, etc.)
    let root: serde_yaml::Value = match serde_yaml::from_str(yaml_content) {
        Ok(v) => v,
        Err(e) => {
            println!("[Config] Failed to parse YAML with serde_yaml: {}", e);
            return config;
        }
    };
    let root = match root.as_mapping() {
        Some(m) => m,
        None => return config,
    };

    /// Helper: get a string field from a mapping at a given key
    fn get_str(map: &serde_yaml::Mapping, key: &str) -> Option<String> {
        map.get(&serde_yaml::Value::String(key.to_string()))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    }

    /// Helper: get an integer field from a mapping at a given key
    fn get_i64(map: &serde_yaml::Mapping, key: &str) -> Option<i64> {
        map.get(&serde_yaml::Value::String(key.to_string()))
            .and_then(|v| v.as_i64())
    }

    /// Helper: get a boolean field from a mapping at a given key
    fn get_bool(map: &serde_yaml::Mapping, key: &str) -> Option<bool> {
        map.get(&serde_yaml::Value::String(key.to_string()))
            .and_then(|v| v.as_bool())
    }

    /// Helper: get a float field from a mapping at a given key
    fn get_f64(map: &serde_yaml::Mapping, key: &str) -> Option<f64> {
        map.get(&serde_yaml::Value::String(key.to_string()))
            .and_then(|v| v.as_f64())
    }

    // Extract model section
    if let Some(model_map) = root.get(&serde_yaml::Value::String("model".to_string()))
        .and_then(|v| v.as_mapping())
    {
        config.model = Some(ModelConfig {
            default: get_str(model_map, "default"),
            provider: get_str(model_map, "provider"),
            api_key: get_str(model_map, "api_key"),
            base_url: get_str(model_map, "base_url"),
        });
    }

    // Extract agent section
    if let Some(agent_map) = root.get(&serde_yaml::Value::String("agent".to_string()))
        .and_then(|v| v.as_mapping())
    {
        config.agent = Some(AgentConfig {
            max_turns: get_i64(agent_map, "max_turns").map(|v| v as i32),
            timeout: get_i64(agent_map, "timeout").map(|v| v as i32),
            reasoning_effort: get_str(agent_map, "reasoning_effort"),
        });
    }

    // Extract terminal section
    if let Some(terminal_map) = root.get(&serde_yaml::Value::String("terminal".to_string()))
        .and_then(|v| v.as_mapping())
    {
        config.terminal = Some(TerminalConfig {
            backend: get_str(terminal_map, "backend"),
            timeout: get_i64(terminal_map, "timeout").map(|v| v as i32),
            cwd: get_str(terminal_map, "cwd"),
        });
    }

    // Extract compression section
    if let Some(compression_map) = root.get(&serde_yaml::Value::String("compression".to_string()))
        .and_then(|v| v.as_mapping())
    {
        config.compression = Some(CompressionConfig {
            enabled: get_bool(compression_map, "enabled"),
            threshold: get_f64(compression_map, "threshold"),
            target_ratio: get_f64(compression_map, "target_ratio"),
        });
    }

    // Extract checkpoints section
    if let Some(checkpoint_map) = root.get(&serde_yaml::Value::String("checkpoints".to_string()))
        .and_then(|v| v.as_mapping())
    {
        config.checkpoint = Some(CheckpointConfig {
            enabled: get_bool(checkpoint_map, "enabled"),
            max_snapshots: get_i64(checkpoint_map, "max_snapshots").map(|v| v as i32),
        });
    }

    config
}

/// Mask API key for frontend display, keeping only last 4 chars
fn mask_api_key(key: &str) -> String {
    if key.len() <= 8 {
        return "••••••••".to_string();
    }
    let visible = &key[key.len()-4..];
    format!("••••••••{}", visible)
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
            let mut config = parse_config(&raw);
            // Mask API key before sending to frontend
            if let Some(ref mut model) = config.model {
                if let Some(ref api_key) = model.api_key.clone() {
                    model.api_key = Some(mask_api_key(api_key));
                }
            }
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
        let mut config = parse_config(&raw);
        // Mask API key before sending to frontend
        if let Some(ref mut model) = config.model {
            if let Some(ref api_key) = model.api_key.clone() {
                model.api_key = Some(mask_api_key(api_key));
            }
        }
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
            if !api_key.is_empty() && !api_key.starts_with("••••••••") {
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
