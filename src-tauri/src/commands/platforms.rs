//! Platform Commands
//!
//! Commands for managing Hermes Agent platform connections.
//! Reads from gateway_state.json in WSL.

use serde::{Deserialize, Serialize};
use super::utils::create_command;

/// Platform status - matches frontend Platform type exactly
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Platform {
    #[serde(rename = "type")]
    pub platform_type: String,
    pub name: String,
    pub description: String,
    pub status: String,
    pub icon: String,
    pub enabled: bool,
    pub config: Option<serde_json::Value>,
    pub last_connected: Option<String>,
    pub error: Option<String>,
}

/// Platform status response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformStatus {
    #[serde(rename = "type")]
    pub platform_type: String,
    pub status: String,
    pub last_connected: Option<String>,
    pub error: Option<String>,
}

/// Platform definitions
fn get_platform_definitions() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        ("telegram", "Telegram", "📱"),
        ("discord", "Discord", "🎮"),
        ("slack", "Slack", "💼"),
        ("whatsapp", "WhatsApp", "💬"),
        ("wechat", "企业微信", "🏢"),
        ("feishu", "飞书", "🪽"),
        ("weixin", "微信", "📱"),
        ("qqbot", "QQ Bot", "🤖"),
        ("api_server", "API Server", "🔌"),
        ("webhook", "Webhook", "🔗"),
    ]
}

/// Get all platforms with their status
#[tauri::command]
pub fn get_platforms() -> Result<Vec<Platform>, String> {
    println!("[Platforms] Getting platforms...");

    // Read gateway state
    let script = "cat ~/.hermes/gateway_state.json 2>/dev/null || echo '{}'";

    let gateway_state: serde_json::Value = if let Ok(output) = create_command("wsl")
        .args(["bash", "-c", script])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            serde_json::from_str(&stdout).unwrap_or(serde_json::json!({}))
        } else {
            serde_json::json!({})
        }
    } else {
        serde_json::json!({})
    };

    let platforms_state = gateway_state.get("platforms")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let mut platforms = Vec::new();

    for (platform_type, name, icon) in get_platform_definitions() {
        let state_info = platforms_state.get(platform_type).cloned();

        let status = state_info.as_ref()
            .and_then(|s| s.get("state").and_then(|v| v.as_str()))
            .unwrap_or("disconnected");

        let error = state_info.as_ref()
            .and_then(|s| s.get("error_message").and_then(|v| v.as_str()))
            .map(|s| s.to_string());

        let last_connected = state_info.as_ref()
            .and_then(|s| s.get("updated_at").and_then(|v| v.as_str()))
            .map(|s| s.to_string());

        let enabled = status != "disconnected" || state_info.is_some();

        platforms.push(Platform {
            platform_type: platform_type.to_string(),
            name: name.to_string(),
            description: format!("{} 平台接入", name),
            status: status.to_string(),
            icon: icon.to_string(),
            enabled,
            config: None,
            last_connected,
            error,
        });
    }

    println!("[Platforms] Found {} platforms", platforms.len());
    Ok(platforms)
}

/// Get platform status
#[tauri::command]
pub fn get_platform_status(platform_type: String) -> Result<PlatformStatus, String> {
    let script = format!(
        r#"cat ~/.hermes/gateway_state.json 2>/dev/null | python3 -c 'import sys, json; d=json.load(sys.stdin).get("platforms", {{}}).get("{}", {{}}); print(json.dumps(d))'"#,
        platform_type
    );

    if let Ok(output) = create_command("wsl")
        .args(["bash", "-c", &script])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(state) = serde_json::from_str::<serde_json::Value>(&stdout) {
                return Ok(PlatformStatus {
                    platform_type: platform_type.clone(),
                    status: state.get("state").and_then(|v| v.as_str()).unwrap_or("unknown").to_string(),
                    last_connected: state.get("updated_at").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    error: state.get("error_message").and_then(|v| v.as_str()).map(|s| s.to_string()),
                });
            }
        }
    }

    Ok(PlatformStatus {
        platform_type,
        status: "unknown".to_string(),
        last_connected: None,
        error: None,
    })
}

/// Enable platform
#[tauri::command]
pub fn enable_platform(_platform_type: String) -> Result<(), String> {
    // TODO: Implement via Hermes API
    Ok(())
}

/// Disable platform
#[tauri::command]
pub fn disable_platform(_platform_type: String) -> Result<(), String> {
    // TODO: Implement via Hermes API
    Ok(())
}

/// Required config fields for each platform
fn get_required_fields(platform_type: &str) -> Vec<&'static str> {
    match platform_type {
        "telegram" => vec!["bot_token"],
        "discord" => vec!["bot_token"],
        "slack" => vec!["bot_token"],
        "whatsapp" => vec!["phone_number_id", "access_token"],
        "wechat" => vec!["corp_id", "agent_id", "secret"],
        "feishu" | "lark" => vec!["app_id", "app_secret"],
        "api_server" | "api" => vec!["port"],
        "webhook" => vec!["url"],
        _ => vec![],
    }
}

/// Test platform connection - validates required config fields
#[tauri::command]
pub fn test_platform_connection(platform_type: String) -> Result<serde_json::Value, String> {
    println!("[Platforms] Testing connection for: {}", platform_type);

    // Read gateway state to get platform config
    let script = "cat ~/.hermes/gateway_state.json 2>/dev/null || echo '{}'";

    let gateway_state: serde_json::Value = if let Ok(output) = create_command("wsl")
        .args(["bash", "-c", script])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            serde_json::from_str(&stdout).unwrap_or(serde_json::json!({}))
        } else {
            serde_json::json!({})
        }
    } else {
        serde_json::json!({})
    };

    // Get platform config
    let platform_config = gateway_state
        .get("platforms")
        .and_then(|p| p.get(&platform_type))
        .and_then(|p| p.get("config"))
        .cloned()
        .unwrap_or(serde_json::json!({}));

    // Check required fields
    let required_fields = get_required_fields(&platform_type);

    if required_fields.is_empty() {
        // No required fields for this platform type
        return Ok(serde_json::json!({
            "ok": true,
            "message": "Platform ready (no configuration required)"
        }));
    }

    let mut missing_fields = Vec::new();
    for field in &required_fields {
        let value = platform_config.get(*field)
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if value.is_empty() {
            missing_fields.push(*field);
        }
    }

    if missing_fields.is_empty() {
        Ok(serde_json::json!({
            "ok": true,
            "message": "Configuration valid"
        }))
    } else {
        Ok(serde_json::json!({
            "ok": false,
            "message": format!("Missing required fields: {}", missing_fields.join(", "))
        }))
    }
}

/// Reconnect platform
#[tauri::command]
pub fn reconnect_platform(_platform_type: String) -> Result<(), String> {
    Ok(())
}

/// Update platform config
#[tauri::command]
pub fn update_platform_config(platform_type: String, config: serde_json::Value) -> Result<(), String> {
    println!("[Platforms] Updating config for: {}", platform_type);

    // Read current gateway state
    let read_script = "cat ~/.hermes/gateway_state.json 2>/dev/null || echo '{}'";

    let mut gateway_state: serde_json::Value = if let Ok(output) = create_command("wsl")
        .args(["bash", "-c", read_script])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            serde_json::from_str(&stdout).unwrap_or(serde_json::json!({}))
        } else {
            serde_json::json!({})
        }
    } else {
        serde_json::json!({})
    };

    // Update platform config
    if let Some(platforms) = gateway_state.get_mut("platforms") {
        if let Some(platforms_obj) = platforms.as_object_mut() {
            if let Some(platform) = platforms_obj.get_mut(&platform_type) {
                if let Some(platform_obj) = platform.as_object_mut() {
                    platform_obj.insert("config".to_string(), config.clone());
                }
            } else {
                platforms_obj.insert(platform_type.clone(), serde_json::json!({
                    "config": config.clone(),
                    "state": "disconnected"
                }));
            }
        }
    } else {
        let platform_type_key = platform_type.clone();
        gateway_state["platforms"] = serde_json::json!({
            platform_type_key: {
                "config": config.clone(),
                "state": "disconnected"
            }
        });
    }

    // Write back to file
    let state_str = serde_json::to_string_pretty(&gateway_state).unwrap_or_else(|_| "{}".to_string());
    let write_script = format!(
        "cat > ~/.hermes/gateway_state.json << 'EOF'\n{}\nEOF",
        state_str
    );

    if let Ok(output) = create_command("wsl")
        .args(["bash", "-c", &write_script])
        .output()
    {
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to save config: {}", stderr));
        }
    } else {
        return Err("Failed to execute write command".to_string());
    }

    println!("[Platforms] Config saved for: {}", platform_type);
    Ok(())
}
