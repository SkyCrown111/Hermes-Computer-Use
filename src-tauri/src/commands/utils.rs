//! Cross-platform utility functions for Hermes Agent interaction
//!
//! On Windows, commands are executed through WSL (Windows Subsystem for Linux).
//! On Linux/macOS, commands are executed directly via bash/python3.

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ── Platform detection ──────────────────────────────────────────────

/// Returns true when the host OS is Windows and WSL is required.
#[inline]
pub fn needs_wsl() -> bool {
    cfg!(target_os = "windows")
}

// ── Low-level command builder ───────────────────────────────────────

/// Create a raw `Command` with no console window on Windows.
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

// ── Cross-platform shell helpers ────────────────────────────────────

/// Run a bash/shell command and return its output.
/// - Windows: executes through `wsl bash -c <cmd>`
/// - Linux/macOS: executes through `bash -c <cmd>`
pub fn run_shell_command(cmd: &str) -> Result<Output, String> {
    if needs_wsl() {
        create_command("wsl")
            .args(["bash", "-c", cmd])
            .output()
            .map_err(|e| format!("Failed to execute WSL command: {}", e))
    } else {
        create_command("bash")
            .args(["-c", cmd])
            .output()
            .map_err(|e| format!("Failed to execute shell command: {}", e))
    }
}

/// Run a shell command with the `-e` flag (exit on first error).
pub fn run_shell_command_strict(cmd: &str) -> Result<Output, String> {
    if needs_wsl() {
        create_command("wsl")
            .args(["-e", "bash", "-c", cmd])
            .output()
            .map_err(|e| format!("Failed to execute WSL command: {}", e))
    } else {
        create_command("bash")
            .args(["-e", "-c", cmd])
            .output()
            .map_err(|e| format!("Failed to execute shell command: {}", e))
    }
}

/// Spawn a shell command with piped stdin (for streaming / large input).
/// Returns the `Child` process so the caller can write to stdin and read stdout.
pub fn spawn_shell_command(cmd: &str) -> Result<std::process::Child, String> {
    if needs_wsl() {
        create_command("wsl")
            .args(["bash", "-c", cmd])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn WSL command: {}", e))
    } else {
        create_command("bash")
            .args(["-c", cmd])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn shell command: {}", e))
    }
}

/// Run a Python script (inline via `-c`).
/// - Windows: `wsl python3 -c <script>`
/// - Linux/macOS: `python3 -c <script>`
pub fn run_python_script(script: &str) -> Result<Output, String> {
    if needs_wsl() {
        create_command("wsl")
            .args(["python3", "-c", script])
            .output()
            .map_err(|e| format!("Failed to execute WSL Python: {}", e))
    } else {
        create_command("python3")
            .args(["-c", script])
            .output()
            .map_err(|e| format!("Failed to execute Python: {}", e))
    }
}

/// Read a file's content through the platform shell.
/// Returns `Some(content)` on success, `None` on failure.
pub fn read_file_via_shell(path: &str) -> Option<String> {
    let output = run_shell_command(&format!("cat {}", quote_shell_arg(path))).ok()?;
    if output.status.success() && !output.stdout.is_empty() {
        Some(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        None
    }
}

/// Run a raw `wsl <args...>` command (Windows) or translate to native equivalent.
/// Use this when the command is NOT a simple `bash -c` pattern, e.g. `wsl cat /proc/meminfo`.
pub fn run_wsl_args(args: &[&str]) -> Result<Output, String> {
    if needs_wsl() {
        let mut cmd = create_command("wsl");
        cmd.args(args);
        cmd.output()
            .map_err(|e| format!("Failed to execute WSL command: {}", e))
    } else {
        // On non-Windows, the first arg is typically the program (cat, ls, etc.)
        if args.is_empty() {
            return Err("No command specified".to_string());
        }
        let mut cmd = create_command(args[0]);
        if args.len() > 1 {
            cmd.args(&args[1..]);
        }
        cmd.output()
            .map_err(|e| format!("Failed to execute command: {}", e))
    }
}

// ── Path helpers ────────────────────────────────────────────────────

/// Get Hermes data directory path.
/// Returns `~/.hermes` (works on all platforms since it's used inside the shell).
pub fn get_hermes_data_dir() -> PathBuf {
    // On all platforms, ~/.hermes is expanded by the shell.
    // For direct Windows filesystem access, resolve to the actual home.
    if needs_wsl() {
        PathBuf::from("~/.hermes")
    } else {
        dirs::home_dir()
            .map(|h| h.join(".hermes"))
            .unwrap_or_else(|| PathBuf::from("~/.hermes"))
    }
}

// ── Shell quoting ───────────────────────────────────────────────────

/// Safely quote a value for shell use (single-quote escaping).
pub fn quote_shell_arg(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
