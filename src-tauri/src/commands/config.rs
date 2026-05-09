//! Configuration Commands
//!
//! Commands for loading and saving Hermes Agent configuration.
//! Uses direct YAML file manipulation instead of CLI commands,
//! ensuring all config sections (model, agent, terminal, compression,
//! checkpoint, providers, memory, auxiliary, display, approval) are
//! properly read and written.

use super::utils::{create_command, get_hermes_data_dir};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs;

// ============================================================================
// Config Structs
// ============================================================================

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

/// Memory configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MemoryConfig {
    pub enabled: Option<bool>,
    pub max_chars: Option<i32>,
    pub auto_cleanup: Option<bool>,
    pub cleanup_threshold: Option<i32>,
    pub retention_days: Option<i32>,
}

/// Approval configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ApprovalConfig {
    pub mode: Option<String>,
    pub safe_commands: Option<Vec<String>>,
    pub dangerous_commands: Option<Vec<String>>,
    pub remember_session: Option<bool>,
    pub show_command_preview: Option<bool>,
    pub timeout_seconds: Option<i32>,
}

/// Display configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DisplayConfig {
    pub compact: Option<bool>,
    pub skin: Option<String>,
    pub streaming: Option<bool>,
    pub show_reasoning: Option<bool>,
    pub tool_preview: Option<bool>,
    pub personality: Option<String>,
    pub resume_display: Option<String>,
    pub busy_input_mode: Option<String>,
    pub bell_on_complete: Option<bool>,
    pub final_response_markdown: Option<String>,
    pub inline_diffs: Option<bool>,
    pub show_cost: Option<bool>,
    pub tool_progress: Option<String>,
}

/// Custom provider entry
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CustomProvider {
    pub name: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub api_mode: Option<String>,
    pub key_env: Option<String>,
}

/// Fallback provider entry
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FallbackProvider {
    pub name: Option<String>,
    pub model: Option<String>,
    pub priority: Option<i32>,
}

/// Providers configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProvidersConfig {
    pub custom_providers: Option<Vec<CustomProvider>>,
    pub fallback_providers: Option<Vec<FallbackProvider>>,
    pub credential_pool_strategies: Option<serde_json::Value>,
}

/// Auxiliary task config
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AuxiliaryTaskConfig {
    pub model: Option<String>,
    pub provider: Option<String>,
    pub enabled: Option<bool>,
}

/// Auxiliary configuration (dynamic map of task types)
pub type AuxiliaryConfig = serde_json::Value;

/// Hermes configuration structure — all sections
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
    /// Memory configuration
    pub memory: Option<MemoryConfig>,
    /// Approval configuration
    pub approval: Option<ApprovalConfig>,
    /// Display configuration
    pub display: Option<DisplayConfig>,
    /// Providers configuration
    pub providers: Option<ProvidersConfig>,
    /// Auxiliary configuration
    pub auxiliary: Option<AuxiliaryConfig>,
}

// ============================================================================
// Mask marker for API keys sent to frontend
// ============================================================================

/// Mask API key for frontend display: `__MASKED__<last4>`
/// This format is:
///   - Consistent and machine-detectable (starts with `__MASKED__`)
///   - Gives the user a preview of which key is configured (last 4 chars)
///   - Not confusable with real API keys
fn mask_api_key(key: &str) -> String {
    if key.len() <= 4 {
        return "__MASKED__".to_string();
    }
    let visible = &key[key.len() - 4..];
    format!("__MASKED__{}", visible)
}

/// Check if a string is a masked API key (from our mask format or legacy ••• format)
fn is_masked_api_key(value: &str) -> bool {
    value.starts_with("__MASKED__")
        || value.starts_with('\u{2022}')
        || (value.contains("****") && value.contains("sk-"))
        || value.chars().all(|c| c == '\u{2022}')
}

// ============================================================================
// File Helpers
// ============================================================================

/// Read file content, trying WSL first then Windows
fn read_file_content(path_in_hermes: &str) -> Option<String> {
    // Try WSL command first
    let wsl_path = format!("~/.hermes/{}", path_in_hermes);
    if let Ok(output) = create_command("wsl").args(["cat", &wsl_path]).output() {
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

// ============================================================================
// YAML Parsing
// ============================================================================

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
        map.get(serde_yaml::Value::String(key.to_string()))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    }

    /// Helper: get an integer field from a mapping at a given key
    fn get_i64(map: &serde_yaml::Mapping, key: &str) -> Option<i64> {
        map.get(serde_yaml::Value::String(key.to_string()))
            .and_then(|v| v.as_i64())
    }

    /// Helper: get a boolean field from a mapping at a given key
    fn get_bool(map: &serde_yaml::Mapping, key: &str) -> Option<bool> {
        map.get(serde_yaml::Value::String(key.to_string()))
            .and_then(|v| v.as_bool())
    }

    /// Helper: get a float field from a mapping at a given key
    fn get_f64(map: &serde_yaml::Mapping, key: &str) -> Option<f64> {
        map.get(serde_yaml::Value::String(key.to_string()))
            .and_then(|v| v.as_f64())
    }

    /// Helper: get a section mapping by key
    fn get_section<'a>(root: &'a serde_yaml::Mapping, key: &str) -> Option<&'a serde_yaml::Mapping> {
        root.get(serde_yaml::Value::String(key.to_string()))
            .and_then(|v| v.as_mapping())
    }

    // Extract model section
    if let Some(m) = get_section(root, "model") {
        config.model = Some(ModelConfig {
            default: get_str(m, "default"),
            provider: get_str(m, "provider"),
            api_key: get_str(m, "api_key"),
            base_url: get_str(m, "base_url"),
        });
    }

    // Extract agent section
    if let Some(m) = get_section(root, "agent") {
        config.agent = Some(AgentConfig {
            max_turns: get_i64(m, "max_turns").map(|v| v as i32),
            timeout: get_i64(m, "timeout").map(|v| v as i32),
            reasoning_effort: get_str(m, "reasoning_effort"),
        });
    }

    // Extract terminal section
    if let Some(m) = get_section(root, "terminal") {
        config.terminal = Some(TerminalConfig {
            backend: get_str(m, "backend"),
            timeout: get_i64(m, "timeout").map(|v| v as i32),
            cwd: get_str(m, "cwd"),
        });
    }

    // Extract compression section
    if let Some(m) = get_section(root, "compression") {
        config.compression = Some(CompressionConfig {
            enabled: get_bool(m, "enabled"),
            threshold: get_f64(m, "threshold"),
            target_ratio: get_f64(m, "target_ratio"),
        });
    }

    // Extract checkpoints section (note: YAML key is "checkpoints", struct field is "checkpoint")
    if let Some(m) = get_section(root, "checkpoints") {
        config.checkpoint = Some(CheckpointConfig {
            enabled: get_bool(m, "enabled"),
            max_snapshots: get_i64(m, "max_snapshots").map(|v| v as i32),
        });
    }

    // Extract memory section
    if let Some(m) = get_section(root, "memory") {
        config.memory = Some(MemoryConfig {
            enabled: get_bool(m, "enabled"),
            max_chars: get_i64(m, "max_chars").map(|v| v as i32),
            auto_cleanup: get_bool(m, "auto_cleanup"),
            cleanup_threshold: get_i64(m, "cleanup_threshold").map(|v| v as i32),
            retention_days: get_i64(m, "retention_days").map(|v| v as i32),
        });
    }

    // Extract approval section
    if let Some(m) = get_section(root, "approval") {
        config.approval = Some(ApprovalConfig {
            mode: get_str(m, "mode"),
            safe_commands: m.get(serde_yaml::Value::String("safe_commands".to_string()))
                .and_then(|v| v.as_sequence())
                .map(|seq| seq.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()),
            dangerous_commands: m.get(serde_yaml::Value::String("dangerous_commands".to_string()))
                .and_then(|v| v.as_sequence())
                .map(|seq| seq.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()),
            remember_session: get_bool(m, "remember_session"),
            show_command_preview: get_bool(m, "show_command_preview"),
            timeout_seconds: get_i64(m, "timeout_seconds").map(|v| v as i32),
        });
    }

    // Extract display section
    if let Some(m) = get_section(root, "display") {
        config.display = Some(DisplayConfig {
            compact: get_bool(m, "compact"),
            skin: get_str(m, "skin"),
            streaming: get_bool(m, "streaming"),
            show_reasoning: get_bool(m, "show_reasoning"),
            tool_preview: get_bool(m, "tool_preview"),
            personality: get_str(m, "personality"),
            resume_display: get_str(m, "resume_display"),
            busy_input_mode: get_str(m, "busy_input_mode"),
            bell_on_complete: get_bool(m, "bell_on_complete"),
            final_response_markdown: get_str(m, "final_response_markdown"),
            inline_diffs: get_bool(m, "inline_diffs"),
            show_cost: get_bool(m, "show_cost"),
            tool_progress: get_str(m, "tool_progress"),
        });
    }

    // Extract providers section
    if let Some(m) = get_section(root, "providers") {
        let custom_providers = m.get(serde_yaml::Value::String("custom_providers".to_string()))
            .and_then(|v| v.as_sequence())
            .map(|seq| {
                seq.iter().filter_map(|v| {
                    let entry = v.as_mapping()?;
                    Some(CustomProvider {
                        name: get_str(entry, "name"),
                        base_url: get_str(entry, "base_url"),
                        api_key: get_str(entry, "api_key"),
                        model: get_str(entry, "model"),
                        api_mode: get_str(entry, "api_mode"),
                        key_env: get_str(entry, "key_env"),
                    })
                }).collect()
            });

        let fallback_providers = m.get(serde_yaml::Value::String("fallback_providers".to_string()))
            .and_then(|v| v.as_sequence())
            .map(|seq| {
                seq.iter().filter_map(|v| {
                    let entry = v.as_mapping()?;
                    Some(FallbackProvider {
                        name: get_str(entry, "name"),
                        model: get_str(entry, "model"),
                        priority: get_i64(entry, "priority").map(|v| v as i32),
                    })
                }).collect()
            });

        let credential_pool_strategies = m.get(serde_yaml::Value::String("credential_pool_strategies".to_string()))
            .and_then(|v| serde_json::to_value(v).ok());

        config.providers = Some(ProvidersConfig {
            custom_providers,
            fallback_providers,
            credential_pool_strategies,
        });
    }

    // Extract auxiliary section (dynamic map)
    if let Some(aux) = root.get(serde_yaml::Value::String("auxiliary".to_string())) {
        config.auxiliary = Some(serde_json::to_value(aux).unwrap_or(serde_json::Value::Object(Default::default())));
    }

    config
}

// ============================================================================
// YAML Merge — writes config by reading-modifying-writing config.yaml
// ============================================================================

/// Merge a section into the existing config.yaml using Python + PyYAML.
/// This replaces the old `hermes_config_set` approach which relied on a CLI
/// command that may not exist. Uses base64-encoded payload via stdin.
fn yaml_merge_section(section: &str, data: &serde_json::Value) -> Result<(), String> {
    // Validate section name
    if section.chars().any(|c| !c.is_alphanumeric() && c != '_' && c != '-') {
        return Err(format!("Invalid section name: {}", section));
    }

    // Strip masked API keys before writing — they are display-only markers
    let mut clean_data = data.clone();
    if section == "model" {
        if let Some(obj) = clean_data.as_object_mut() {
            if let Some(api_key) = obj.get("api_key").and_then(|v| v.as_str()) {
                if is_masked_api_key(api_key) {
                    obj.remove("api_key");
                }
            }
            // Also strip custom_providers api_keys if masked
        }
    }
    if section == "providers" {
        if let Some(obj) = clean_data.as_object_mut() {
            if let Some(custom_providers) = obj.get_mut("custom_providers").and_then(|v| v.as_array_mut()) {
                for provider in custom_providers.iter_mut() {
                    if let Some(p) = provider.as_object_mut() {
                        if let Some(api_key) = p.get("api_key").and_then(|v| v.as_str()) {
                            if is_masked_api_key(api_key) {
                                p.remove("api_key");
                            }
                        }
                    }
                }
            }
        }
    }

    let payload = serde_json::json!({
        "section": section,
        "data": clean_data,
    });
    let payload_b64 = STANDARD.encode(
        serde_json::to_string(&payload).map_err(|e| format!("Failed to encode payload: {}", e))?
    );

    let script = r#"
import sys, json, base64, os

payload = json.loads(base64.b64decode(sys.stdin.read().strip()).decode('utf-8'))
section = payload['section']
data = payload['data']
config_path = os.path.expanduser('~/.hermes/config.yaml')

# Read existing config
if os.path.exists(config_path):
    with open(config_path, 'r', encoding='utf-8') as f:
        content = f.read()
else:
    content = ''
    os.makedirs(os.path.dirname(config_path), exist_ok=True)

# Parse existing YAML
try:
    import yaml
    config = yaml.safe_load(content) or {}
except Exception:
    config = {}

# Ensure top-level is a dict
if not isinstance(config, dict):
    config = {}

# Handle section key mapping (frontend 'checkpoint' -> YAML 'checkpoints')
yaml_section = section
if section == 'checkpoint':
    yaml_section = 'checkpoints'

# Merge: for dict sections, deep-update; otherwise replace
if yaml_section in config and isinstance(config[yaml_section], dict) and isinstance(data, dict):
    # Remove None values from data (they mean "don't update this field")
    cleaned = {k: v for k, v in data.items() if v is not None}
    config[yaml_section].update(cleaned)
elif data is not None:
    config[yaml_section] = data

# Write back
with open(config_path, 'w', encoding='utf-8') as f:
    yaml.dump(config, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

print('success')
"#;

    let cmd = format!("echo '{}' | python3 -c '{}'", payload_b64, script.replace('\'', "'\\''"));

    let output = create_command("wsl")
        .args(["-e", "bash", "-c", &cmd])
        .output()
        .map_err(|e| format!("Failed to merge config section: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to merge config section '{}': {}", section, stderr));
    }

    println!("[Config] Section '{}' merged successfully", section);
    Ok(())
}

// ============================================================================
// Tauri Commands
// ============================================================================

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
            // SECURITY: Do NOT log raw YAML as it may contain API keys
            println!("[Config] Loaded config from WSL ({} bytes)", raw.len());
            let mut config = parse_config(&raw);
            // Mask API keys before sending to frontend
            mask_config_api_keys(&mut config);
            println!(
                "[Config] Parsed config - model: {:?}, provider: {:?}",
                config.model.as_ref().and_then(|m| m.default.as_ref()),
                config.model.as_ref().and_then(|m| m.provider.as_ref())
            );
            return Ok(config);
        }
    }

    // Fallback to Windows path
    if let Some(raw) = read_file_content("config.yaml") {
        // SECURITY: Do NOT log raw YAML as it may contain API keys
        println!("[Config] Loaded config from Windows ({} bytes)", raw.len());
        let mut config = parse_config(&raw);
        mask_config_api_keys(&mut config);
        println!(
            "[Config] Loaded from Windows - model: {:?}, provider: {:?}",
            config.model.as_ref().and_then(|m| m.default.as_ref()),
            config.model.as_ref().and_then(|m| m.provider.as_ref())
        );
        return Ok(config);
    }

    println!("[Config] No configuration found, returning defaults");
    Ok(HermesConfig::default())
}

/// Mask all API keys in the config before sending to frontend
fn mask_config_api_keys(config: &mut HermesConfig) {
    // Mask model.api_key
    if let Some(ref mut model) = config.model {
        if let Some(ref api_key) = model.api_key.clone() {
            model.api_key = Some(mask_api_key(api_key));
        }
    }
    // Mask custom_providers[].api_key
    if let Some(ref mut providers) = config.providers {
        if let Some(ref mut custom) = providers.custom_providers {
            for provider in custom.iter_mut() {
                if let Some(ref api_key) = provider.api_key.clone() {
                    provider.api_key = Some(mask_api_key(api_key));
                }
            }
        }
    }
}

/// Save Hermes configuration
#[tauri::command]
pub fn save_config(config: HermesConfig) -> Result<(), String> {
    println!("[Config] Saving configuration...");
    // SECURITY: Do NOT log config details as they may contain API keys

    // If raw content is provided, write directly using base64 encoding
    if let Some(raw) = &config.raw {
        let encoded = STANDARD.encode(raw);
        let script = format!(
            r#"
import os, base64
filepath = os.path.expanduser("~/.hermes/config.yaml")
os.makedirs(os.path.dirname(filepath), exist_ok=True)
content = base64.b64decode("{}").decode('utf-8')
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("success")
"#,
            encoded
        );

        let output = create_command("wsl")
            .args(["python3", "-c", &script])
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                println!("[Config] Raw configuration saved to WSL");
                return Ok(());
            }
        }
    }

    // Structured save: merge each section via YAML
    if let Some(model) = &config.model {
        let data = serde_json::to_value(model)
            .map_err(|e| format!("Failed to serialize model config: {}", e))?;
        yaml_merge_section("model", &data)?;
    }

    if let Some(agent) = &config.agent {
        let data = serde_json::to_value(agent)
            .map_err(|e| format!("Failed to serialize agent config: {}", e))?;
        yaml_merge_section("agent", &data)?;
    }

    if let Some(terminal) = &config.terminal {
        let data = serde_json::to_value(terminal)
            .map_err(|e| format!("Failed to serialize terminal config: {}", e))?;
        yaml_merge_section("terminal", &data)?;
    }

    if let Some(compression) = &config.compression {
        let data = serde_json::to_value(compression)
            .map_err(|e| format!("Failed to serialize compression config: {}", e))?;
        yaml_merge_section("compression", &data)?;
    }

    if let Some(checkpoint) = &config.checkpoint {
        let data = serde_json::to_value(checkpoint)
            .map_err(|e| format!("Failed to serialize checkpoint config: {}", e))?;
        yaml_merge_section("checkpoint", &data)?;
    }

    if let Some(memory) = &config.memory {
        let data = serde_json::to_value(memory)
            .map_err(|e| format!("Failed to serialize memory config: {}", e))?;
        yaml_merge_section("memory", &data)?;
    }

    if let Some(approval) = &config.approval {
        let data = serde_json::to_value(approval)
            .map_err(|e| format!("Failed to serialize approval config: {}", e))?;
        yaml_merge_section("approval", &data)?;
    }

    if let Some(providers) = &config.providers {
        let data = serde_json::to_value(providers)
            .map_err(|e| format!("Failed to serialize providers config: {}", e))?;
        yaml_merge_section("providers", &data)?;
    }

    if let Some(auxiliary) = &config.auxiliary {
        yaml_merge_section("auxiliary", auxiliary)?;
    }

    println!("[Config] Configuration saved successfully via YAML merge");
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
    })
    .await
    .unwrap_or(false);

    println!("[Config] check_data_dir_exists returning: {}", result);
    result
}

/// Get raw config.yaml content
#[tauri::command]
pub fn get_config_raw() -> Result<serde_json::Value, String> {
    println!("[Config] Getting raw config...");

    if let Ok(output) = create_command("wsl")
        .args(["cat", "~/.hermes/config.yaml"])
        .output()
    {
        if output.status.success() {
            let yaml = String::from_utf8_lossy(&output.stdout).to_string();
            return Ok(serde_json::json!({ "yaml": yaml }));
        }
    }

    if let Some(yaml) = read_file_content("config.yaml") {
        return Ok(serde_json::json!({ "yaml": yaml }));
    }

    Ok(serde_json::json!({ "yaml": "" }))
}

/// Update raw config.yaml content using base64 encoding
#[tauri::command]
pub fn update_config_raw(yaml_text: String) -> Result<(), String> {
    println!("[Config] Updating raw config...");

    let encoded = STANDARD.encode(&yaml_text);

    let script = format!(
        r#"
import os, base64
filepath = os.path.expanduser("~/.hermes/config.yaml")
os.makedirs(os.path.dirname(filepath), exist_ok=True)
content = base64.b64decode("{}").decode('utf-8')
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("success")
"#,
        encoded
    );

    let output = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to update config: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to update config: {}", stderr));
    }

    println!("[Config] Raw config updated successfully");
    Ok(())
}

/// Get a specific config section
#[tauri::command]
pub fn get_config_section(section: String) -> Result<serde_json::Value, String> {
    println!("[Config] Getting config section: {}", section);

    let config = load_config()?;
    let config_value = serde_json::to_value(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    // Map 'checkpoint' struct field to 'checkpoint' key in JSON
    let json_key = section.as_str();

    let data = config_value.get(json_key).cloned().unwrap_or(serde_json::Value::Null);

    Ok(serde_json::json!({
        "section": section,
        "data": data
    }))
}

/// Update a specific config section using YAML merge
#[tauri::command]
pub fn update_config_section(section: String, data: serde_json::Value) -> Result<serde_json::Value, String> {
    println!("[Config] Updating config section: {}", section);

    // Use YAML merge instead of broken hermes_config_set CLI
    yaml_merge_section(&section, &data)?;

    Ok(serde_json::json!({
        "ok": true,
        "section": section,
        "data": data
    }))
}

/// Export configuration (all sections)
#[tauri::command]
pub fn export_config() -> Result<serde_json::Value, String> {
    println!("[Config] Exporting configuration...");

    let config = load_config()?;
    let now = chrono::Utc::now().to_rfc3339();

    let mut export = serde_json::Map::new();
    if let Some(model) = config.model {
        export.insert("model".to_string(), serde_json::to_value(model).unwrap_or_default());
    }
    if let Some(agent) = config.agent {
        export.insert("agent".to_string(), serde_json::to_value(agent).unwrap_or_default());
    }
    if let Some(terminal) = config.terminal {
        export.insert("terminal".to_string(), serde_json::to_value(terminal).unwrap_or_default());
    }
    if let Some(compression) = config.compression {
        export.insert("compression".to_string(), serde_json::to_value(compression).unwrap_or_default());
    }
    if let Some(checkpoint) = config.checkpoint {
        export.insert("checkpoint".to_string(), serde_json::to_value(checkpoint).unwrap_or_default());
    }
    if let Some(memory) = config.memory {
        export.insert("memory".to_string(), serde_json::to_value(memory).unwrap_or_default());
    }
    if let Some(approval) = config.approval {
        export.insert("approval".to_string(), serde_json::to_value(approval).unwrap_or_default());
    }
    if let Some(providers) = config.providers {
        export.insert("providers".to_string(), serde_json::to_value(providers).unwrap_or_default());
    }
    if let Some(auxiliary) = config.auxiliary {
        export.insert("auxiliary".to_string(), auxiliary);
    }
    if let Some(display) = config.display {
        export.insert("display".to_string(), serde_json::to_value(display).unwrap_or_default());
    }
    export.insert("exported_at".to_string(), serde_json::Value::String(now));
    export.insert("version".to_string(), serde_json::Value::String("1.0.0".to_string()));

    Ok(serde_json::Value::Object(export))
}
