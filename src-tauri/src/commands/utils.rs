//! Utility functions for WSL interaction

use std::path::PathBuf;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Get Hermes data directory path in WSL
pub fn get_hermes_data_dir() -> PathBuf {
    PathBuf::from("~/.hermes")
}

/// Create a command with no console window on Windows
#[cfg(windows)]
pub fn create_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[cfg(not(windows))]
pub fn create_command(program: &str) -> Command {
    Command::new(program)
}

/// Execute a WSL command and return output
pub fn wsl_exec(script: &str) -> Option<String> {
    create_command("wsl")
        .args(["bash", "-c", script])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
}
