//! Event Bus
//!
//! Event system for module communication and frontend event pushing.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::broadcast;

/// Event types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum Event {
    ProcessStarted { id: String, pid: u32 },
    ProcessStopped { id: String },
    ProcessError { id: String, error: String },
    ProcessLog { id: String, line: String },
    
    McpServerConnected { name: String },
    McpServerDisconnected { name: String },
    McpServerError { name: String, error: String },
    
    GatewayStarted,
    GatewayStopped,
    GatewayError { error: String },
    
    CheckpointCreated { id: String },
    CheckpointRestored { id: String },
    
    SkillExecutionStarted { name: String },
    SkillExecutionCompleted { name: String },
    SkillExecutionFailed { name: String, error: String },
    
    LogEntry { timestamp: String, level: String, message: String },
}

/// Event bus
pub struct EventBus {
    app_handle: AppHandle,
    sender: broadcast::Sender<Event>,
}

impl EventBus {
    pub fn new(app_handle: AppHandle) -> Self {
        let (sender, _) = broadcast::channel(1000);
        Self { app_handle, sender }
    }

    /// Publish an event
    pub fn publish(&self, event: Event) {
        // Send to internal subscribers
        let _ = self.sender.send(event.clone());
        
        // Push to frontend
        let event_name = match &event {
            Event::ProcessStarted { .. } => "process:started",
            Event::ProcessStopped { .. } => "process:stopped",
            Event::ProcessError { .. } => "process:error",
            Event::ProcessLog { .. } => "process:log",
            Event::McpServerConnected { .. } => "mcp:connected",
            Event::McpServerDisconnected { .. } => "mcp:disconnected",
            Event::McpServerError { .. } => "mcp:error",
            Event::GatewayStarted => "gateway:started",
            Event::GatewayStopped => "gateway:stopped",
            Event::GatewayError { .. } => "gateway:error",
            Event::CheckpointCreated { .. } => "checkpoint:created",
            Event::CheckpointRestored { .. } => "checkpoint:restored",
            Event::SkillExecutionStarted { .. } => "skill:started",
            Event::SkillExecutionCompleted { .. } => "skill:completed",
            Event::SkillExecutionFailed { .. } => "skill:failed",
            Event::LogEntry { .. } => "log:entry",
        };
        
        let _ = self.app_handle.emit(event_name, &event);
    }

    /// Subscribe to events
    pub fn subscribe(&self) -> broadcast::Receiver<Event> {
        self.sender.subscribe()
    }
}
