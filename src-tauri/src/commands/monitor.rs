//! Monitor Commands
//!
//! Commands for log viewing and system monitoring.

use super::utils::create_command;
use serde::{Deserialize, Serialize};

/// Escape a string for use in grep -E pattern (escape regex special chars)
fn escape_grep_pattern(s: &str) -> String {
    // Escape . \ [ ] * ? + ^ $ { } ( ) |
    s.chars()
        .map(|c| match c {
            '.' | '\\' | '[' | ']' | '*' | '?' | '+' | '^' | '$' | '{' | '}' | '(' | ')' | '|' => {
                let mut out = String::with_capacity(2);
                out.push('\\');
                out.push(c);
                out
            }
            c => c.to_string(),
        })
        .collect::<String>()
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

/// Error statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorStats {
    pub total_errors: u64,
    pub by_type: std::collections::HashMap<String, u64>,
    pub last_hour: u64,
    pub last_24h: u64,
}

/// Connection event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionEvent {
    pub timestamp: String,
    pub event_type: String,  // "connect", "disconnect", "error"
    pub platform: String,
    pub message: Option<String>,
}

/// Throughput statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThroughputStats {
    pub requests_per_second: f64,
    pub bytes_per_second: u64,
    pub peak_requests_per_second: f64,
    pub peak_bytes_per_second: u64,
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
    // Advanced metrics
    pub active_requests: u64,
    pub queue_depth: u64,
    pub avg_response_time_ms: f64,
    pub memory_usage_mb: f64,
    pub cpu_usage_percent: f64,
    pub error_stats: ErrorStats,
    pub connection_history: Vec<ConnectionEvent>,
    pub throughput: ThroughputStats,
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

    println!(
        "[Monitor] Getting logs from {} file, {} lines",
        file_name, line_count
    );

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
        let escaped = escape_grep_pattern(lvl);
        cmd = format!("{} | grep -E '\\b{}\\b'", cmd, escaped);
    }
    if let Some(comp) = &component {
        let escaped = escape_grep_pattern(comp);
        cmd = format!("{} | grep -E '\\[{}\\]'", cmd, escaped);
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

    // Calculate uptime from start_time (assuming start_time is Unix timestamp)
    let current_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let uptime_seconds = if start_time > 0 && start_time < current_time {
        current_time - start_time
    } else {
        start_time
    };

    // Get advanced metrics from gateway state
    let active_requests = gateway_state
        .get("active_requests")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let queue_depth = gateway_state
        .get("queue_depth")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let avg_response_time_ms = gateway_state
        .get("avg_response_time_ms")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let total_messages = gateway_state
        .get("total_messages")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let messages_per_minute = gateway_state
        .get("messages_per_minute")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    // Get memory and CPU usage
    let (cpu_usage_percent, memory_usage_mb) = get_gateway_resource_usage();

    // Parse error statistics from gateway log
    let error_stats = parse_gateway_error_stats();

    // Parse connection history from gateway state
    let connection_history = parse_connection_history(&gateway_state);

    // Get throughput stats
    let throughput = parse_throughput_stats(&gateway_state);

    Ok(GatewayDetailedStatus {
        status,
        uptime_seconds,
        version: env!("CARGO_PKG_VERSION").to_string(),
        connections,
        total_messages,
        messages_per_minute,
        active_requests,
        queue_depth,
        avg_response_time_ms,
        memory_usage_mb,
        cpu_usage_percent,
        error_stats,
        connection_history,
        throughput,
    })
}

/// Get gateway process resource usage
fn get_gateway_resource_usage() -> (f64, f64) {
    // Try to find gateway process and get its resource usage
    let script = r#"
# Find gateway process PID
GATEWAY_PID=$(pgrep -f "hermes.*gateway" | head -1)
if [ -z "$GATEWAY_PID" ]; then
    echo "0 0"
    exit 0
fi

# Get memory usage in MB
MEM_KB=$(ps -o rss= -p $GATEWAY_PID 2>/dev/null || echo 0)
MEM_MB=$((MEM_KB / 1024))

# Get CPU percentage (simplified - just get current CPU%)
CPU_PERCENT=$(ps -o %cpu= -p $GATEWAY_PID 2>/dev/null || echo 0)

echo "$CPU_PERCENT $MEM_MB"
"#;

    if let Ok(output) = create_command("wsl")
        .args(["bash", "-c", script])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let parts: Vec<&str> = stdout.trim().split_whitespace().collect();
            if parts.len() >= 2 {
                let cpu: f64 = parts[0].parse().unwrap_or(0.0);
                let mem: f64 = parts[1].parse().unwrap_or(0.0);
                return (cpu, mem);
            }
        }
    }
    (0.0, 0.0)
}

/// Parse error statistics from gateway log
fn parse_gateway_error_stats() -> ErrorStats {
    let script = r#"
if [ -f ~/.hermes/logs/gateway.log ]; then
    # Total errors
    TOTAL=$(grep -c 'ERROR' ~/.hermes/logs/gateway.log 2>/dev/null || echo 0)

    # Errors by type (extract error patterns)
    TIMEOUT=$(grep -c 'timeout\|Timeout\|TIMEOUT' ~/.hermes/logs/gateway.log 2>/dev/null || echo 0)
    CONNECTION=$(grep -c 'connection.*failed\|Connection.*refused\|ECONNREFUSED' ~/.hermes/logs/gateway.log 2>/dev/null || echo 0)
    RATE_LIMIT=$(grep -c 'rate.*limit\|429\|Too Many Requests' ~/.hermes/logs/gateway.log 2>/dev/null || echo 0)
    AUTH=$(grep -c 'unauthorized\|Unauthorized\|401\|403' ~/.hermes/logs/gateway.log 2>/dev/null || echo 0)

    # Last hour errors (assuming log has timestamps)
    LAST_HOUR=$(tail -1000 ~/.hermes/logs/gateway.log 2>/dev/null | grep -c 'ERROR' || echo 0)

    # Last 24h (simplified - count from recent logs)
    LAST_24H=$TOTAL

    echo "$TOTAL $TIMEOUT $CONNECTION $RATE_LIMIT $AUTH $LAST_HOUR $LAST_24H"
else
    echo "0 0 0 0 0 0 0"
fi
"#;

    let mut by_type = std::collections::HashMap::new();

    if let Ok(output) = create_command("wsl")
        .args(["bash", "-c", script])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let parts: Vec<u64> = stdout
                .trim()
                .split_whitespace()
                .filter_map(|p| p.parse().ok())
                .collect();

            if parts.len() >= 7 {
                by_type.insert("timeout".to_string(), parts[1]);
                by_type.insert("connection".to_string(), parts[2]);
                by_type.insert("rate_limit".to_string(), parts[3]);
                by_type.insert("auth".to_string(), parts[4]);

                return ErrorStats {
                    total_errors: parts[0],
                    by_type,
                    last_hour: parts[5],
                    last_24h: parts[6],
                };
            }
        }
    }

    ErrorStats {
        total_errors: 0,
        by_type,
        last_hour: 0,
        last_24h: 0,
    }
}

/// Parse connection history from gateway state
fn parse_connection_history(gateway_state: &serde_json::Value) -> Vec<ConnectionEvent> {
    let mut history = Vec::new();

    // Try to parse connection_history from state
    if let Some(events) = gateway_state.get("connection_history").and_then(|v| v.as_array()) {
        for event in events {
            let timestamp = event
                .get("timestamp")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let event_type = event
                .get("event_type")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let platform = event
                .get("platform")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let message = event
                .get("message")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            history.push(ConnectionEvent {
                timestamp,
                event_type,
                platform,
                message,
            });
        }
    }

    // If no history in state, generate from current platform states
    if history.is_empty() {
        let now = chrono::Local::now().to_rfc3339();
        if let Some(platforms) = gateway_state.get("platforms").and_then(|v| v.as_object()) {
            for (name, info) in platforms {
                let state = info
                    .get("state")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");

                history.push(ConnectionEvent {
                    timestamp: now.clone(),
                    event_type: if state == "connected" { "connect".to_string() } else { "disconnect".to_string() },
                    platform: name.clone(),
                    message: Some(format!("Platform {} is {}", name, state)),
                });
            }
        }
    }

    // Limit to last 10 events
    history.truncate(10);
    history
}

/// Parse throughput statistics from gateway state
fn parse_throughput_stats(gateway_state: &serde_json::Value) -> ThroughputStats {
    let throughput_data = gateway_state.get("throughput").cloned().unwrap_or(serde_json::json!({}));

    ThroughputStats {
        requests_per_second: throughput_data
            .get("requests_per_second")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0),
        bytes_per_second: throughput_data
            .get("bytes_per_second")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
        peak_requests_per_second: throughput_data
            .get("peak_requests_per_second")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0),
        peak_bytes_per_second: throughput_data
            .get("peak_bytes_per_second")
            .and_then(|v| v.as_u64())
            .unwrap_or(0),
    }
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
        cpu: vec![MetricPoint {
            timestamp: now,
            value: cpu,
        }],
        memory: vec![MetricPoint {
            timestamp: now,
            value: memory,
        }],
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
                    total_kb = line
                        .split_whitespace()
                        .nth(1)
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                } else if line.starts_with("MemAvailable:") {
                    available_kb = line
                        .split_whitespace()
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

/// Reload gateway configuration (hot reload)
#[tauri::command]
pub async fn reload_gateway_config() -> Result<(), String> {
    println!("[Monitor] Reloading gateway config...");

    // Send SIGHUP to gateway process to trigger config reload
    // Or use a dedicated reload mechanism
    let script = r#"
# Try to reload via gateway control socket if available
if [ -S ~/.hermes/gateway.sock ]; then
    echo "RELOAD" | nc -U ~/.hermes/gateway.sock 2>/dev/null && echo "reloaded" || echo "failed"
else
    # Fallback: touch config to trigger file watcher
    touch ~/.hermes/config.yaml 2>/dev/null && echo "triggered" || echo "failed"
fi
"#;

    let output = create_command("wsl")
        .args(["bash", "-c", script])
        .output()
        .map_err(|e| format!("Failed to reload gateway config: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    println!("[Monitor] Reload result: {}", stdout.trim());

    if stdout.contains("failed") {
        return Err("Failed to reload gateway config".to_string());
    }

    Ok(())
}
