use serde::{Deserialize, Serialize};

use super::{paths::HermesPaths, runtime::HermesRuntime};
use crate::commands::utils::{quote_shell_arg, run_shell_command};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesCapabilityStatus {
    pub available: bool,
    pub detection_method: String,
    pub reason: Option<String>,
    pub checked_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesCapabilities {
    pub has_chat: bool,
    pub has_sessions: bool,
    pub has_skills: bool,
    pub has_memories: bool,
    pub has_mcp: bool,
    pub has_cron: bool,
    pub has_platforms: bool,
    pub chat: HermesCapabilityStatus,
    pub sessions: HermesCapabilityStatus,
    pub skills: HermesCapabilityStatus,
    pub memories: HermesCapabilityStatus,
    pub mcp: HermesCapabilityStatus,
    pub cron: HermesCapabilityStatus,
    pub platforms: HermesCapabilityStatus,
}

fn shell_check_success(command: &str) -> bool {
    run_shell_command(command)
        .ok()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn path_exists(path: &str, test_flag: &str) -> bool {
    shell_check_success(&format!(
        "test {test_flag} {}",
        quote_shell_arg(path)
    ))
}

fn directory_accessible(path: &str) -> bool {
    shell_check_success(&format!(
        "test -d {} && test -r {}",
        quote_shell_arg(path),
        quote_shell_arg(path)
    ))
}

fn writable_directory(path: &str) -> bool {
    shell_check_success(&format!(
        "test -d {} && test -r {} && test -w {}",
        quote_shell_arg(path),
        quote_shell_arg(path),
        quote_shell_arg(path)
    ))
}

fn readable_file(path: &str) -> bool {
    shell_check_success(&format!(
        "test -f {} && test -r {}",
        quote_shell_arg(path),
        quote_shell_arg(path)
    ))
}

fn check_sqlite_readable(path: &str, runtime: &HermesRuntime) -> bool {
    let python_cmd = runtime.python_path.as_deref().unwrap_or("python3");
    shell_check_success(&format!(
        "{} -c \"import os, sqlite3; conn = sqlite3.connect(os.path.expanduser({:?})); conn.execute('SELECT 1'); conn.close()\" >/dev/null 2>&1",
        quote_shell_arg(python_cmd),
        path
    ))
}

fn capability_status(
    available: bool,
    detection_method: &str,
    reason: Option<String>,
    checked_paths: Vec<String>,
) -> HermesCapabilityStatus {
    HermesCapabilityStatus {
        available,
        detection_method: detection_method.to_string(),
        reason,
        checked_paths,
    }
}

fn detect_chat(runtime: &HermesRuntime, paths: &HermesPaths) -> HermesCapabilityStatus {
    let has_python = runtime.python_path.is_some();
    let has_cli = runtime.cli_command.is_some();
    let available = has_python || has_cli;
    let mut checked_paths = vec![
        paths.approvals_dir.clone(),
        paths.clarify_dir.clone(),
        paths.secrets_dir.clone(),
    ];
    if let Some(path) = &runtime.python_path {
        checked_paths.push(path.clone());
    }
    if let Some(command) = &runtime.cli_command {
        checked_paths.push(command.clone());
    }

    capability_status(
        available,
        if has_cli {
            "cli-runtime"
        } else {
            "python-runtime"
        },
        if available {
            None
        } else {
            Some("Hermes CLI and Python runtime are both unavailable".to_string())
        },
        checked_paths,
    )
}

fn detect_sessions(paths: &HermesPaths, runtime: &HermesRuntime) -> HermesCapabilityStatus {
    let db_exists = path_exists(&paths.state_db, "-f");
    let db_readable = readable_file(&paths.state_db);
    let sqlite_readable = db_exists && db_readable && check_sqlite_readable(&paths.state_db, runtime);
    let available = sqlite_readable || (db_exists && db_readable);

    capability_status(
        available,
        if sqlite_readable {
            "sqlite-probe"
        } else {
            "file-readability"
        },
        if available {
            None
        } else {
            Some("Hermes session database is missing or cannot be read".to_string())
        },
        vec![paths.state_db.clone()],
    )
}

fn detect_directory_capability(
    path: &str,
    name: &str,
    require_write: bool,
) -> HermesCapabilityStatus {
    let available = if require_write {
        writable_directory(path)
    } else {
        directory_accessible(path)
    };

    capability_status(
        available,
        if require_write {
            "directory-read-write"
        } else {
            "directory-readability"
        },
        if available {
            None
        } else {
            Some(format!("Hermes {name} directory is missing or inaccessible"))
        },
        vec![path.to_string()],
    )
}

fn detect_config_capability(path: &str, name: &str) -> HermesCapabilityStatus {
    let available = readable_file(path);

    capability_status(
        available,
        "config-readability",
        if available {
            None
        } else {
            Some(format!("Hermes config required for {name} is missing or unreadable"))
        },
        vec![path.to_string()],
    )
}

pub fn detect_capabilities(paths: &HermesPaths, runtime: &HermesRuntime) -> HermesCapabilities {
    let chat = detect_chat(runtime, paths);
    let sessions = detect_sessions(paths, runtime);
    let skills = detect_directory_capability(&paths.skills_dir, "skills", true);
    let memories = detect_directory_capability(&paths.memories_dir, "memories", true);
    let mcp = detect_config_capability(&paths.config_yaml, "MCP");
    let cron = detect_directory_capability(&paths.cron_dir, "cron jobs", true);
    let platforms = detect_config_capability(&paths.config_yaml, "platforms");

    HermesCapabilities {
        has_chat: chat.available,
        has_sessions: sessions.available,
        has_skills: skills.available,
        has_memories: memories.available,
        has_mcp: mcp.available,
        has_cron: cron.available,
        has_platforms: platforms.available,
        chat,
        sessions,
        skills,
        memories,
        mcp,
        cron,
        platforms,
    }
}
