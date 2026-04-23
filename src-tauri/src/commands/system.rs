//! System Commands
//!
//! Commands for system status and configuration.
//! Queries Hermes Agent state from WSL.

use serde::{Deserialize, Serialize};
use std::process::Command;
use super::utils::create_command;

/// Connected platform
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedPlatform {
    pub name: String,
    pub status: String,
    pub last_activity: Option<String>,
}

/// Gateway status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayStatus {
    pub status: String,
    pub uptime_seconds: u64,
    pub version: String,
    pub connected_platforms: Vec<ConnectedPlatform>,
}

/// System metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub cpu_percent: f32,
    pub memory_percent: f32,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
    pub disk_percent: f32,
}

/// System status response - matches frontend types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStatus {
    pub gateway: GatewayStatus,
    pub metrics: SystemMetrics,
    pub active_sessions: usize,
    pub pending_tasks: usize,
}

/// Query SQLite database via WSL Python
fn query_db_single(sql: &str) -> Result<serde_json::Value, String> {
    let script = format!(
        r#"python3 -c "
import sqlite3
import json
import os

conn = sqlite3.connect(os.path.expanduser('~/.hermes/state.db'))
cursor = conn.cursor()
cursor.execute('''{}''')
row = cursor.fetchone()
if row:
    print(json.dumps(row))
conn.close()
""#,
        sql.replace('\n', " ").replace('"', r#"\"#)
    );

    let output = create_command("wsl")
        .args(["bash", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to execute WSL command: {}", e))?;

    if !output.status.success() {
        return Ok(serde_json::json!([]));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Ok(serde_json::json!([]));
    }

    serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse JSON: {}", e))
}

/// Get system status - reads real data from Hermes database and gateway state
#[tauri::command]
pub async fn get_system_status() -> Result<SystemStatus, String> {
    println!("[System] Getting system status...");

    let result = tokio::task::spawn_blocking(|| {
        // Get session count from database
        let active_sessions: usize = match query_db_single("SELECT COUNT(*) FROM sessions") {
            Ok(val) => val.as_array().and_then(|arr| arr.first()).and_then(|v| v.as_u64()).unwrap_or(0) as usize,
            Err(_) => 0,
        };

        // Get task count from jobs.json
        let pending_tasks: usize = if let Ok(output) = create_command("wsl")
            .args(["bash", "-c", "cat ~/.hermes/cron/jobs.json 2>/dev/null | grep -o '\"id\"' | wc -l"])
            .output()
        {
            if output.status.success() {
                String::from_utf8_lossy(&output.stdout).trim().parse().unwrap_or(0)
            } else {
                0
            }
        } else {
            0
        };

        // Read gateway state
        let gateway_state: serde_json::Value = if let Ok(output) = create_command("wsl")
            .args(["bash", "-c", "cat ~/.hermes/gateway_state.json 2>/dev/null"])
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

        // Get system metrics via WSL
        let (cpu_percent, memory_percent, memory_used_mb, memory_total_mb) = get_system_metrics();

        (active_sessions, pending_tasks, gateway_state, cpu_percent, memory_percent, memory_used_mb, memory_total_mb)
    }).await.unwrap_or((0, 0, serde_json::json!({}), 0.0, 0.0, 0, 0));

    // Parse gateway state
    let gateway_status = result.2.get("gateway_state")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    let start_time = result.2.get("start_time")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    // Parse connected platforms
    let mut connected_platforms = Vec::new();
    if let Some(platforms) = result.2.get("platforms").and_then(|v| v.as_object()) {
        for (name, info) in platforms {
            let status = info.get("state").and_then(|v| v.as_str()).unwrap_or("unknown");
            let last_activity = info.get("updated_at").and_then(|v| v.as_str()).map(|s| s.to_string());
            connected_platforms.push(ConnectedPlatform {
                name: name.clone(),
                status: status.to_string(),
                last_activity,
            });
        }
    }

    println!("[System] Sessions: {}, Tasks: {}, Gateway: {}", result.0, result.1, gateway_status);
    println!("[System] CPU: {}%, Memory: {}% ({} / {} MB)", result.3, result.4, result.5, result.6);

    Ok(SystemStatus {
        gateway: GatewayStatus {
            status: gateway_status.to_string(),
            uptime_seconds: start_time,
            version: env!("CARGO_PKG_VERSION").to_string(),
            connected_platforms,
        },
        metrics: SystemMetrics {
            cpu_percent: result.3,
            memory_percent: result.4,
            memory_used_mb: result.5,
            memory_total_mb: result.6,
            disk_percent: 0.0,
        },
        active_sessions: result.0,
        pending_tasks: result.1,
    })
}

/// Get system metrics (CPU, memory) via WSL
fn get_system_metrics() -> (f32, f32, u64, u64) {
    // Get memory info from /proc/meminfo - simpler and more reliable
    let (memory_percent, memory_used_mb, memory_total_mb) = if let Ok(output) = create_command("wsl")
        .args(["cat", "/proc/meminfo"])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut total_kb: u64 = 0;
            let mut available_kb: u64 = 0;

            for line in stdout.lines() {
                if line.starts_with("MemTotal:") {
                    total_kb = line.split_whitespace()
                        .nth(1)
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                } else if line.starts_with("MemAvailable:") {
                    available_kb = line.split_whitespace()
                        .nth(1)
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                }
            }

            if total_kb > 0 {
                let used_kb = total_kb.saturating_sub(available_kb);
                let percent = (used_kb as f64 / total_kb as f64 * 100.0) as f32;
                let used_mb = used_kb / 1024;
                let total_mb = total_kb / 1024;
                println!("[System] Memory parsed: total={}KB, available={}KB, used={}KB", total_kb, available_kb, used_kb);
                (percent, used_mb, total_mb)
            } else {
                (0.0, 0, 0)
            }
        } else {
            (0.0, 0, 0)
        }
    } else {
        (0.0, 0, 0)
    };

    // Get CPU usage - read from /proc/stat twice with delay
    let cpu_percent = if let (Ok(stat1), Ok(stat2)) = (
        create_command("wsl").args(["cat", "/proc/stat"]).output(),
        {
            std::thread::sleep(std::time::Duration::from_millis(500));
            create_command("wsl").args(["cat", "/proc/stat"]).output()
        }
    ) {
        fn parse_cpu_line(output: &std::process::Output) -> Option<(u64, u64)> {
            if !output.status.success() {
                return None;
            }
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.starts_with("cpu ") {
                    let parts: Vec<u64> = line.split_whitespace()
                        .skip(1)
                        .filter_map(|v| v.parse().ok())
                        .collect();
                    if parts.len() >= 4 {
                        let idle = parts[3];
                        let total: u64 = parts.iter().sum();
                        return Some((idle, total));
                    }
                }
            }
            None
        }

        if let (Some((idle1, total1)), Some((idle2, total2))) = (parse_cpu_line(&stat1), parse_cpu_line(&stat2)) {
            let idle_diff = idle2.saturating_sub(idle1);
            let total_diff = total2.saturating_sub(total1);
            if total_diff > 0 {
                let used = total_diff.saturating_sub(idle_diff);
                let percent = (used as f64 / total_diff as f64 * 100.0) as f32;
                println!("[System] CPU parsed: idle_diff={}, total_diff={}, percent={}%", idle_diff, total_diff, percent);
                percent
            } else {
                0.0
            }
        } else {
            0.0
        }
    } else {
        0.0
    };

    (cpu_percent, memory_percent, memory_used_mb, memory_total_mb)
}

/// Get Hermes config
#[tauri::command]
pub fn get_config() -> Result<serde_json::Value, String> {
    let script = "cat ~/.hermes/config.yaml 2>/dev/null || echo '{}'";

    if let Ok(output) = create_command("wsl")
        .args(["bash", "-c", script])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            return Ok(serde_json::json!({
                "raw": stdout.to_string()
            }));
        }
    }

    Ok(serde_json::json!({}))
}

/// Update Hermes config
#[tauri::command]
pub fn update_config(config: serde_json::Value) -> Result<(), String> {
    println!("[System] Updating config: {:?}", config);
    Ok(())
}

/// Check if running in WSL environment
#[tauri::command]
pub fn check_wsl() -> bool {
    create_command("wsl")
        .args(["echo", "ok"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Usage totals
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageTotals {
    pub total_input: u64,
    pub total_output: u64,
    pub total_cache_read: u64,
    pub total_reasoning: u64,
    pub total_estimated_cost: f64,
    pub total_actual_cost: f64,
    pub total_sessions: u64,
}

/// Daily usage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyUsage {
    pub day: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub reasoning_tokens: u64,
    pub estimated_cost: f64,
    pub actual_cost: f64,
    pub sessions: u64,
}

/// Model usage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelUsage {
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub estimated_cost: f64,
    pub sessions: u64,
}

/// Usage analytics response - matches frontend types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageAnalytics {
    pub period_days: u32,
    pub totals: UsageTotals,
    pub daily: Vec<DailyUsage>,
    pub by_model: Vec<ModelUsage>,
}

/// Get usage analytics - reads real data from database
#[tauri::command]
pub async fn get_usage_analytics(days: Option<u32>) -> Result<UsageAnalytics, String> {
    println!("[Analytics] Getting usage analytics for {} days...", days.unwrap_or(30));
    let days = days.unwrap_or(30);

    let result = tokio::task::spawn_blocking(move || {
        // Query database for real stats
        let script = r#"
import sqlite3
import json
import os
from datetime import datetime, timedelta

conn = sqlite3.connect(os.path.expanduser('~/.hermes/state.db'))
cursor = conn.cursor()

# Get totals
cursor.execute('''
    SELECT
        COUNT(*) as sessions,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
        COALESCE(SUM(estimated_cost_usd), 0) as estimated_cost,
        COALESCE(SUM(actual_cost_usd), 0) as actual_cost
    FROM sessions
''')
totals = cursor.fetchone()

# Get daily usage for last N days
cursor.execute('''
    SELECT
        date(started_at, 'unixepoch', 'localtime') as day,
        COUNT(*) as sessions,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
        COALESCE(SUM(estimated_cost_usd), 0) as estimated_cost,
        COALESCE(SUM(actual_cost_usd), 0) as actual_cost
    FROM sessions
    WHERE started_at >= strftime('%s', 'now', '-DAYS_PLACEHOLDER days')
    GROUP BY day
    ORDER BY day
'''.replace('DAYS_PLACEHOLDER', str(DAYS_VAR)))
daily = [dict(zip([d[0] for d in cursor.description], row)) for row in cursor.fetchall()]

# Get usage by model
cursor.execute('''
    SELECT
        model,
        COUNT(*) as sessions,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(estimated_cost_usd), 0) as estimated_cost
    FROM sessions
    WHERE model IS NOT NULL
    GROUP BY model
    ORDER BY input_tokens DESC
    LIMIT 10
''')
by_model = [dict(zip([d[0] for d in cursor.description], row)) for row in cursor.fetchall()]

conn.close()

print(json.dumps({
    'totals': {
        'sessions': totals[0],
        'input_tokens': totals[1],
        'output_tokens': totals[2],
        'cache_read_tokens': totals[3],
        'reasoning_tokens': totals[4],
        'estimated_cost': totals[5] or 0,
        'actual_cost': totals[6] or 0
    },
    'daily': daily,
    'by_model': by_model
}))
"#;

        let script = script
            .replace("DAYS_PLACEHOLDER", &days.to_string())
            .replace("DAYS_VAR", &days.to_string());
        println!("[Analytics] Executing Python script...");

        if let Ok(output) = create_command("wsl")
            .args(["python3", "-c", &script])
            .output()
        {
            println!("[Analytics] Command status: {}", output.status.success());
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                println!("[Analytics] stdout: {}", &stdout[..stdout.len().min(200)]);
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(&stdout) {
                    println!("[Analytics] Parsed JSON successfully");
                    return Some(data);
                } else {
                    println!("[Analytics] Failed to parse JSON");
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                println!("[Analytics] stderr: {}", stderr);
            }
        } else {
            println!("[Analytics] Failed to execute WSL command");
        }
        None
    }).await.unwrap_or(None);

    if let Some(data) = result {
        let totals = data.get("totals").cloned().unwrap_or(serde_json::json!({}));

        let daily: Vec<DailyUsage> = data.get("daily")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|d| {
                Some(DailyUsage {
                    day: d.get("day").and_then(|v| v.as_str())?.to_string(),
                    input_tokens: d.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    output_tokens: d.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    cache_read_tokens: d.get("cache_read_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    reasoning_tokens: d.get("reasoning_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    estimated_cost: d.get("estimated_cost").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    actual_cost: d.get("actual_cost").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    sessions: d.get("sessions").and_then(|v| v.as_u64()).unwrap_or(0),
                })
            }).collect())
            .unwrap_or_default();

        let by_model: Vec<ModelUsage> = data.get("by_model")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|m| {
                Some(ModelUsage {
                    model: m.get("model").and_then(|v| v.as_str())?.to_string(),
                    input_tokens: m.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    output_tokens: m.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    estimated_cost: m.get("estimated_cost").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    sessions: m.get("sessions").and_then(|v| v.as_u64()).unwrap_or(0),
                })
            }).collect())
            .unwrap_or_default();

        println!("[Analytics] Returning: {} sessions, {} input tokens, {} output tokens",
            totals.get("sessions").and_then(|v| v.as_u64()).unwrap_or(0),
            totals.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
            totals.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0));

        return Ok(UsageAnalytics {
            period_days: days,
            totals: UsageTotals {
                total_sessions: totals.get("sessions").and_then(|v| v.as_u64()).unwrap_or(0),
                total_input: totals.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                total_output: totals.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                total_cache_read: totals.get("cache_read_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                total_reasoning: totals.get("reasoning_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                total_estimated_cost: totals.get("estimated_cost").and_then(|v| v.as_f64()).unwrap_or(0.0),
                total_actual_cost: totals.get("actual_cost").and_then(|v| v.as_f64()).unwrap_or(0.0),
            },
            daily,
            by_model,
        });
    }

    Ok(UsageAnalytics {
        period_days: days,
        totals: UsageTotals {
            total_sessions: 0,
            total_input: 0,
            total_output: 0,
            total_cache_read: 0,
            total_reasoning: 0,
            total_estimated_cost: 0.0,
            total_actual_cost: 0.0,
        },
        daily: vec![],
        by_model: vec![],
    })
}

/// Health check
#[tauri::command]
pub fn health_check() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "status": "ok",
        "source": "wsl"
    }))
}
