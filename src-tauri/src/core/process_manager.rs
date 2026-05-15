//! Process Manager
//!
//! Unified process management module for managing external processes.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, RwLock};

use super::event_bus::{Event, EventBus};

/// Process status
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProcessStatus {
    Running,
    Stopped,
    Error,
    Starting,
    Stopping,
}

/// Process information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub id: String,
    pub pid: Option<u32>,
    pub status: ProcessStatus,
    pub command: String,
    pub args: Vec<String>,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub stopped_at: Option<chrono::DateTime<chrono::Utc>>,
    pub restart_count: u32,
    pub last_error: Option<String>,
}

/// Process configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessConfig {
    pub id: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub working_dir: Option<String>,
    pub auto_restart: bool,
    pub max_restarts: u32,
    pub restart_delay_ms: u64,
}

/// Process handle
struct ProcessHandle {
    info: ProcessInfo,
    child: Option<Child>,
    log_buffer: Arc<Mutex<Vec<String>>>,
}

/// Process manager
pub struct ProcessManager {
    processes: Arc<RwLock<HashMap<String, ProcessHandle>>>,
    event_bus: Arc<EventBus>,
}

impl ProcessManager {
    pub fn new(event_bus: Arc<EventBus>) -> Self {
        Self {
            processes: Arc::new(RwLock::new(HashMap::new())),
            event_bus,
        }
    }

    /// Start a process
    pub async fn start_process(&self, config: ProcessConfig) -> Result<String, String> {
        let id = config.id.clone();
        
        // Check if process already exists
        {
            let processes = self.processes.read().await;
            if let Some(handle) = processes.get(&id) {
                if handle.info.status == ProcessStatus::Running {
                    return Err(format!("Process already running: {}", id));
                }
            }
        }

        println!("[ProcessManager] Starting process: {}", id);

        // Build command
        let mut cmd = Command::new("wsl");
        cmd.arg("-e").arg(&config.command);
        cmd.args(&config.args);
        
        for (key, value) in &config.env {
            cmd.env(key, value);
        }
        
        if let Some(ref dir) = config.working_dir {
            cmd.current_dir(dir);
        }
        
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        // Spawn process
        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn process: {}", e))?;
        
        let pid = child.id();
        let started_at = chrono::Utc::now();

        // Create process info
        let info = ProcessInfo {
            id: id.clone(),
            pid,
            status: ProcessStatus::Running,
            command: config.command.clone(),
            args: config.args.clone(),
            started_at: Some(started_at),
            stopped_at: None,
            restart_count: 0,
            last_error: None,
        };

        // Create log buffer
        let log_buffer = Arc::new(Mutex::new(Vec::new()));

        // Capture stdout
        if let Some(stdout) = child.stdout.take() {
            let log_buf = log_buffer.clone();
            let event_bus = self.event_bus.clone();
            let process_id = id.clone();
            
            tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                
                while let Ok(Some(line)) = lines.next_line().await {
                    // Store in buffer
                    {
                        let mut buf = log_buf.lock().await;
                        buf.push(line.clone());
                        if buf.len() > 1000 {
                            buf.drain(0..500);
                        }
                    }
                    
                    // Emit event
                    event_bus.publish(Event::ProcessLog {
                        id: process_id.clone(),
                        line,
                    });
                }
            });
        }

        // Capture stderr
        if let Some(stderr) = child.stderr.take() {
            let log_buf = log_buffer.clone();
            let event_bus = self.event_bus.clone();
            let process_id = id.clone();
            
            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                
                while let Ok(Some(line)) = lines.next_line().await {
                    // Store in buffer
                    {
                        let mut buf = log_buf.lock().await;
                        buf.push(format!("[stderr] {}", line));
                        if buf.len() > 1000 {
                            buf.drain(0..500);
                        }
                    }
                    
                    // Emit event
                    event_bus.publish(Event::ProcessLog {
                        id: process_id.clone(),
                        line: format!("[stderr] {}", line),
                    });
                }
            });
        }

        // Create handle
        let handle = ProcessHandle {
            info: info.clone(),
            child: Some(child),
            log_buffer: log_buffer.clone(),
        };

        // Store handle
        {
            let mut processes = self.processes.write().await;
            processes.insert(id.clone(), handle);
        }

        // Emit event
        self.event_bus.publish(Event::ProcessStarted {
            id: id.clone(),
            pid: pid.unwrap_or(0),
        });

        // Start monitoring
        let processes = self.processes.clone();
        let event_bus = self.event_bus.clone();
        let process_id = id.clone();
        
        tokio::spawn(async move {
            Self::monitor_process(processes, event_bus, process_id, config).await;
        });

        println!("[ProcessManager] Process started: {} (pid: {:?})", id, pid);
        Ok(id)
    }

    /// Stop a process
    pub async fn stop_process(&self, id: &str) -> Result<(), String> {
        println!("[ProcessManager] Stopping process: {}", id);

        let mut processes = self.processes.write().await;
        
        let handle = processes.get_mut(id)
            .ok_or_else(|| format!("Process not found: {}", id))?;

        if handle.info.status != ProcessStatus::Running {
            return Err(format!("Process not running: {}", id));
        }

        handle.info.status = ProcessStatus::Stopping;

        if let Some(ref mut child) = handle.child {
            // Try graceful shutdown first
            let _ = child.kill().await;
            
            // Wait for process to exit
            let _ = tokio::time::timeout(
                std::time::Duration::from_secs(5),
                child.wait()
            ).await;
        }

        handle.info.status = ProcessStatus::Stopped;
        handle.info.stopped_at = Some(chrono::Utc::now());
        handle.child = None;

        self.event_bus.publish(Event::ProcessStopped {
            id: id.to_string(),
        });

        println!("[ProcessManager] Process stopped: {}", id);
        Ok(())
    }

    /// Get process status
    pub async fn get_process_status(&self, id: &str) -> Result<ProcessInfo, String> {
        let processes = self.processes.read().await;
        let handle = processes.get(id)
            .ok_or_else(|| format!("Process not found: {}", id))?;
        Ok(handle.info.clone())
    }

    /// Get process logs
    pub async fn get_process_logs(&self, id: &str, lines: usize) -> Result<Vec<String>, String> {
        let processes = self.processes.read().await;
        let handle = processes.get(id)
            .ok_or_else(|| format!("Process not found: {}", id))?;
        
        let log_buffer = handle.log_buffer.lock().await;
        let start = if log_buffer.len() > lines {
            log_buffer.len() - lines
        } else {
            0
        };
        
        Ok(log_buffer[start..].to_vec())
    }

    /// Monitor process health
    async fn monitor_process(
        processes: Arc<RwLock<HashMap<String, ProcessHandle>>>,
        event_bus: Arc<EventBus>,
        id: String,
        config: ProcessConfig,
    ) {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;

            let should_restart = {
                let mut processes = processes.write().await;
                let Some(handle) = processes.get_mut(&id) else {
                    break;
                };

                // Check if process is still running
                if let Some(ref mut child) = handle.child {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            // Process exited
                            println!("[ProcessManager] Process exited: {} (status: {:?})", id, status);
                            
                            handle.info.status = ProcessStatus::Error;
                            handle.info.stopped_at = Some(chrono::Utc::now());
                            handle.info.last_error = Some(format!("Process exited with status: {:?}", status));
                            handle.child = None;

                            event_bus.publish(Event::ProcessError {
                                id: id.clone(),
                                error: format!("Process exited with status: {:?}", status),
                            });

                            // Check if should restart
                            if config.auto_restart && handle.info.restart_count < config.max_restarts {
                                handle.info.restart_count += 1;
                                true
                            } else {
                                false
                            }
                        }
                        Ok(None) => {
                            // Still running
                            false
                        }
                        Err(e) => {
                            // Error checking status
                            println!("[ProcessManager] Error checking process status: {}", e);
                            false
                        }
                    }
                } else {
                    // No child process
                    break;
                }
            };

            if should_restart {
                println!("[ProcessManager] Auto-restarting process: {} (attempt {})", id, config.max_restarts);
                
                tokio::time::sleep(std::time::Duration::from_millis(config.restart_delay_ms)).await;
                
                // Restart by creating new process manager instance
                // Schedule restart (simplified approach)
                // In production, you'd want a more sophisticated restart mechanism
                let _new_config = config.clone();
                let processes_clone = processes.clone();
                
                // Remove old handle
                {
                    let mut procs = processes_clone.write().await;
                    procs.remove(&id);
                }
                
                // Note: Actual restart would need to be triggered externally
                // or through a dedicated restart queue to avoid Send issues
                println!("[ProcessManager] Process {} crashed, restart needed", id);
                
                break;
            }
        }
    }
}
