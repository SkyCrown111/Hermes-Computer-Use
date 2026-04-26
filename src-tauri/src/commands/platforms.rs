//! Platform Commands
//!
//! Commands for managing Hermes Agent platform connections.
//! Reads from gateway_state.json in WSL.

use serde::{Deserialize, Serialize};
use super::utils::create_command;
use lazy_static::lazy_static;
use std::sync::Mutex;

lazy_static! {
    /// Store WeChat QR code value for polling iLink API
    static ref WECHAT_QR_VALUE: Mutex<Option<String>> = Mutex::new(None);
}

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

/// Read gateway state from WSL
fn read_gateway_state() -> Result<serde_json::Value, String> {
    let script = "cat ~/.hermes/gateway_state.json 2>/dev/null || echo '{}'";

    let output = create_command("wsl")
        .args(["bash", "-c", script])
        .output()
        .map_err(|e| format!("Failed to read gateway state: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(serde_json::from_str(&stdout).unwrap_or(serde_json::json!({})))
    } else {
        Ok(serde_json::json!({}))
    }
}

/// Write gateway state to WSL
fn write_gateway_state(state: &serde_json::Value) -> Result<(), String> {
    let state_str = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Failed to serialize state: {}", e))?;
    let script = format!(
        "cat > ~/.hermes/gateway_state.json << 'EOF'\n{}\nEOF",
        state_str
    );

    let output = create_command("wsl")
        .args(["bash", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to write gateway state: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to save state: {}", stderr));
    }
    Ok(())
}

/// Enable platform
#[tauri::command]
pub fn enable_platform(platform_type: String) -> Result<(), String> {
    println!("[Platforms] Enabling platform: {}", platform_type);

    let mut gateway_state = read_gateway_state()?;

    let platform_entry = serde_json::json!({
        "config": {},
        "state": "connected",
        "updated_at": chrono::Utc::now().to_rfc3339()
    });

    if let Some(platforms) = gateway_state.get_mut("platforms") {
        if let Some(platforms_obj) = platforms.as_object_mut() {
            platforms_obj.insert(platform_type.clone(), platform_entry);
        }
    } else {
        gateway_state["platforms"] = serde_json::json!({
            platform_type.clone(): platform_entry
        });
    }

    write_gateway_state(&gateway_state)?;
    println!("[Platforms] Enabled platform: {}", platform_type);
    Ok(())
}

/// Disable platform
#[tauri::command]
pub fn disable_platform(platform_type: String) -> Result<(), String> {
    println!("[Platforms] Disabling platform: {}", platform_type);

    let mut gateway_state = read_gateway_state()?;

    if let Some(platforms) = gateway_state.get_mut("platforms") {
        if let Some(platforms_obj) = platforms.as_object_mut() {
            if let Some(platform) = platforms_obj.get_mut(&platform_type) {
                if let Some(platform_obj) = platform.as_object_mut() {
                    platform_obj.insert("state".to_string(), serde_json::Value::String("disconnected".to_string()));
                    platform_obj.insert("updated_at".to_string(), serde_json::Value::String(chrono::Utc::now().to_rfc3339()));
                }
            } else {
                return Err(format!("Platform not found: {}", platform_type));
            }
        }
    }

    write_gateway_state(&gateway_state)?;
    println!("[Platforms] Disabled platform: {}", platform_type);
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

    let gateway_state = read_gateway_state()?;

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
pub fn reconnect_platform(platform_type: String) -> Result<(), String> {
    println!("[Platforms] Reconnecting platform: {}", platform_type);

    let mut gateway_state = read_gateway_state()?;

    if let Some(platforms) = gateway_state.get_mut("platforms") {
        if let Some(platforms_obj) = platforms.as_object_mut() {
            if let Some(platform) = platforms_obj.get_mut(&platform_type) {
                if let Some(platform_obj) = platform.as_object_mut() {
                    platform_obj.insert("state".to_string(), serde_json::Value::String("connected".to_string()));
                    platform_obj.insert("updated_at".to_string(), serde_json::Value::String(chrono::Utc::now().to_rfc3339()));
                }
            } else {
                return Err(format!("Platform not found: {}", platform_type));
            }
        }
    }

    write_gateway_state(&gateway_state)?;
    println!("[Platforms] Reconnected platform: {}", platform_type);
    Ok(())
}

/// Request WeChat bot binding QR code via Tencent iLink Bot API
#[tauri::command]
pub fn get_wechat_qrcode() -> Result<serde_json::Value, String> {
    println!("[Platforms] Requesting WeChat bot QR code from iLink API...");

    let url = "https://ilinkai.weixin.qq.com/ilink/bot/get_bot_qrcode?bot_type=3";

    let client = reqwest::blocking::Client::new();
    let response = client
        .get(url)
        .header("iLink-App-Id", "bot")
        .header("iLink-App-ClientVersion", "131584")
        .send()
        .map_err(|e| format!("Failed to call iLink API: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("iLink API returned HTTP {}", status));
    }

    let body: serde_json::Value = response
        .json()
        .map_err(|e| format!("Failed to parse iLink response: {}", e))?;

    let qrcode = body
        .get("qrcode")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing 'qrcode' in iLink response".to_string())?;

    let qrcode_url = body
        .get("qrcode_img_content")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Store qrcode hex token for polling
    if let Ok(mut guard) = WECHAT_QR_VALUE.lock() {
        *guard = Some(qrcode.to_string());
    }

    let expires_at = (chrono::Utc::now() + chrono::Duration::minutes(2)).to_rfc3339();

    println!(
        "[Platforms] Got QR code from iLink API, hex_length: {}",
        qrcode.len()
    );

    Ok(serde_json::json!({
        "qrcode_url": qrcode_url,
        "status": "pending",
        "expires_at": expires_at,
    }))
}

/// Check WeChat bot QR code status via Tencent iLink Bot API
#[tauri::command]
pub fn check_wechat_qrcode_status() -> Result<serde_json::Value, String> {
    let qrcode = {
        let guard = WECHAT_QR_VALUE
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        guard
            .clone()
            .ok_or_else(|| "No QR code in progress".to_string())?
    };

    let url = format!(
        "https://ilinkai.weixin.qq.com/ilink/bot/get_qrcode_status?qrcode={}",
        qrcode
    );

    let client = reqwest::blocking::Client::new();
    let response = client
        .get(&url)
        .header("iLink-App-Id", "bot")
        .header("iLink-App-ClientVersion", "131584")
        .send()
        .map_err(|e| format!("Failed to call iLink API: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("iLink API returned HTTP {}", status));
    }

    let body: serde_json::Value = response
        .json()
        .map_err(|e| format!("Failed to parse iLink status response: {}", e))?;

    let raw_status = body
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("wait");

    // Map iLink statuses to unified frontend status
    let status = match raw_status {
        "scaned" | "scaned_but_redirect" => "scanned",
        "confirmed" => "confirmed",
        "expired" => "expired",
        _ => "pending",
    };

    println!("[Platforms] QR code status: raw={}, mapped={}", raw_status, status);

    Ok(serde_json::json!({ "status": status }))
}

/// Update platform config
#[tauri::command]
pub fn update_platform_config(platform_type: String, config: serde_json::Value) -> Result<(), String> {
    println!("[Platforms] Updating config for: {}", platform_type);

    let mut gateway_state = read_gateway_state()?;

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

    write_gateway_state(&gateway_state)
}
