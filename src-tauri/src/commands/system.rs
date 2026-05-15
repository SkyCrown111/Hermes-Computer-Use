//! System Commands
//!
//! Commands for system status and configuration.
//! Queries Hermes Agent state from WSL.

use super::utils::{create_command, run_python_script};
use crate::hermes_adapter::resolve_environment;
use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadinessStatusSnapshot {
    pub health: serde_json::Value,
    pub system_status: SystemStatus,
}

#[derive(Debug, Clone, Deserialize)]
struct SystemSnapshot {
    active_sessions: usize,
    pending_tasks: usize,
    gateway_state: serde_json::Value,
    cpu_percent: f32,
    memory_percent: f32,
    memory_used_mb: u64,
    memory_total_mb: u64,
    disk_percent: f32,
    gateway_process_running: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct HealthSnapshot {
    wsl: bool,
    hermes_dir: bool,
    database: bool,
    cli: bool,
}

fn collect_system_snapshot(
    state_db: &str,
    cron_jobs_path: &str,
    gateway_state_path: &str,
    hermes_home: &str,
) -> Result<SystemSnapshot, String> {
    let script = format!(
        r#"
import json
import os
import sqlite3
import subprocess
import time

state_db = os.path.expanduser({state_db:?})
cron_jobs_path = os.path.expanduser({cron_jobs_path:?})
gateway_state_path = os.path.expanduser({gateway_state_path:?})
hermes_home = os.path.expanduser({hermes_home:?})

def read_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            return json.loads(content) if content else {{}}
    except Exception:
        return {{}}

def read_sessions_count():
    try:
        conn = sqlite3.connect(state_db)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM sessions")
        row = cursor.fetchone()
        conn.close()
        return int(row[0]) if row and row[0] is not None else 0
    except Exception:
        return 0

def read_pending_tasks():
    jobs = read_json(cron_jobs_path)
    if isinstance(jobs, list):
        return sum(1 for job in jobs if isinstance(job, dict) and job.get("id"))
    return 0

def gateway_running():
    try:
        result = subprocess.run(
            ["bash", "-lc", "pgrep -f 'hermes.*gateway' || pgrep -f 'hermes_cli.*gateway'"],
            capture_output=True,
            text=True,
        )
        return bool(result.stdout.strip())
    except Exception:
        return False

def read_memory():
    try:
        total_kb = 0
        available_kb = 0
        with open("/proc/meminfo", "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    total_kb = int(line.split()[1])
                elif line.startswith("MemAvailable:"):
                    available_kb = int(line.split()[1])
        if total_kb <= 0:
            return 0.0, 0, 0
        used_kb = max(total_kb - available_kb, 0)
        return (used_kb / total_kb * 100.0), used_kb // 1024, total_kb // 1024
    except Exception:
        return 0.0, 0, 0

def read_disk_percent():
    try:
        result = subprocess.run(
            ["df", "--output=pcent", hermes_home],
            capture_output=True,
            text=True,
        )
        lines = [line.strip().strip("%") for line in result.stdout.splitlines() if line.strip()]
        return float(lines[-1]) if len(lines) >= 2 else 0.0
    except Exception:
        return 0.0

def read_cpu_sample():
    with open("/proc/stat", "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("cpu "):
                parts = [int(value) for value in line.split()[1:]]
                if len(parts) >= 4:
                    idle = parts[3]
                    total = sum(parts)
                    return idle, total
    return 0, 0

def read_cpu_percent():
    try:
        idle1, total1 = read_cpu_sample()
        time.sleep(0.2)
        idle2, total2 = read_cpu_sample()
        total_diff = max(total2 - total1, 0)
        idle_diff = max(idle2 - idle1, 0)
        if total_diff <= 0:
            return 0.0
        used = max(total_diff - idle_diff, 0)
        return used / total_diff * 100.0
    except Exception:
        return 0.0

memory_percent, memory_used_mb, memory_total_mb = read_memory()

print(json.dumps({{
    "active_sessions": read_sessions_count(),
    "pending_tasks": read_pending_tasks(),
    "gateway_state": read_json(gateway_state_path),
    "cpu_percent": read_cpu_percent(),
    "memory_percent": memory_percent,
    "memory_used_mb": memory_used_mb,
    "memory_total_mb": memory_total_mb,
    "disk_percent": read_disk_percent(),
    "gateway_process_running": gateway_running(),
}}))
"#,
        state_db = state_db,
        cron_jobs_path = cron_jobs_path,
        gateway_state_path = gateway_state_path,
        hermes_home = hermes_home,
    );

    let output = run_python_script(&script)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("Failed to collect system snapshot: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse system snapshot JSON: {}", e))
}

fn collect_health_snapshot(hermes_home: &str, state_db: &str, cli_available: bool) -> Result<HealthSnapshot, String> {
    let script = format!(
        r#"
import json
import os

hermes_home = os.path.expanduser({hermes_home:?})
state_db = os.path.expanduser({state_db:?})

print(json.dumps({{
    "wsl": True,
    "hermes_dir": os.path.isdir(hermes_home),
    "database": os.path.isfile(state_db),
    "cli": {cli_available},
}}))
"#,
        hermes_home = hermes_home,
        state_db = state_db,
        cli_available = if cli_available { "True" } else { "False" },
    );

    let output = run_python_script(&script)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("Failed to collect health snapshot: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse health snapshot JSON: {}", e))
}

/// Get system status - reads real data from Hermes database and gateway state
#[tauri::command(rename_all = "snake_case")]
pub async fn get_system_status(
    performance_cache: tauri::State<'_, std::sync::Arc<crate::core::PerformanceCache>>,
) -> Result<SystemStatus, String> {
    println!("[System] Getting system status...");
    get_system_status_cached(performance_cache.inner().clone()).await
}

async fn get_system_status_cached(
    performance_cache: std::sync::Arc<crate::core::PerformanceCache>,
) -> Result<SystemStatus, String> {
    let cache_key = "system_status";
    if let Some(cached) = performance_cache.get(cache_key).await {
        if let Ok(status) = serde_json::from_value::<SystemStatus>(cached) {
            println!("[System] Returning cached system status");
            return Ok(status);
        }
    }

    println!("[System] Computing fresh system status...");

    let result = tokio::task::spawn_blocking(|| {
        let env = resolve_environment().ok();
        let state_db = env
            .as_ref()
            .map(|value| value.paths.state_db.clone())
            .unwrap_or_else(|| "~/.hermes/state.db".to_string());
        let cron_jobs_path = env
            .as_ref()
            .map(|value| format!("{}/jobs.json", value.paths.cron_dir))
            .unwrap_or_else(|| "~/.hermes/cron/jobs.json".to_string());
        let gateway_state_path = env
            .as_ref()
            .map(|value| format!("{}/gateway_state.json", value.hermes_home))
            .unwrap_or_else(|| "~/.hermes/gateway_state.json".to_string());
        let hermes_home = env
            .as_ref()
            .map(|value| value.hermes_home.clone())
            .unwrap_or_else(|| "~/.hermes".to_string());

        // Check if Hermes CLI/venv actually exists (this is what chat functionality needs)
        // Use multiple detection methods to match chat.rs logic
        let hermes_cli_available = env
            .as_ref()
            .map(|value| value.runtime.python_path.is_some() || value.runtime.cli_command.is_some())
            .unwrap_or(false);
        let snapshot = collect_system_snapshot(
            &state_db,
            &cron_jobs_path,
            &gateway_state_path,
            &hermes_home,
        )
        .unwrap_or(SystemSnapshot {
            active_sessions: 0,
            pending_tasks: 0,
            gateway_state: serde_json::json!({}),
            cpu_percent: 0.0,
            memory_percent: 0.0,
            memory_used_mb: 0,
            memory_total_mb: 0,
            disk_percent: 0.0,
            gateway_process_running: false,
        });

        (snapshot, hermes_cli_available)
    }).await.unwrap_or((
        SystemSnapshot {
            active_sessions: 0,
            pending_tasks: 0,
            gateway_state: serde_json::json!({}),
            cpu_percent: 0.0,
            memory_percent: 0.0,
            memory_used_mb: 0,
            memory_total_mb: 0,
            disk_percent: 0.0,
            gateway_process_running: false,
        },
        false,
    ));

    // Determine gateway status - use multiple sources
    // Priority: 1. gateway_state.json, 2. process check, 3. CLI availability
    let file_status = result
        .0
        .gateway_state
        .get("gateway_state")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    // Determine final status (mapped to frontend expected values: online|offline|degraded)
    let gateway_status = if file_status == "running" || result.0.gateway_process_running {
        "online".to_string()
    } else {
        "offline".to_string()
    };

    println!(
        "[System] Gateway status: file={}, process={}, cli={}, final={}",
        file_status, result.0.gateway_process_running, result.1, gateway_status
    );

    let start_time = result
        .0
        .gateway_state
        .get("start_time")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let current_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let uptime_seconds = if start_time > 0 && start_time < current_time {
        current_time - start_time
    } else {
        start_time
    };

    // Parse connected platforms
    let mut connected_platforms = Vec::new();
    if let Some(platforms) = result.0.gateway_state.get("platforms").and_then(|v| v.as_object()) {
        for (name, info) in platforms {
            let status = info
                .get("state")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let last_activity = info
                .get("updated_at")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            connected_platforms.push(ConnectedPlatform {
                name: name.clone(),
                status: status.to_string(),
                last_activity,
            });
        }
    }

    println!(
        "[System] Sessions: {}, Tasks: {}, Gateway: {}",
        result.0.active_sessions, result.0.pending_tasks, gateway_status
    );
    println!(
        "[System] CPU: {}%, Memory: {}% ({} / {} MB), Disk: {}%",
        result.0.cpu_percent,
        result.0.memory_percent,
        result.0.memory_used_mb,
        result.0.memory_total_mb,
        result.0.disk_percent
    );

    let status = SystemStatus {
        gateway: GatewayStatus {
            status: gateway_status,
            uptime_seconds,
            version: env!("CARGO_PKG_VERSION").to_string(),
            connected_platforms,
        },
        metrics: SystemMetrics {
            cpu_percent: result.0.cpu_percent,
            memory_percent: result.0.memory_percent,
            memory_used_mb: result.0.memory_used_mb,
            memory_total_mb: result.0.memory_total_mb,
            disk_percent: result.0.disk_percent,
        },
        active_sessions: result.0.active_sessions,
        pending_tasks: result.0.pending_tasks,
    };

    // Cache the result (TTL: 10 seconds)
    if let Ok(status_json) = serde_json::to_value(&status) {
        performance_cache.set(cache_key, status_json, None).await;
    }

    Ok(status)
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
#[tauri::command(rename_all = "snake_case")]
pub async fn get_usage_analytics(
    days: Option<u32>,
    performance_cache: tauri::State<'_, std::sync::Arc<crate::core::PerformanceCache>>,
) -> Result<UsageAnalytics, String> {
    let days = days.unwrap_or(30);
    println!("[Analytics] Getting usage analytics for {} days...", days);

    // Try to get from cache first
    let cache_key = format!("usage_analytics_{}", days);
    if let Some(cached) = performance_cache.get(&cache_key).await {
        if let Ok(analytics) = serde_json::from_value::<UsageAnalytics>(cached) {
            println!("[Analytics] Returning cached usage analytics");
            return Ok(analytics);
        }
    }

    // Cache miss - compute fresh data
    println!("[Analytics] Computing fresh usage analytics...");

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
                println!("[Analytics] Received response ({} bytes)", stdout.len());
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
    })
    .await
    .unwrap_or(None);

    if let Some(data) = result {
        let totals = data.get("totals").cloned().unwrap_or(serde_json::json!({}));

        let daily: Vec<DailyUsage> = data
            .get("daily")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|d| {
                        Some(DailyUsage {
                            day: d.get("day").and_then(|v| v.as_str())?.to_string(),
                            input_tokens: d
                                .get("input_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0),
                            output_tokens: d
                                .get("output_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0),
                            cache_read_tokens: d
                                .get("cache_read_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0),
                            reasoning_tokens: d
                                .get("reasoning_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0),
                            estimated_cost: d
                                .get("estimated_cost")
                                .and_then(|v| v.as_f64())
                                .unwrap_or(0.0),
                            actual_cost: d
                                .get("actual_cost")
                                .and_then(|v| v.as_f64())
                                .unwrap_or(0.0),
                            sessions: d.get("sessions").and_then(|v| v.as_u64()).unwrap_or(0),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        let by_model: Vec<ModelUsage> = data
            .get("by_model")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| {
                        Some(ModelUsage {
                            model: m.get("model").and_then(|v| v.as_str())?.to_string(),
                            input_tokens: m
                                .get("input_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0),
                            output_tokens: m
                                .get("output_tokens")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0),
                            estimated_cost: m
                                .get("estimated_cost")
                                .and_then(|v| v.as_f64())
                                .unwrap_or(0.0),
                            sessions: m.get("sessions").and_then(|v| v.as_u64()).unwrap_or(0),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        println!(
            "[Analytics] Returning: {} sessions, {} input tokens, {} output tokens",
            totals.get("sessions").and_then(|v| v.as_u64()).unwrap_or(0),
            totals
                .get("input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
            totals
                .get("output_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0)
        );

        let analytics = UsageAnalytics {
            period_days: days,
            totals: UsageTotals {
                total_sessions: totals.get("sessions").and_then(|v| v.as_u64()).unwrap_or(0),
                total_input: totals
                    .get("input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0),
                total_output: totals
                    .get("output_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0),
                total_cache_read: totals
                    .get("cache_read_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0),
                total_reasoning: totals
                    .get("reasoning_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0),
                total_estimated_cost: totals
                    .get("estimated_cost")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0),
                total_actual_cost: totals
                    .get("actual_cost")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0),
            },
            daily,
            by_model,
        };

        // Cache the result (TTL: 10 seconds)
        if let Ok(analytics_json) = serde_json::to_value(&analytics) {
            performance_cache.set(&cache_key, analytics_json, None).await;
        }

        return Ok(analytics);
    }

    let analytics = UsageAnalytics {
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
    };

    // Cache the empty result too
    if let Ok(analytics_json) = serde_json::to_value(&analytics) {
        performance_cache.set(&cache_key, analytics_json, None).await;
    }

    Ok(analytics)
}

/// Health check - performs actual system health verification
#[tauri::command(rename_all = "snake_case")]
pub async fn health_check(
    performance_cache: tauri::State<'_, std::sync::Arc<crate::core::PerformanceCache>>,
) -> Result<serde_json::Value, String> {
    println!("[System] Performing health check...");
    get_health_check_cached(performance_cache.inner().clone()).await
}

async fn get_health_check_cached(
    performance_cache: std::sync::Arc<crate::core::PerformanceCache>,
) -> Result<serde_json::Value, String> {
    let cache_key = "health_check";
    if let Some(cached) = performance_cache.get(cache_key).await {
        return Ok(cached);
    }

    let env = resolve_environment().ok();
    let hermes_home = env
        .as_ref()
        .map(|value| value.hermes_home.clone())
        .unwrap_or_else(|| "~/.hermes".to_string());
    let state_db = env
        .as_ref()
        .map(|value| value.paths.state_db.clone())
        .unwrap_or_else(|| "~/.hermes/state.db".to_string());
    let cli_available = env
        .as_ref()
        .map(|value| value.runtime.python_path.is_some() || value.runtime.cli_command.is_some())
        .unwrap_or(false);

    let health = collect_health_snapshot(&hermes_home, &state_db, cli_available).unwrap_or(HealthSnapshot {
        wsl: false,
        hermes_dir: false,
        database: false,
        cli: cli_available,
    });

    // Determine overall status
    let status = if health.wsl && health.hermes_dir {
        if health.cli {
            "healthy"
        } else if health.database {
            "degraded"
        } else {
            "partial"
        }
    } else {
        "unhealthy"
    };

    println!(
        "[System] Health check: wsl={}, hermes_dir={}, db={}, cli={}, status={}",
        health.wsl, health.hermes_dir, health.database, health.cli, status
    );

    let result = serde_json::json!({
        "status": status,
        "source": "wsl",
        "checks": {
            "wsl": health.wsl,
            "hermes_dir": health.hermes_dir,
            "database": health.database,
            "cli": health.cli
        }
    });

    performance_cache.set(cache_key, result.clone(), None).await;
    Ok(result)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_readiness_status(
    performance_cache: tauri::State<'_, std::sync::Arc<crate::core::PerformanceCache>>,
) -> Result<ReadinessStatusSnapshot, String> {
    let cache_key = "readiness_status";
    if let Some(cached) = performance_cache.get(cache_key).await {
        if let Ok(snapshot) = serde_json::from_value::<ReadinessStatusSnapshot>(cached) {
            return Ok(snapshot);
        }
    }

    let cache = performance_cache.inner().clone();
    let health = get_health_check_cached(cache.clone()).await?;
    let system_status = get_system_status_cached(cache.clone()).await?;
    let snapshot = ReadinessStatusSnapshot { health, system_status };

    if let Ok(snapshot_json) = serde_json::to_value(&snapshot) {
        cache.set(cache_key, snapshot_json, None).await;
    }

    Ok(snapshot)
}
