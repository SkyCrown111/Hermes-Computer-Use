//! Platform Commands
//!
//! Commands for managing Hermes Agent platform connections.
//! Reads from gateway_state.json in WSL.

use super::utils::create_command;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::sync::{LazyLock, Mutex};

/// Store WeChat QR code value for polling iLink API
static WECHAT_QR_VALUE: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

/// Whitelist of valid platform types
const VALID_PLATFORM_TYPES: &[&str] = &[
    "telegram",
    "discord",
    "slack",
    "whatsapp",
    "wechat",
    "feishu",
    "lark",
    "weixin",
    "qqbot",
    "api_server",
    "api",
    "webhook",
];

/// Validate platform type against whitelist
fn validate_platform_type(platform_type: &str) -> Result<String, String> {
    if platform_type.is_empty() {
        return Err("Platform type cannot be empty".to_string());
    }
    // Check against whitelist
    if !VALID_PLATFORM_TYPES.contains(&platform_type) {
        return Err(format!(
            "Invalid platform type: {}. Valid types are: {}",
            platform_type,
            VALID_PLATFORM_TYPES.join(", ")
        ));
    }
    Ok(platform_type.to_string())
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
        ("lark", "Lark", "🪽"),
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

    // Read gateway state using Python
    let script = r#"
import os
import json

filepath = os.path.expanduser("~/.hermes/gateway_state.json")
try:
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(json.dumps(data))
except:
    print("{}")
"#;

    let gateway_state: serde_json::Value = if let Ok(output) = create_command("wsl")
        .args(["python3", "-c", script])
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

    let platforms_state = gateway_state
        .get("platforms")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let mut platforms = Vec::new();

    for (platform_type, name, icon) in get_platform_definitions() {
        let state_info = platforms_state.get(platform_type).cloned();

        let status = state_info
            .as_ref()
            .and_then(|s| s.get("state").and_then(|v| v.as_str()))
            .unwrap_or("disconnected");

        let error = state_info
            .as_ref()
            .and_then(|s| s.get("error_message").and_then(|v| v.as_str()))
            .map(|s| s.to_string());

        let last_connected = state_info
            .as_ref()
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
    // Validate platform type
    let valid_type = validate_platform_type(&platform_type)?;

    let script = format!(
        r#"
import os
import json

filepath = os.path.expanduser("~/.hermes/gateway_state.json")
try:
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    platforms = data.get("platforms", {{}})
    result = platforms.get("{}", {{}})
    print(json.dumps(result))
except:
    print(json.dumps({{}}))
"#,
        valid_type
    );

    if let Ok(output) = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(state) = serde_json::from_str::<serde_json::Value>(&stdout) {
                return Ok(PlatformStatus {
                    platform_type: platform_type.clone(),
                    status: state
                        .get("state")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    last_connected: state
                        .get("updated_at")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    error: state
                        .get("error_message")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
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

/// Read gateway state from WSL using Python
fn read_gateway_state() -> Result<serde_json::Value, String> {
    let script = r#"
import os
import json

filepath = os.path.expanduser("~/.hermes/gateway_state.json")
try:
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(json.dumps(data))
except:
    print("{}")
"#;

    let output = create_command("wsl")
        .args(["python3", "-c", script])
        .output()
        .map_err(|e| format!("Failed to read gateway state: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(serde_json::from_str(&stdout).unwrap_or(serde_json::json!({})))
    } else {
        Ok(serde_json::json!({}))
    }
}

/// Write gateway state to WSL using base64 encoding for safe shell transport
fn write_gateway_state(state: &serde_json::Value) -> Result<(), String> {
    let state_str = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Failed to serialize state: {}", e))?;
    let encoded = STANDARD.encode(&state_str);

    let script = format!(
        r#"
import os
import base64
import json

filepath = os.path.expanduser("~/.hermes/gateway_state.json")
os.makedirs(os.path.dirname(filepath), exist_ok=True)

content = base64.b64decode("{}").decode('utf-8')
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
"#,
        encoded
    );

    let output = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to write gateway state: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to save state: {}", stderr));
    }
    Ok(())
}

/// Enable platform - updates gateway state and attempts to connect via Hermes gateway
#[tauri::command]
pub fn enable_platform(platform_type: String) -> Result<(), String> {
    println!("[Platforms] Enabling platform: {}", platform_type);

    // Validate platform type
    let valid_type = validate_platform_type(&platform_type)?;

    let mut gateway_state = read_gateway_state()?;

    let now = chrono::Utc::now().to_rfc3339();

    let mut platform_entry = serde_json::json!({
        "config": {},
        "state": "connecting",
        "updated_at": now
    });

    if let Some(platforms) = gateway_state.get_mut("platforms") {
        if let Some(platforms_obj) = platforms.as_object_mut() {
            // Preserve existing config if re-enabling
            if let Some(existing) = platforms_obj.get(&valid_type) {
                if let Some(existing_config) = existing.get("config") {
                    if let Some(entry_obj) = platform_entry.as_object_mut() {
                        entry_obj.insert("config".to_string(), existing_config.clone());
                    }
                }
            }
            platforms_obj.insert(valid_type.clone(), platform_entry);
        }
    } else {
        gateway_state["platforms"] = serde_json::json!({
            valid_type.clone(): platform_entry
        });
    }

    write_gateway_state(&gateway_state)?;

    // Try to trigger the gateway to connect the platform via hermes CLI
    let connect_result = create_command("wsl")
        .args([
            "python3", "-c",
            &format!("import os; venv = os.path.expanduser('~/.hermes/hermes-agent/venv/bin/python'); import subprocess; subprocess.run([venv, '-m', 'hermes_cli.main', 'platform', 'connect', '{}'])", valid_type),
        ])
        .output();

    match connect_result {
        Ok(output) if output.status.success() => {
            println!("[Platforms] Gateway connected platform: {}", valid_type);
            // Update state to connected
            let mut gateway_state = read_gateway_state()?;
            if let Some(platforms) = gateway_state.get_mut("platforms") {
                if let Some(platforms_obj) = platforms.as_object_mut() {
                    if let Some(platform) = platforms_obj.get_mut(&valid_type) {
                        if let Some(platform_obj) = platform.as_object_mut() {
                            platform_obj.insert("state".to_string(), serde_json::Value::String("connected".to_string()));
                            platform_obj.insert("updated_at".to_string(), serde_json::Value::String(chrono::Utc::now().to_rfc3339()));
                        }
                    }
                }
            }
            write_gateway_state(&gateway_state)?;
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            println!("[Platforms] Gateway connect failed (platform state saved as 'connecting'): {}", stderr);
            // Leave state as "connecting" — the gateway may connect later
        }
        Err(e) => {
            println!("[Platforms] Gateway CLI not available (platform state saved as 'connecting'): {}", e);
        }
    }

    println!("[Platforms] Enabled platform: {}", valid_type);
    Ok(())
}

/// Disable platform
#[tauri::command]
pub fn disable_platform(platform_type: String) -> Result<(), String> {
    println!("[Platforms] Disabling platform: {}", platform_type);

    // Validate platform type
    let valid_type = validate_platform_type(&platform_type)?;

    let mut gateway_state = read_gateway_state()?;

    if let Some(platforms) = gateway_state.get_mut("platforms") {
        if let Some(platforms_obj) = platforms.as_object_mut() {
            if let Some(platform) = platforms_obj.get_mut(&valid_type) {
                if let Some(platform_obj) = platform.as_object_mut() {
                    platform_obj.insert(
                        "state".to_string(),
                        serde_json::Value::String("disconnected".to_string()),
                    );
                    platform_obj.insert(
                        "updated_at".to_string(),
                        serde_json::Value::String(chrono::Utc::now().to_rfc3339()),
                    );
                }
            } else {
                return Err(format!("Platform not found: {}", valid_type));
            }
        }
    }

    write_gateway_state(&gateway_state)?;
    println!("[Platforms] Disabled platform: {}", valid_type);
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

    // Validate platform type
    let valid_type = validate_platform_type(&platform_type)?;

    let gateway_state = read_gateway_state()?;

    // Get platform config
    let platform_config = gateway_state
        .get("platforms")
        .and_then(|p| p.get(&valid_type))
        .and_then(|p| p.get("config"))
        .cloned()
        .unwrap_or(serde_json::json!({}));

    // Check required fields
    let required_fields = get_required_fields(&valid_type);

    if required_fields.is_empty() {
        // No required fields for this platform type
        return Ok(serde_json::json!({
            "ok": true,
            "message": "Platform ready (no configuration required)"
        }));
    }

    let mut missing_fields = Vec::new();
    for field in &required_fields {
        let value = platform_config
            .get(*field)
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

/// Reconnect platform - attempts to reconnect via Hermes gateway
#[tauri::command]
pub fn reconnect_platform(platform_type: String) -> Result<(), String> {
    println!("[Platforms] Reconnecting platform: {}", platform_type);

    // Validate platform type
    let valid_type = validate_platform_type(&platform_type)?;

    let mut gateway_state = read_gateway_state()?;

    // Check if platform exists in state
    let platform_exists = gateway_state
        .get("platforms")
        .and_then(|p| p.get(&valid_type))
        .is_some();

    if !platform_exists {
        return Err(format!("Platform not found: {}", valid_type));
    }

    // Update state to "connecting"
    if let Some(platforms) = gateway_state.get_mut("platforms") {
        if let Some(platforms_obj) = platforms.as_object_mut() {
            if let Some(platform) = platforms_obj.get_mut(&valid_type) {
                if let Some(platform_obj) = platform.as_object_mut() {
                    platform_obj.insert(
                        "state".to_string(),
                        serde_json::Value::String("connecting".to_string()),
                    );
                    platform_obj.insert(
                        "updated_at".to_string(),
                        serde_json::Value::String(chrono::Utc::now().to_rfc3339()),
                    );
                }
            }
        }
    }
    write_gateway_state(&gateway_state)?;

    // Try to trigger reconnect via hermes CLI
    let connect_result = create_command("wsl")
        .args([
            "python3", "-c",
            &format!("import os; venv = os.path.expanduser('~/.hermes/hermes-agent/venv/bin/python'); import subprocess; subprocess.run([venv, '-m', 'hermes_cli.main', 'platform', 'connect', '{}'])", valid_type),
        ])
        .output();

    // Update state based on result
    let new_state = match connect_result {
        Ok(output) if output.status.success() => "connected",
        _ => "error",
    };

    let mut gateway_state = read_gateway_state()?;
    if let Some(platforms) = gateway_state.get_mut("platforms") {
        if let Some(platforms_obj) = platforms.as_object_mut() {
            if let Some(platform) = platforms_obj.get_mut(&valid_type) {
                if let Some(platform_obj) = platform.as_object_mut() {
                    platform_obj.insert("state".to_string(), serde_json::Value::String(new_state.to_string()));
                    platform_obj.insert("updated_at".to_string(), serde_json::Value::String(chrono::Utc::now().to_rfc3339()));
                    if new_state == "error" {
                        platform_obj.insert("error_message".to_string(), serde_json::Value::String("Reconnect failed — gateway may not be running".to_string()));
                    } else {
                        platform_obj.remove("error_message");
                    }
                }
            }
        }
    }
    write_gateway_state(&gateway_state)?;

    if new_state == "error" {
        return Err(format!("Failed to reconnect platform {} — gateway may not be running", valid_type));
    }

    println!("[Platforms] Reconnected platform: {}", valid_type);
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

    println!(
        "[Platforms] QR code status: raw={}, mapped={}",
        raw_status, status
    );

    Ok(serde_json::json!({ "status": status }))
}

/// Update platform config
#[tauri::command]
pub fn update_platform_config(
    platform_type: String,
    config: serde_json::Value,
) -> Result<(), String> {
    println!("[Platforms] Updating config for: {}", platform_type);

    // Validate platform type
    let valid_type = validate_platform_type(&platform_type)?;

    let mut gateway_state = read_gateway_state()?;

    // Update platform config
    if let Some(platforms) = gateway_state.get_mut("platforms") {
        if let Some(platforms_obj) = platforms.as_object_mut() {
            if let Some(platform) = platforms_obj.get_mut(&valid_type) {
                if let Some(platform_obj) = platform.as_object_mut() {
                    platform_obj.insert("config".to_string(), config.clone());
                }
            } else {
                platforms_obj.insert(
                    valid_type.clone(),
                    serde_json::json!({
                        "config": config.clone(),
                        "state": "disconnected"
                    }),
                );
            }
        }
    } else {
        let platform_type_key = valid_type.clone();
        gateway_state["platforms"] = serde_json::json!({
            platform_type_key: {
                "config": config.clone(),
                "state": "disconnected"
            }
        });
    }

    write_gateway_state(&gateway_state)
}

/// Platform chat/conversation info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformChat {
    pub chat_id: String,
    pub chat_type: String,  // "private", "group", "channel"
    pub name: String,
    pub platform: String,
    pub unread_count: Option<u32>,
    pub last_message: Option<String>,
    pub last_message_time: Option<String>,
}

/// Platform message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformMessage {
    pub message_id: String,
    pub chat_id: String,
    pub sender_id: String,
    pub sender_name: Option<String>,
    pub content: String,
    pub timestamp: String,
    pub is_from_me: bool,
    pub reply_to: Option<String>,
}

/// Get chats list from a platform
#[tauri::command]
pub fn get_platform_chats(platform_type: String, limit: Option<usize>) -> Result<Vec<PlatformChat>, String> {
    let valid_type = validate_platform_type(&platform_type)?;
    let limit = limit.unwrap_or(50);

    let script = format!(
        r#"
import sys
import json
sys.path.insert(0, str(__import__('pathlib').Path.home() / '.hermes' / 'hermes-agent'))
import os

platform = "{}"
limit = {}

# Try to load platform-specific chat list
state_file = os.path.expanduser("~/.hermes/gateway_state.json")
chats = []

try:
    with open(state_file, 'r') as f:
        state = json.load(f)
    
    platform_state = state.get("platforms", {{}}).get(platform, {{}})
    cached_chats = platform_state.get("cached_chats", [])
    
    for chat in cached_chats[:limit]:
        chats.append({{
            "chat_id": chat.get("id", ""),
            "chat_type": chat.get("type", "private"),
            "name": chat.get("name", "Unknown"),
            "platform": platform,
            "unread_count": chat.get("unread_count"),
            "last_message": chat.get("last_message"),
            "last_message_time": chat.get("last_message_time")
        }})
except Exception as e:
    pass

print(json.dumps(chats))
"#,
        valid_type, limit
    );

    let output = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to get platform chats: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to get platform chats: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let chats: Vec<PlatformChat> = serde_json::from_str(&stdout.trim())
        .map_err(|e| format!("Failed to parse chats: {}", e))?;

    Ok(chats)
}

/// Send message through platform gateway
#[tauri::command]
pub fn send_platform_message(
    platform_type: String,
    chat_id: String,
    message: String,
) -> Result<serde_json::Value, String> {
    let valid_type = validate_platform_type(&platform_type)?;

    // Validate chat_id to prevent injection
    if chat_id.is_empty() {
        return Err("Chat ID cannot be empty".to_string());
    }

    // Use base64 encoding for safe message transport
    let message_b64 = STANDARD.encode(&message);
    let chat_id_b64 = STANDARD.encode(&chat_id);

    let script = format!(
        r#"
import os
import sys
import json
import base64

# Decode inputs from base64
chat_id = base64.b64decode("{}").decode('utf-8')
message = base64.b64decode("{}").decode('utf-8')
platform = "{}"
target = f"{{platform}}:{{chat_id}}"

# Try to use hermes CLI to send the message
venv_python = os.path.expanduser("~/.hermes/hermes-agent/venv/bin/python")
if not os.path.isfile(venv_python):
    print(json.dumps({{"success": False, "error": "Hermes agent not installed"}}))
    exit(0)

import subprocess
result = subprocess.run(
    [venv_python, '-m', 'hermes_cli.main', 'send', '--target', target, '--message', message],
    capture_output=True, text=True, timeout=30
)

if result.returncode == 0:
    print(json.dumps({{"success": True, "output": result.stdout.strip()}}))
else:
    print(json.dumps({{"success": False, "error": result.stderr.strip() or "Send failed"}}))
"#,
        chat_id_b64, message_b64, valid_type
    );

    let output = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to send message: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to send message: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: serde_json::Value = serde_json::from_str(&stdout.trim())
        .map_err(|e| format!("Failed to parse result: {}", e))?;

    Ok(result)
}

/// Get recent messages from a platform chat
#[tauri::command]
pub fn get_platform_messages(
    platform_type: String,
    chat_id: String,
    limit: Option<usize>,
    before_id: Option<String>,
) -> Result<Vec<PlatformMessage>, String> {
    let valid_type = validate_platform_type(&platform_type)?;
    let limit = limit.unwrap_or(50);

    let _before_clause = match before_id {
        Some(id) => format!(r#", "before_id": "{}""#, id),
        None => String::new(),
    };

    let script = format!(
        r#"
import sys
import json
import os
sys.path.insert(0, str(__import__('pathlib').Path.home() / '.hermes' / 'hermes-agent'))

platform = "{}"
chat_id = "{}"
limit = {}

# Load cached messages from gateway state
state_file = os.path.expanduser("~/.hermes/gateway_state.json")
messages = []

try:
    with open(state_file, 'r') as f:
        state = json.load(f)
    
    platform_state = state.get("platforms", {{}}).get(platform, {{}})
    cached_msgs = platform_state.get("cached_messages", {{}}).get(chat_id, [])
    
    for msg in cached_msgs[:limit]:
        messages.append({{
            "message_id": msg.get("id", ""),
            "chat_id": chat_id,
            "sender_id": msg.get("sender_id", ""),
            "sender_name": msg.get("sender_name"),
            "content": msg.get("content", ""),
            "timestamp": msg.get("timestamp", ""),
            "is_from_me": msg.get("is_from_me", False),
            "reply_to": msg.get("reply_to")
        }})
except Exception as e:
    pass

print(json.dumps(messages))
"#,
        valid_type, chat_id, limit
    );

    let output = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to get messages: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to get messages: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let messages: Vec<PlatformMessage> = serde_json::from_str(&stdout.trim())
        .map_err(|e| format!("Failed to parse messages: {}", e))?;

    Ok(messages)
}

/// Mark chat as read on platform
#[tauri::command]
pub fn mark_platform_chat_read(platform_type: String, chat_id: String) -> Result<(), String> {
    let valid_type = validate_platform_type(&platform_type)?;

    // Update gateway state to clear unread count
    let mut gateway_state = read_gateway_state()?;

    if let Some(platforms) = gateway_state.get_mut("platforms") {
        if let Some(platforms_obj) = platforms.as_object_mut() {
            if let Some(platform) = platforms_obj.get_mut(&valid_type) {
                if let Some(platform_obj) = platform.as_object_mut() {
                    if let Some(cached_chats) = platform_obj.get_mut("cached_chats") {
                        if let Some(chats_arr) = cached_chats.as_array_mut() {
                            for chat in chats_arr.iter_mut() {
                                if let Some(chat_obj) = chat.as_object_mut() {
                                    if chat_obj.get("id").and_then(|v| v.as_str()) == Some(&chat_id) {
                                        chat_obj.insert("unread_count".to_string(), serde_json::Value::Number(0.into()));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    write_gateway_state(&gateway_state)?;
    Ok(())
}
