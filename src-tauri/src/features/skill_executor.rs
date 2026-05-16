//! Skills Executor
//!
//! Manages direct execution of Hermes Agent skills from the UI.

use crate::core::event_bus::{Event, EventBus};
use crate::core::hermes_cli::HermesCli;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Skill execution record
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillExecution {
    pub id: String,
    pub skill_name: String,
    pub args: Vec<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

/// Skills executor
pub struct SkillExecutor {
    hermes_cli: Arc<HermesCli>,
    event_bus: Arc<EventBus>,
    execution_history: Arc<RwLock<Vec<SkillExecution>>>,
}

impl SkillExecutor {
    /// Create a new SkillExecutor
    pub fn new(hermes_cli: Arc<HermesCli>, event_bus: Arc<EventBus>) -> Self {
        Self {
            hermes_cli,
            event_bus,
            execution_history: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Execute a skill with arguments (`dry_run` maps to `hermes skills run ... --dry-run`).
    pub async fn execute_skill(
        &self,
        skill_name: &str,
        args: &[&str],
        dry_run: bool,
    ) -> Result<SkillExecution, String> {
        println!(
            "[SkillExecutor] {} skill: {} with args: {:?}",
            if dry_run { "Dry-run" } else { "Executing" },
            skill_name,
            args
        );

        // Generate execution ID
        let execution_id = self.generate_execution_id();
        let started_at = chrono::Utc::now().to_rfc3339();

        // Emit start event
        self.event_bus.publish(Event::SkillExecutionStarted {
            name: skill_name.to_string(),
        });

        // Build command arguments: hermes skills run <skill_name> [--dry-run] [args]
        let mut cmd_args: Vec<String> = vec![
            "skills".into(),
            "run".into(),
            skill_name.to_string(),
        ];
        if dry_run {
            cmd_args.push("--dry-run".into());
        }
        cmd_args.extend(args.iter().map(|s| (*s).to_string()));
        let cmd_refs: Vec<&str> = cmd_args.iter().map(|s| s.as_str()).collect();

        // Execute via HermesCli
        let result = self.hermes_cli.execute(&cmd_refs).await;

        let completed_at = chrono::Utc::now().to_rfc3339();

        let execution = match result {
            Ok(cli_result) => {
                let success = cli_result.success;
                let output = if !cli_result.stdout.is_empty() {
                    cli_result.stdout
                } else {
                    cli_result.stderr.clone()
                };
                let error = if !success && !cli_result.stderr.is_empty() {
                    Some(cli_result.stderr)
                } else {
                    None
                };

                // Emit completion event
                if success {
                    self.event_bus.publish(Event::SkillExecutionCompleted {
                        name: skill_name.to_string(),
                    });
                } else {
                    self.event_bus.publish(Event::SkillExecutionFailed {
                        name: skill_name.to_string(),
                        error: error.clone().unwrap_or_else(|| "Unknown error".to_string()),
                    });
                }

                SkillExecution {
                    id: execution_id.clone(),
                    skill_name: skill_name.to_string(),
                    args: args.iter().map(|s| s.to_string()).collect(),
                    started_at: started_at.clone(),
                    completed_at: Some(completed_at),
                    success,
                    output,
                    error,
                }
            }
            Err(e) => {
                let error_msg = e.to_user_message();
                // Emit failure event
                self.event_bus.publish(Event::SkillExecutionFailed {
                    name: skill_name.to_string(),
                    error: error_msg.clone(),
                });

                SkillExecution {
                    id: execution_id.clone(),
                    skill_name: skill_name.to_string(),
                    args: args.iter().map(|s| s.to_string()).collect(),
                    started_at: started_at.clone(),
                    completed_at: Some(completed_at),
                    success: false,
                    output: String::new(),
                    error: Some(error_msg),
                }
            }
        };

        // Store in history
        {
            let mut history = self.execution_history.write().await;
            history.push(execution.clone());
            
            // Keep only last 100 executions
            let len = history.len();
            if len > 100 {
                history.drain(0..len - 100);
            }
        }

        if execution.success {
            Ok(execution)
        } else {
            Err(execution.error.unwrap_or_else(|| "Skill execution failed".to_string()))
        }
    }

    /// Get execution history
    pub async fn get_execution_history(&self, limit: usize) -> Vec<SkillExecution> {
        let history = self.execution_history.read().await;
        let start = if history.len() > limit {
            history.len() - limit
        } else {
            0
        };
        history[start..].to_vec()
    }

    /// Generate a unique execution ID
    fn generate_execution_id(&self) -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        format!("exec_{}", timestamp)
    }
}
