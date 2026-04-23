//! Monitor Commands
//!
//! Commands for log viewing and system monitoring.

use serde::{Deserialize, Serialize};
use std::process::Command;
use super::utils::create_command;

/// Log file type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LogFile {
    agent,
    gateway,
    cron,
    mcp,
}

/// Log line structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogLine {
    pub raw: String,
    pub timestamp: Option<String>,
    pub level: Option<String>,
    pub component: Option<String>,
    pub message: Option<String>,
}

/// Logs response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogsResponse {
    pub file: String,
    pub lines: Vec<String>,
}

/// Log statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogStats {
    pub total_lines: usize,
    pub by_level: std::collections::HashMap<String, usize>,
    pub by_component: Vec<ComponentStat>,
    pub error_rate: f64,
}

/// Component statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentStat {
    pub name: String,
    pub count: usize,
}

/// Platform connection status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformConnection {
    pub platform: String,
    pub status: String,
}

/// Gateway detailed status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayDetailedStatus {
    pub status: String,
    pub uptime_seconds: u64,
    pub version: String,
    pub connections: Vec<PlatformConnection>,
    pub total_messages: u64,
    pub messages_per_minute: f64,
}

/// Metric data point
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricPoint {
    pub timestamp: u64,
    pub value: f32,
}

/// Performance metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub cpu: Vec<MetricPoint>,
    pub memory: Vec<MetricPoint>,
    pub network_in: Vec<MetricPoint>,
    pub network_out: Vec<MetricPoint>,
}

/// Get logs from file
#[tauri::command]
pub async fn get_logs(
    file: Option<String>,
    lines: Option<usize>,
    level: Option<String>,
    component: Option<String>,
    search: Option<String>,
) -> Result<LogsResponse, String> {
    let file_name = file.unwrap_or_else(|| "agent".to_string());
    let line_count = lines.unwrap_or(200);

    println!("[Monitor] Getting logs from {} file, {} lines", file_name, line_count);

    let log_path = match file_name.as_str() {
        "agent" => "~/.hermes/logs/agent.log",
        "gateway" => "~/.hermes/logs/gateway.log",
        "cron" => "~/.hermes/logs/cron.log",
        "mcp" => "~/.hermes/logs/mcp.log",
        _ => "~/.hermes/logs/agent.log",
    };

    let mut cmd = format!("tail -n {} {} 2>/dev/null || echo ''", line_count, log_path);

    // Add filters
    if let Some(lvl) = &level {
        cmd = format!("{} | grep -E '\\b{}\\b'", cmd, lvl);
    }
    if let Some(comp) = &component {
        cmd = format!("{} | grep -E '\\[{}\\]'", cmd, comp);
    }
    if let Some(srch) = &search {
        cmd = format!("{} | grep -i '{}'", cmd, srch.replace("'", "'\\''"));
    }

    let output = create_command("wsl")
        .args(["bash", "-c", &cmd])
        .output()
        .map_err(|e| format!("Failed to read log file: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let log_lines: Vec<String> = stdout
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect();

    println!("[Monitor] Found {} log lines", log_lines.len());

    Ok(LogsResponse {
        file: file_name,
        lines: log_lines,
    })
}

/// Get log statistics
#[tauri::command]
pub async fn get_log_stats(file: Option<String>) -> Result<LogStats, String> {
    let file_name = file.unwrap_or_else(|| "agent".to_string());

    let log_path = match file_name.as_str() {
        "agent" => "~/.hermes/logs/agent.log",
        "gateway" => "~/.hermes/logs/gateway.log",
        "cron" => "~/.hermes/logs/cron.log",
        "mcp" => "~/.hermes/logs/mcp.log",
        _ => "~/.hermes/logs/agent.log",
    };

    // Get line count and level counts
    let script = format!(
        r#"
if [ -f {} ]; then
    total=$(wc -l < {})
    debug=$(grep -c 'DEBUG' {} 2>/dev/null || echo 0)
    info=$(grep -c 'INFO' {} 2>/dev/null || echo 0)
    warning=$(grep -c 'WARNING' {} 2>/dev/null || echo 0)
    error=$(grep -c 'ERROR' {} 2>/dev/null || echo 0)
    critical=$(grep -c 'CRITICAL' {} 2>/dev/null || echo 0)
    echo "$total $debug $info $warning $error $critical"
else
    echo "0 0 0 0 0 0"
fi
"#,
        log_path, log_path, log_path, log_path, log_path, log_path, log_path
    );

    let output = create_command("wsl")
        .args(["bash", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to get log stats: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parts: Vec<usize> = stdout
        .split_whitespace()
        .filter_map(|p| p.parse().ok())
        .collect();

    let (total, debug, info, warning, error, critical) = if parts.len() >= 6 {
        (parts[0], parts[1], parts[2], parts[3], parts[4], parts[5])
    } else {
        (0, 0, 0, 0, 0, 0)
    };

    let mut by_level = std::collections::HashMap::new();
    by_level.insert("DEBUG".to_string(), debug);
    by_level.insert("INFO".to_string(), info);
    by_level.insert("WARNING".to_string(), warning);
    by_level.insert("ERROR".to_string(), error);
    by_level.insert("CRITICAL".to_string(), critical);

    let error_rate = if total > 0 {
        (error + critical) as f64 / total as f64 * 100.0
    } else {
        0.0
    };

    Ok(LogStats {
        total_lines: total,
        by_level,
        by_component: vec![],
        error_rate,
    })
}

/// Get gateway detailed status
#[tauri::command]
pub async fn get_gateway_status() -> Result<GatewayDetailedStatus, String> {
    println!("[Monitor] Getting gateway status...");

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

    let status = gateway_state
        .get("gateway_state")
        .and_then(|v| v.as_str())
        .unwrap_or("offline")
        .to_string();

    let start_time = gateway_state
        .get("start_time")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    // Parse platforms
    let mut connections = Vec::new();
    if let Some(platforms) = gateway_state.get("platforms").and_then(|v| v.as_object()) {
        for (name, info) in platforms {
            let state = info
                .get("state")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            connections.push(PlatformConnection {
                platform: name.clone(),
                status: state,
            });
        }
    }

    Ok(GatewayDetailedStatus {
        status,
        uptime_seconds: start_time,
        version: env!("CARGO_PKG_VERSION").to_string(),
        connections,
        total_messages: 0,
        messages_per_minute: 0.0,
    })
}

/// Get performance metrics
#[tauri::command]
pub async fn get_performance_metrics(minutes: Option<u32>) -> Result<PerformanceMetrics, String> {
    let _minutes = minutes.unwrap_or(30);
    println!("[Monitor] Getting performance metrics...");

    // Get current CPU and memory
    let (cpu, memory) = get_current_metrics();

    // For now, return single data point
    // In a real implementation, this would query historical data
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    Ok(PerformanceMetrics {
        cpu: vec![MetricPoint { timestamp: now, value: cpu }],
        memory: vec![MetricPoint { timestamp: now, value: memory }],
        network_in: vec![],
        network_out: vec![],
    })
}

/// Get current CPU and memory metrics
fn get_current_metrics() -> (f32, f32) {
    // Get memory
    let memory_percent = if let Ok(output) = create_command("wsl")
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
                (used_kb as f64 / total_kb as f64 * 100.0) as f32
            } else {
                0.0
            }
        } else {
            0.0
        }
    } else {
        0.0
    };

    // Get CPU (simplified - just return 0 for now as it requires two readings)
    (0.0, memory_percent)
}

/// Get log components
#[tauri::command]
pub async fn get_log_components() -> Result<Vec<String>, String> {
    let script = r#"
if [ -f ~/.hermes/logs/agent.log ]; then
    grep -oE '\[[a-zA-Z_]+\]' ~/.hermes/logs/agent.log | sort | uniq | tr -d '[]'
fi
"#;

    let output = create_command("wsl")
        .args(["bash", "-c", script])
        .output()
        .map_err(|e| format!("Failed to get components: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let components: Vec<String> = stdout
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect();

    Ok(components)
}

/// Clear logs
#[tauri::command]
pub async fn clear_logs(file: Option<String>) -> Result<(), String> {
    let file_name = file.unwrap_or_else(|| "agent".to_string());

    let log_path = match file_name.as_str() {
        "agent" => "~/.hermes/logs/agent.log",
        "gateway" => "~/.hermes/logs/gateway.log",
        "cron" => "~/.hermes/logs/cron.log",
        "mcp" => "~/.hermes/logs/mcp.log",
        _ => "~/.hermes/logs/agent.log",
    };

    let cmd = format!("> {}", log_path);

    create_command("wsl")
        .args(["bash", "-c", &cmd])
        .output()
        .map_err(|e| format!("Failed to clear logs: {}", e))?;

    println!("[Monitor] Cleared {} logs", file_name);
    Ok(())
}
