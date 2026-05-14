//! Checkpoint Manager
//!
//! Manages session checkpoints (snapshots) for Hermes Agent.

use crate::core::event_bus::{Event, EventBus};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Checkpoint metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointMetadata {
    pub id: String,
    pub session_id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub message_count: usize,
    pub size_bytes: u64,
    pub tags: Vec<String>,
}

/// Checkpoint creation options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCheckpointOptions {
    pub session_id: String,
    pub name: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub include_files: Option<bool>,
}

/// Checkpoint restore options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreCheckpointOptions {
    pub checkpoint_id: String,
    pub target_session_id: Option<String>,
    pub restore_files: Option<bool>,
}

/// Checkpoint manager
pub struct CheckpointManager {
    checkpoints_dir: PathBuf,
    event_bus: Arc<EventBus>,
    metadata_cache: Arc<RwLock<Vec<CheckpointMetadata>>>,
}

impl CheckpointManager {
    pub fn new(checkpoints_dir: PathBuf, event_bus: Arc<EventBus>) -> Self {
        Self {
            checkpoints_dir,
            event_bus,
            metadata_cache: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Create a checkpoint for a session
    pub async fn create_checkpoint(
        &self,
        options: CreateCheckpointOptions,
    ) -> Result<CheckpointMetadata, String> {
        println!(
            "[CheckpointManager] Creating checkpoint for session: {}",
            options.session_id
        );

        // Ensure checkpoints directory exists
        tokio::fs::create_dir_all(&self.checkpoints_dir)
            .await
            .map_err(|e| format!("Failed to create checkpoints directory: {}", e))?;

        // Generate checkpoint ID
        let checkpoint_id = self.generate_checkpoint_id();
        let created_at = chrono::Utc::now().to_rfc3339();

        // Read session messages from database
        let messages = self.read_session_messages(&options.session_id).await?;
        let message_count = messages.len();

        // Create checkpoint data
        let tags = options.tags.clone().unwrap_or_default();
        let checkpoint_data = serde_json::json!({
            "id": checkpoint_id,
            "session_id": options.session_id,
            "name": options.name,
            "description": options.description,
            "created_at": created_at,
            "message_count": message_count,
            "tags": tags,
            "messages": messages,
        });

        // Save checkpoint file
        let filename = format!("{}_{}.json", options.session_id, checkpoint_id);
        let filepath = self.checkpoints_dir.join(&filename);

        let content = serde_json::to_string_pretty(&checkpoint_data)
            .map_err(|e| format!("Failed to serialize checkpoint: {}", e))?;

        tokio::fs::write(&filepath, content)
            .await
            .map_err(|e| format!("Failed to write checkpoint file: {}", e))?;

        // Get file size
        let metadata = tokio::fs::metadata(&filepath)
            .await
            .map_err(|e| format!("Failed to get file metadata: {}", e))?;
        let size_bytes = metadata.len();

        // Create metadata
        let checkpoint_metadata = CheckpointMetadata {
            id: checkpoint_id.clone(),
            session_id: options.session_id.clone(),
            name: options.name,
            description: options.description,
            created_at,
            message_count,
            size_bytes,
            tags,
        };

        // Update cache
        let mut cache = self.metadata_cache.write().await;
        cache.push(checkpoint_metadata.clone());

        // Emit event
        self.event_bus
            .publish(Event::CheckpointCreated {
                id: checkpoint_id.clone(),
            });

        println!(
            "[CheckpointManager] Created checkpoint {} ({} messages, {} bytes)",
            checkpoint_id, message_count, size_bytes
        );

        Ok(checkpoint_metadata)
    }

    /// List all checkpoints for a session
    pub async fn list_checkpoints(
        &self,
        session_id: &str,
    ) -> Result<Vec<CheckpointMetadata>, String> {
        println!(
            "[CheckpointManager] Listing checkpoints for session: {}",
            session_id
        );

        let mut checkpoints = Vec::new();

        // Read checkpoint files
        let mut entries = tokio::fs::read_dir(&self.checkpoints_dir)
            .await
            .map_err(|e| format!("Failed to read checkpoints directory: {}", e))?;

        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| format!("Failed to read directory entry: {}", e))?
        {
            let filename = entry.file_name();
            let filename_str = filename.to_string_lossy();

            if filename_str.starts_with(&format!("{}_", session_id))
                && filename_str.ends_with(".json")
            {
                // Read checkpoint file
                let content = tokio::fs::read_to_string(entry.path())
                    .await
                    .map_err(|e| format!("Failed to read checkpoint file: {}", e))?;

                let data: serde_json::Value = serde_json::from_str(&content)
                    .map_err(|e| format!("Failed to parse checkpoint: {}", e))?;

                // Extract metadata
                let metadata = CheckpointMetadata {
                    id: data["id"].as_str().unwrap_or("").to_string(),
                    session_id: data["session_id"].as_str().unwrap_or("").to_string(),
                    name: data["name"].as_str().unwrap_or("Unnamed").to_string(),
                    description: data["description"].as_str().map(|s| s.to_string()),
                    created_at: data["created_at"].as_str().unwrap_or("").to_string(),
                    message_count: data["message_count"].as_u64().unwrap_or(0) as usize,
                    size_bytes: entry
                        .metadata()
                        .await
                        .map(|m| m.len())
                        .unwrap_or(0),
                    tags: data["tags"]
                        .as_array()
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_default(),
                };

                checkpoints.push(metadata);
            }
        }

        // Sort by created_at descending
        checkpoints.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        println!(
            "[CheckpointManager] Found {} checkpoints for session {}",
            checkpoints.len(),
            session_id
        );

        Ok(checkpoints)
    }

    /// Get checkpoint info
    pub async fn get_checkpoint_info(
        &self,
        checkpoint_id: &str,
    ) -> Result<CheckpointMetadata, String> {
        println!(
            "[CheckpointManager] Getting checkpoint info: {}",
            checkpoint_id
        );

        // Find checkpoint file
        let mut entries = tokio::fs::read_dir(&self.checkpoints_dir)
            .await
            .map_err(|e| format!("Failed to read checkpoints directory: {}", e))?;

        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| format!("Failed to read directory entry: {}", e))?
        {
            let filename = entry.file_name();
            let filename_str = filename.to_string_lossy();

            if filename_str.contains(&format!("_{}.json", checkpoint_id)) {
                // Read checkpoint file
                let content = tokio::fs::read_to_string(entry.path())
                    .await
                    .map_err(|e| format!("Failed to read checkpoint file: {}", e))?;

                let data: serde_json::Value = serde_json::from_str(&content)
                    .map_err(|e| format!("Failed to parse checkpoint: {}", e))?;

                // Extract metadata
                let metadata = CheckpointMetadata {
                    id: data["id"].as_str().unwrap_or("").to_string(),
                    session_id: data["session_id"].as_str().unwrap_or("").to_string(),
                    name: data["name"].as_str().unwrap_or("Unnamed").to_string(),
                    description: data["description"].as_str().map(|s| s.to_string()),
                    created_at: data["created_at"].as_str().unwrap_or("").to_string(),
                    message_count: data["message_count"].as_u64().unwrap_or(0) as usize,
                    size_bytes: entry
                        .metadata()
                        .await
                        .map(|m| m.len())
                        .unwrap_or(0),
                    tags: data["tags"]
                        .as_array()
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_default(),
                };

                return Ok(metadata);
            }
        }

        Err(format!("Checkpoint not found: {}", checkpoint_id))
    }

    /// Restore a checkpoint
    pub async fn restore_checkpoint(
        &self,
        options: RestoreCheckpointOptions,
    ) -> Result<String, String> {
        println!(
            "[CheckpointManager] Restoring checkpoint: {}",
            options.checkpoint_id
        );

        // Find checkpoint file
        let mut entries = tokio::fs::read_dir(&self.checkpoints_dir)
            .await
            .map_err(|e| format!("Failed to read checkpoints directory: {}", e))?;

        let mut checkpoint_path: Option<PathBuf> = None;

        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| format!("Failed to read directory entry: {}", e))?
        {
            let filename = entry.file_name();
            let filename_str = filename.to_string_lossy();

            if filename_str.contains(&format!("_{}.json", options.checkpoint_id)) {
                checkpoint_path = Some(entry.path());
                break;
            }
        }

        let checkpoint_path = checkpoint_path
            .ok_or_else(|| format!("Checkpoint not found: {}", options.checkpoint_id))?;

        // Read checkpoint data
        let content = tokio::fs::read_to_string(&checkpoint_path)
            .await
            .map_err(|e| format!("Failed to read checkpoint file: {}", e))?;

        let data: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse checkpoint: {}", e))?;

        let session_id = options
            .target_session_id
            .unwrap_or_else(|| data["session_id"].as_str().unwrap_or("").to_string());

        let messages = data["messages"]
            .as_array()
            .ok_or_else(|| "No messages in checkpoint".to_string())?;

        // Restore messages to database
        self.restore_messages_to_db(&session_id, messages).await?;

        // Emit event
        self.event_bus
            .publish(Event::CheckpointRestored {
                id: options.checkpoint_id.clone(),
            });

        println!(
            "[CheckpointManager] Restored checkpoint {} to session {}",
            options.checkpoint_id, session_id
        );

        Ok(session_id)
    }

    /// Delete a checkpoint
    pub async fn delete_checkpoint(&self, checkpoint_id: &str) -> Result<(), String> {
        println!("[CheckpointManager] Deleting checkpoint: {}", checkpoint_id);

        // Find and delete checkpoint file
        let mut entries = tokio::fs::read_dir(&self.checkpoints_dir)
            .await
            .map_err(|e| format!("Failed to read checkpoints directory: {}", e))?;

        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| format!("Failed to read directory entry: {}", e))?
        {
            let filename = entry.file_name();
            let filename_str = filename.to_string_lossy();

            if filename_str.contains(&format!("_{}.json", checkpoint_id)) {
                tokio::fs::remove_file(entry.path())
                    .await
                    .map_err(|e| format!("Failed to delete checkpoint file: {}", e))?;

                // Remove from cache
                let mut cache = self.metadata_cache.write().await;
                cache.retain(|c| c.id != checkpoint_id);

                println!("[CheckpointManager] Deleted checkpoint {}", checkpoint_id);
                return Ok(());
            }
        }

        Err(format!("Checkpoint not found: {}", checkpoint_id))
    }

    /// Generate a unique checkpoint ID
    fn generate_checkpoint_id(&self) -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        format!("ckpt_{}", timestamp)
    }

    /// Read session messages from database
    async fn read_session_messages(&self, session_id: &str) -> Result<Vec<serde_json::Value>, String> {
        println!("[CheckpointManager] Reading messages for session: {}", session_id);
        
        // Use the query_db pattern from sessions.rs
        let sql = "SELECT role, content, timestamp, tool_calls, reasoning FROM messages WHERE session_id = ? ORDER BY timestamp ASC";
        let params = vec![serde_json::json!(session_id)];
        
        let messages = tokio::task::spawn_blocking(move || {
            Self::query_db(sql, &params)
        })
        .await
        .map_err(|e| format!("Failed to spawn database query: {}", e))??;
        
        println!("[CheckpointManager] Read {} messages for session: {}", messages.len(), session_id);
        Ok(messages)
    }

    /// Restore messages to database
    async fn restore_messages_to_db(
        &self,
        session_id: &str,
        messages: &[serde_json::Value],
    ) -> Result<(), String> {
        println!(
            "[CheckpointManager] Restoring {} messages to session: {}",
            messages.len(),
            session_id
        );
        
        // First, delete existing messages
        let delete_sql = "DELETE FROM messages WHERE session_id = ?";
        let delete_params = vec![serde_json::json!(session_id)];
        
        let session_id_clone = session_id.to_string();
        tokio::task::spawn_blocking(move || {
            Self::exec_db(delete_sql, &delete_params)
        })
        .await
        .map_err(|e| format!("Failed to spawn delete query: {}", e))??;
        
        // Then, insert checkpoint messages
        let insert_sql = "INSERT INTO messages (session_id, role, content, timestamp, tool_calls, reasoning) VALUES (?, ?, ?, ?, ?, ?)";
        
        for message in messages {
            let role = message.get("role").and_then(|v| v.as_str()).unwrap_or("user");
            let content = message.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let timestamp = message.get("timestamp").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let tool_calls = message.get("tool_calls")
                .map(|v| serde_json::to_string(v).unwrap_or_default())
                .unwrap_or_default();
            let reasoning = message.get("reasoning")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            
            let params = vec![
                serde_json::json!(session_id_clone),
                serde_json::json!(role),
                serde_json::json!(content),
                serde_json::json!(timestamp),
                serde_json::json!(tool_calls),
                serde_json::json!(reasoning),
            ];
            
            let insert_sql_clone = insert_sql.to_string();
            tokio::task::spawn_blocking(move || {
                Self::exec_db(&insert_sql_clone, &params)
            })
            .await
            .map_err(|e| format!("Failed to spawn insert query: {}", e))??;
        }
        
        println!("[CheckpointManager] Restored {} messages to session: {}", messages.len(), session_id);
        Ok(())
    }
    
    /// Query SQLite database via WSL Python with parameterized queries
    fn query_db(sql: &str, params: &[serde_json::Value]) -> Result<Vec<serde_json::Value>, String> {
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        
        let params_json = serde_json::to_string(params)
            .map_err(|e| format!("Failed to serialize params: {}", e))?;
        let params_b64 = STANDARD.encode(params_json);
        let sql_b64 = STANDARD.encode(sql);

        let script = format!(
            r#"
import sqlite3, json, os, base64
conn = sqlite3.connect(os.path.expanduser("~/.hermes/state.db"))
conn.row_factory = sqlite3.Row
cursor = conn.cursor()
sql = base64.b64decode("{}").decode()
params = json.loads(base64.b64decode("{}").decode())
cursor.execute(sql, params)
rows = cursor.fetchall()
result = [dict(row) for row in rows]
print(json.dumps(result))
conn.close()
"#,
            sql_b64, params_b64
        );

        let output = Self::run_python_script(&script)?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Database query failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let trimmed = stdout.trim();

        if trimmed.is_empty() || trimmed == "[]" {
            return Ok(vec![]);
        }

        serde_json::from_str(trimmed).map_err(|e| format!("Failed to parse JSON: {}", e))
    }

    /// Execute SQL via WSL Python with parameterized queries (no rows returned)
    fn exec_db(sql: &str, params: &[serde_json::Value]) -> Result<(), String> {
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        
        let params_json = serde_json::to_string(params)
            .map_err(|e| format!("Failed to serialize params: {}", e))?;
        let params_b64 = STANDARD.encode(params_json);
        let sql_b64 = STANDARD.encode(sql);

        let script = format!(
            r#"
import sqlite3, json, os, base64
conn = sqlite3.connect(os.path.expanduser("~/.hermes/state.db"))
cursor = conn.cursor()
sql = base64.b64decode("{}").decode()
params = json.loads(base64.b64decode("{}").decode())
cursor.execute(sql, params)
conn.commit()
conn.close()
print("ok")
"#,
            sql_b64, params_b64
        );

        let output = Self::run_python_script(&script)?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Database exec failed: {}", stderr));
        }
        Ok(())
    }
    
    /// Run a Python script via WSL
    fn run_python_script(script: &str) -> Result<std::process::Output, String> {
        std::process::Command::new("wsl")
            .arg("python3")
            .arg("-c")
            .arg(script)
            .output()
            .map_err(|e| format!("Failed to execute Python script: {}", e))
    }
}
