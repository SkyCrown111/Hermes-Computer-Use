//! Log Stream Manager
//!
//! Provides real-time log streaming functionality for monitoring Hermes Agent logs.

use crate::core::event_bus::{Event, EventBus};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::AsyncBufReadExt;
use tokio::process::Command;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

/// Log entry structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub module: Option<String>,
    pub message: String,
}

/// Log filter criteria
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogFilter {
    pub level: Option<String>,      // DEBUG, INFO, WARN, ERROR
    pub module: Option<String>,     // module name filter
    pub keyword: Option<String>,    // keyword search
}

/// Stream handle for tracking active streams
struct StreamHandle {
    cancel_token: CancellationToken,
}

static LOG_ENTRY_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(?:\[([^\]]+)\]\s*)?(.*)$")
        .expect("log entry regex must be valid")
});

/// Log Stream Manager
pub struct LogStreamManager {
    event_bus: Arc<EventBus>,
    active_streams: Arc<RwLock<HashMap<String, StreamHandle>>>,
}

impl LogStreamManager {
    /// Create a new LogStreamManager
    pub fn new(event_bus: Arc<EventBus>) -> Self {
        Self {
            event_bus,
            active_streams: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Start streaming logs from a file
    pub async fn start_log_stream(
        &self,
        log_path: &str,
        filter: Option<LogFilter>,
    ) -> Result<String, String> {
        println!("[LogStreamManager] Starting log stream for: {}", log_path);

        // Generate unique stream ID
        let stream_id = Uuid::new_v4().to_string();
        let cancel_token = CancellationToken::new();

        // Create stream handle
        let handle = StreamHandle {
            cancel_token: cancel_token.clone(),
        };

        // Store handle
        {
            let mut streams = self.active_streams.write().await;
            streams.insert(stream_id.clone(), handle);
        }

        // Spawn background task for streaming
        let event_bus = self.event_bus.clone();
        let log_path_owned = log_path.to_string();
        let stream_id_clone = stream_id.clone();
        let active_streams = self.active_streams.clone();

        tokio::spawn(async move {
            if let Err(e) = Self::stream_logs_task(
                log_path_owned,
                filter,
                event_bus,
                cancel_token,
                stream_id_clone.clone(),
            )
            .await
            {
                eprintln!("[LogStreamManager] Stream error: {}", e);
            }

            // Clean up stream handle when done
            let mut streams = active_streams.write().await;
            streams.remove(&stream_id_clone);
        });

        Ok(stream_id)
    }

    /// Stop streaming logs
    pub async fn stop_log_stream(&self, stream_id: &str) -> Result<(), String> {
        println!("[LogStreamManager] Stopping log stream: {}", stream_id);

        let mut streams = self.active_streams.write().await;
        if let Some(handle) = streams.remove(stream_id) {
            handle.cancel_token.cancel();
            Ok(())
        } else {
            Err(format!("Stream not found: {}", stream_id))
        }
    }

    /// Read log file and apply optional filters (returns full text + line count).
    pub async fn read_filtered_logs(
        &self,
        log_path: &str,
        filter: Option<LogFilter>,
    ) -> Result<(String, usize), String> {
        let wsl_log_path = Self::convert_to_wsl_path(log_path);
        let output = Command::new("wsl")
            .args(["cat", &wsl_log_path])
            .output()
            .await
            .map_err(|e| format!("Failed to read log file: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "Failed to read log file: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let content = String::from_utf8_lossy(&output.stdout);
        let filtered_lines: Vec<String> = content
            .lines()
            .filter(|line| {
                let entry = Self::parse_log_line(line);
                Self::matches_filter(&entry, &filter)
            })
            .map(|line| line.to_string())
            .collect();

        let line_count = filtered_lines.len();
        Ok((filtered_lines.join("\n"), line_count))
    }

    /// Export logs to a file with optional filtering
    pub async fn export_logs(
        &self,
        log_path: &str,
        output_path: &str,
        filter: Option<LogFilter>,
    ) -> Result<usize, String> {
        println!(
            "[LogStreamManager] Exporting logs from {} to {}",
            log_path, output_path
        );

        let (output_content, line_count) = self.read_filtered_logs(log_path, filter).await?;
        tokio::fs::write(output_path, output_content)
            .await
            .map_err(|e| format!("Failed to write output file: {}", e))?;

        Ok(line_count)
    }

    /// Background task for streaming logs
    async fn stream_logs_task(
        log_path: String,
        filter: Option<LogFilter>,
        event_bus: Arc<EventBus>,
        cancel_token: CancellationToken,
        stream_id: String,
    ) -> Result<(), String> {
        let wsl_log_path = Self::convert_to_wsl_path(&log_path);

        // Start tail -f command
        let mut child = Command::new("wsl")
            .args(&["tail", "-f", &wsl_log_path])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start tail command: {}", e))?;

        let stdout = child
            .stdout
            .take()
            .ok_or("Failed to capture stdout")?;

        let mut reader = tokio::io::BufReader::new(stdout).lines();

        // Read lines until cancelled
        loop {
            tokio::select! {
                _ = cancel_token.cancelled() => {
                    println!("[LogStreamManager] Stream cancelled: {}", stream_id);
                    let _ = child.kill().await;
                    break;
                }
                line_result = reader.next_line() => {
                    match line_result {
                        Ok(Some(line)) => {
                            let entry = Self::parse_log_line(&line);
                            if Self::matches_filter(&entry, &filter) {
                                let log_message = if let Some(module) = &entry.module {
                                    format!("[{}] {}", module, entry.message)
                                } else {
                                    entry.message.clone()
                                };
                                event_bus.publish(Event::LogEntry {
                                    timestamp: entry.timestamp.clone(),
                                    level: entry.level.clone(),
                                    message: log_message,
                                });
                            }
                        }
                        Ok(None) => {
                            // End of stream
                            break;
                        }
                        Err(e) => {
                            eprintln!("[LogStreamManager] Error reading line: {}", e);
                            break;
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Parse a log line into a LogEntry
    fn parse_log_line(line: &str) -> LogEntry {
        // Try to parse format: [TIMESTAMP] [LEVEL] [MODULE] message
        // Example: [2024-01-15 10:30:45] [INFO] [hermes.core] Starting application

        if let Some(caps) = LOG_ENTRY_REGEX.captures(line) {
            LogEntry {
                timestamp: caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default(),
                level: caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_else(|| "INFO".to_string()),
                module: caps.get(3).map(|m| m.as_str().to_string()),
                message: caps.get(4).map(|m| m.as_str().to_string()).unwrap_or_default(),
            }
        } else {
            // Fallback: treat entire line as message
            LogEntry {
                timestamp: chrono::Utc::now().to_rfc3339(),
                level: "INFO".to_string(),
                module: None,
                message: line.to_string(),
            }
        }
    }

    /// Check if a log entry matches the filter criteria
    fn matches_filter(entry: &LogEntry, filter: &Option<LogFilter>) -> bool {
        if let Some(f) = filter {
            // Check level filter
            if let Some(ref level) = f.level {
                if !entry.level.eq_ignore_ascii_case(level) {
                    return false;
                }
            }

            // Check module filter
            if let Some(ref module) = f.module {
                if let Some(ref entry_module) = entry.module {
                    if !entry_module.contains(module) {
                        return false;
                    }
                } else {
                    return false;
                }
            }

            // Check keyword filter
            if let Some(ref keyword) = f.keyword {
                if !entry.message.to_lowercase().contains(&keyword.to_lowercase()) {
                    return false;
                }
            }
        }

        true
    }

    /// Convert Windows path to WSL path
    fn convert_to_wsl_path(path: &str) -> String {
        // Convert Windows path like "C:\Users\..." to WSL path "/mnt/c/Users/..."
        if path.len() >= 2 && path.chars().nth(1) == Some(':') {
            let drive = path.chars().nth(0).unwrap().to_lowercase();
            let rest = path[2..].replace('\\', "/");
            format!("/mnt/{}{}", drive, rest)
        } else {
            path.to_string()
        }
    }
}
