//! Log Streaming Commands
//!
//! Tauri commands for real-time log streaming and export.

use crate::features::{LogStreamManager, log_stream_manager::LogFilter};
use std::sync::Arc;
use tauri::State;

/// Start streaming logs from a file
#[tauri::command]
pub async fn start_log_stream(
    log_path: String,
    filter: Option<LogFilter>,
    log_stream_manager: State<'_, Arc<LogStreamManager>>,
) -> Result<String, String> {
    log_stream_manager.start_log_stream(&log_path, filter).await
}

/// Stop streaming logs
#[tauri::command]
pub async fn stop_log_stream(
    stream_id: String,
    log_stream_manager: State<'_, Arc<LogStreamManager>>,
) -> Result<(), String> {
    log_stream_manager.stop_log_stream(&stream_id).await
}

/// Export logs to a file with optional filtering
#[tauri::command]
pub async fn export_logs(
    log_path: String,
    output_path: String,
    filter: Option<LogFilter>,
    log_stream_manager: State<'_, Arc<LogStreamManager>>,
) -> Result<usize, String> {
    log_stream_manager.export_logs(&log_path, &output_path, filter).await
}

/// Return filtered log file contents for UI download (no server-side output path).
#[tauri::command]
pub async fn export_logs_content(
    log_path: String,
    filter: Option<LogFilter>,
    log_stream_manager: State<'_, Arc<LogStreamManager>>,
) -> Result<serde_json::Value, String> {
    let (content, line_count) = log_stream_manager
        .read_filtered_logs(&log_path, filter)
        .await?;
    Ok(serde_json::json!({
        "content": content,
        "line_count": line_count,
    }))
}
