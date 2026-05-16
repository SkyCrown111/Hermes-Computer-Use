//! File path allowlist policy for IPC file operations.
//!
//! Paths must fall under ~/.hermes, user home (~), or configured workspace roots.

use super::utils::create_command;
use serde_yaml::Value;

/// Default allowlist: Hermes data dir only. User workspaces come from config.
const DEFAULT_ROOTS: &[&str] = &["~/.hermes"];

/// Absolute prefixes never allowed (WSL can expose full Windows disks via /mnt).
const DENIED_PATH_PREFIXES: &[&str] = &["/mnt", "/proc", "/sys", "/dev"];

/// Collect allowed directory roots from defaults + Hermes config.
pub fn allowed_file_roots() -> Vec<String> {
    let mut roots: Vec<String> = DEFAULT_ROOTS.iter().map(|s| (*s).to_string()).collect();
    roots.extend(read_workspace_roots_from_config());
    roots.sort();
    roots.dedup();
    roots
}

/// Returns true when `path` is exactly `root` or a child of `root`.
pub fn path_under_root(path: &str, root: &str) -> bool {
    let p = path.trim_end_matches('/');
    let r = root.trim_end_matches('/');
    if p.is_empty() || r.is_empty() {
        return false;
    }
    if p == r {
        return true;
    }
    p.starts_with(&format!("{}/", r))
}

/// Check path against configured allowlist (after basic normalization).
pub fn is_path_in_allowed_roots(path: &str, roots: &[String]) -> bool {
    roots.iter().any(|root| path_under_root(path, root))
}

/// Block known-dangerous absolute paths before root matching.
pub fn is_denied_path_prefix(path: &str) -> bool {
    let p = path.trim();
    if p.is_empty() {
        return true;
    }
    for prefix in DENIED_PATH_PREFIXES {
        if p == *prefix || p.starts_with(&format!("{}/", prefix)) || p.starts_with(prefix) {
            return true;
        }
    }
    false
}

/// Full path policy check used by file IPC.
pub fn is_path_allowed(path: &str, roots: &[String]) -> bool {
    // Paths under an explicit allowlisted root must be permitted even when they live under
    // a generally blocked prefix like `/mnt/...` (common for WSL workspace roots).
    if is_path_in_allowed_roots(path, roots) {
        return true;
    }
    !is_denied_path_prefix(path) && is_path_in_allowed_roots(path, roots)
}

fn read_workspace_roots_from_config() -> Vec<String> {
    let yaml = match read_config_yaml_text() {
        Some(y) => y,
        None => return Vec::new(),
    };

    let Ok(value) = serde_yaml::from_str::<Value>(&yaml) else {
        return Vec::new();
    };

    let mut roots = Vec::new();

    if let Some(seq) = value.get("active_workspace_roots").and_then(|v| v.as_sequence()) {
        for item in seq {
            if let Some(s) = item.as_str() {
                let trimmed = s.trim();
                if !trimmed.is_empty() {
                    roots.push(trimmed.to_string());
                }
            }
        }
    }

    if let Some(cwd) = value
        .get("terminal")
        .and_then(|t| t.get("cwd"))
        .and_then(|c| c.as_str())
    {
        let trimmed = cwd.trim();
        if !trimmed.is_empty() {
            roots.push(trimmed.to_string());
        }
    }

    if let Some(cwd) = value
        .get("agent")
        .and_then(|a| a.get("cwd"))
        .and_then(|c| c.as_str())
    {
        let trimmed = cwd.trim();
        if !trimmed.is_empty() && !roots.iter().any(|r| r == trimmed) {
            roots.push(trimmed.to_string());
        }
    }

    roots
}

fn read_config_yaml_text() -> Option<String> {
    if let Ok(output) = create_command("wsl")
        .args(["bash", "-c", "cat ~/.hermes/config.yaml 2>/dev/null"])
        .output()
    {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !text.is_empty() {
                return Some(text);
            }
        }
    }

    if let Ok(home) = std::env::var("USERPROFILE") {
        let path = std::path::PathBuf::from(home)
            .join(".hermes")
            .join("config.yaml");
        if let Ok(text) = std::fs::read_to_string(&path) {
            if !text.trim().is_empty() {
                return Some(text);
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_under_root_matches_children() {
        assert!(path_under_root("~/.hermes/config.yaml", "~/.hermes"));
        assert!(!path_under_root("~/Documents", "~/.hermes"));
        assert!(!path_under_root("/mnt/c", "~/.hermes"));
    }

    #[test]
    fn default_roots_include_hermes_only() {
        let roots = allowed_file_roots();
        assert!(roots.iter().any(|r| r == "~/.hermes"));
        assert!(!roots.iter().any(|r| r == "~"));
    }

    #[test]
    fn denies_mnt_and_proc() {
        assert!(is_denied_path_prefix("/mnt/c"));
        assert!(is_denied_path_prefix("/mnt/c/Users"));
        assert!(is_denied_path_prefix("/proc/self"));
    }

    #[test]
    fn is_path_allowed_respects_workspace() {
        let roots = vec!["~/.hermes".to_string(), "/home/dev/project".to_string()];
        assert!(is_path_allowed("~/.hermes/config.yaml", &roots));
        assert!(is_path_allowed("/home/dev/project/src/main.rs", &roots));
        assert!(!is_path_allowed("/mnt/c", &roots));
        assert!(!is_path_allowed("~/random", &roots));
    }

    #[test]
    fn is_path_allowed_allows_explicit_mnt_workspace_root() {
        let roots = vec!["~/.hermes".to_string(), "/mnt/d/Aiagent/Hermes".to_string()];
        assert!(is_path_allowed("/mnt/d/Aiagent/Hermes", &roots));
        assert!(is_path_allowed("/mnt/d/Aiagent/Hermes/console/foo", &roots));
        assert!(!is_path_allowed("/mnt/d/Other/project", &roots));
    }
}
