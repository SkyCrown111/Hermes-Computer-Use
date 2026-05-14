//! Hermes Agent Data Commands
//!
//! This module provides Tauri commands for interacting with Hermes Agent data,
//! including configuration, sessions, skills, and scheduled tasks.

pub mod chat;
pub mod config;
pub mod cron_jobs;
pub mod files;
pub mod kanban;
pub mod mcp;
pub mod memories;
pub mod monitor;
pub mod platforms;
pub mod sessions;
pub mod skills;
pub mod system;
pub mod tools;
pub mod utils;

// Re-export all commands for easy registration
pub use chat::*;
pub use config::*;
pub use cron_jobs::*;
pub use files::*;
pub use kanban::*;
pub use mcp::*;
pub use memories::*;
pub use monitor::*;
pub use platforms::*;
pub use sessions::*;
pub use skills::*;
pub use system::*;
pub use tools::*;

