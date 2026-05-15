//! Hermes profile commands.
//!
//! Hermes Agent exposes multi-agent configuration through `hermes profile ...`.
//! These commands keep writes on the official CLI path and only read lightweight
//! metadata from profile homes for the desktop list view.

use super::utils::{create_command, needs_wsl, quote_shell_arg, run_shell_command, run_wsl_args};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::process::Stdio;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HermesProfileInfo {
    pub name: String,
    pub is_default: bool,
    pub is_active: bool,
    pub home: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub skills_count: u32,
    pub env_configured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileCommandResponse {
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Clone, Default)]
struct ProfileListEntry {
    name: String,
    is_default: bool,
    is_active: bool,
    model: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct ProfileShowDetails {
    path: Option<String>,
    model: Option<String>,
    provider: Option<String>,
    skills_count: Option<u32>,
    env_configured: Option<bool>,
}

fn command_error(context: &str, stderr: &[u8], stdout: &[u8]) -> String {
    let err = String::from_utf8_lossy(stderr).trim().to_string();
    let out = String::from_utf8_lossy(stdout).trim().to_string();
    if !err.is_empty() {
        format!("{}: {}", context, err)
    } else if !out.is_empty() {
        format!("{}: {}", context, out)
    } else {
        context.to_string()
    }
}

fn run_hermes_profile(args: &[String]) -> Result<String, String> {
    let quoted_args = args
        .iter()
        .map(|arg| quote_shell_arg(arg))
        .collect::<Vec<_>>()
        .join(" ");
    let profile_cmd = format!("hermes profile {}", quoted_args);
    let cmd = format!("bash -lc {}", quote_shell_arg(&profile_cmd));
    let output = run_shell_command(&cmd)?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(command_error("Hermes profile command failed", &output.stderr, &output.stdout))
    }
}

fn parse_profile_list_output(output: &str) -> Vec<(String, bool, bool)> {
    let mut profiles = Vec::new();
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let is_active = trimmed.starts_with('*')
            || trimmed.starts_with('>')
            || trimmed.starts_with('◆')
            || trimmed.starts_with('◇');
        let first_column = trimmed
            .split_whitespace()
            .next()
            .unwrap_or("")
            .trim_matches(|c: char| {
                c == '*'
                    || c == '>'
                    || c == '◆'
                    || c == '◇'
                    || c == '-'
                    || c == ':'
                    || c == '|'
            })
            .to_string();
        let lowered = trimmed.to_lowercase();
        let is_default = first_column == "default"
            || trimmed.contains("(default)")
            || trimmed.contains("[default]")
            || lowered.contains(" default");
        let name = first_column;

        if !name.is_empty()
            && !matches!(
                name.to_lowercase().as_str(),
                "name" | "profiles" | "profile" | "model" | "gateway" | "alias" | "distribution" | "───────────────"
            )
            && name.chars().any(|c| c.is_ascii_alphanumeric())
        {
            profiles.push((name, is_default, is_active));
        }
    }
    profiles
}

fn parse_profile_list_output_v2(output: &str) -> Vec<ProfileListEntry> {
    let mut profiles = Vec::new();
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let columns = trimmed.split_whitespace().collect::<Vec<_>>();
        if columns.len() < 2 {
            continue;
        }

        let raw_name = columns[0];
        let name = raw_name
            .trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '_' && c != '-')
            .to_string();
        let lowered_name = name.to_lowercase();
        if name.is_empty()
            || matches!(
                lowered_name.as_str(),
                "name" | "profiles" | "profile" | "model" | "gateway" | "alias" | "distribution"
            )
            || !name.chars().any(|c| c.is_ascii_alphanumeric())
        {
            continue;
        }

        let model = columns
            .get(1)
            .copied()
            .filter(|value| {
                value.chars().any(|c| c.is_ascii_alphanumeric())
                    && !value.chars().all(|c| c == '-' || c == '─')
            })
            .map(str::to_string);

        profiles.push(ProfileListEntry {
            is_default: lowered_name == "default",
            is_active: raw_name != name,
            name,
            model,
        });
    }
    profiles
}

fn list_profile_dirs() -> Vec<String> {
    let output = run_shell_command(
        "find \"$HOME/.hermes/profiles\" -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' 2>/dev/null",
    )
    .ok();
    output
        .as_ref()
        .filter(|o| o.status.success())
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn read_profile_metadata(name: &str, is_default: bool) -> HermesProfileInfo {
    let shell_home = if is_default {
        "$HOME/.hermes".to_string()
    } else {
        format!("$HOME/.hermes/profiles/{}", name)
    };
    let display_home = if is_default {
        "$HOME/.hermes".to_string()
    } else {
        format!("$HOME/.hermes/profiles/{}", name)
    };
    let script = format!(
        r#"
set -e
HOME_DIR="{shell_home}"
CONFIG="$HOME_DIR/config.yaml"
ENV_FILE="$HOME_DIR/.env"
SKILLS_DIR="$HOME_DIR/skills"
model="$(awk -F': *' '/^[[:space:]]*default:/ {{ print $2; exit }}' "$CONFIG" 2>/dev/null | tr -d '"' || true)"
provider="$(awk -F': *' '/^[[:space:]]*provider:/ {{ print $2; exit }}' "$CONFIG" 2>/dev/null | tr -d '"' || true)"
skills=0
if [ -d "$SKILLS_DIR" ]; then
  skills="$(find "$SKILLS_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')"
fi
env=false
if [ -s "$ENV_FILE" ]; then env=true; fi
printf '%s\n%s\n%s\n%s' "$model" "$provider" "$skills" "$env"
"#
    );

    let output = run_shell_command(&script).ok();
    let lines = output
        .as_ref()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();
    let mut parts = lines.lines();
    let model = parts.next().map(str::trim).filter(|v| !v.is_empty()).map(str::to_string);
    let provider = parts.next().map(str::trim).filter(|v| !v.is_empty()).map(str::to_string);
    let skills_count = parts
        .next()
        .and_then(|v| v.trim().parse::<u32>().ok())
        .unwrap_or(0);
    let env_configured = parts.next().map(str::trim) == Some("true");

    HermesProfileInfo {
        name: name.to_string(),
        is_default,
        is_active: false,
        home: display_home,
        model,
        provider,
        skills_count,
        env_configured,
    }
}

fn profile_home_shell(name: &str) -> String {
    if name == "default" {
        "$HOME/.hermes".to_string()
    } else {
        format!("$HOME/.hermes/profiles/{}", name)
    }
}

fn soul_path_shell(name: &str) -> String {
    format!("{}/SOUL.md", profile_home_shell(name))
}

fn active_profile_name() -> Option<String> {
    let output = run_shell_command("printf '%s' \"${HERMES_PROFILE:-}\"").ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() { None } else { Some(value) }
}

fn parse_profile_show_details(output: &str) -> ProfileShowDetails {
    let mut details = ProfileShowDetails::default();
    for line in output.lines() {
        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix("Path:") {
            details.path = Some(value.trim().to_string());
        } else if let Some(value) = trimmed.strip_prefix("Model:") {
            let value = value.trim();
            if let Some((model, provider_part)) = value.rsplit_once('(') {
                details.model = Some(model.trim().to_string());
                details.provider = Some(provider_part.trim_end_matches(')').trim().to_string());
            } else if !value.is_empty() && value != "-" {
                details.model = Some(value.to_string());
            }
        } else if let Some(value) = trimmed.strip_prefix("Skills:") {
            details.skills_count = value.trim().parse::<u32>().ok();
        } else if let Some(value) = trimmed.strip_prefix(".env:") {
            details.env_configured = Some(matches!(value.trim(), "exists" | "configured" | "yes" | "true"));
        }
    }
    details
}

fn show_profile_details(name: &str) -> Option<ProfileShowDetails> {
    let output = run_hermes_profile(&["show".to_string(), name.to_string()]).ok()?;
    Some(parse_profile_show_details(&output))
}

fn profile_soul_path(name: &str) -> Result<String, String> {
    let details = show_profile_details(name).unwrap_or_default();
    let path = details.path.unwrap_or_else(|| {
        if name == "default" {
            "$HOME/.hermes".to_string()
        } else {
            format!("$HOME/.hermes/profiles/{}", name)
        }
    });
    Ok(format!("{}/SOUL.md", path.trim_end_matches('/')))
}

#[tauri::command]
pub fn list_hermes_profiles() -> Result<Vec<HermesProfileInfo>, String> {
    let list_output = run_hermes_profile(&["list".to_string()]).unwrap_or_default();
    let mut entries = parse_profile_list_output_v2(&list_output);
    let mut names = BTreeSet::new();
    for entry in &entries {
        names.insert(entry.name.clone());
    }
    for name in list_profile_dirs() {
        if names.insert(name.clone()) {
            entries.push(ProfileListEntry {
                name,
                is_default: false,
                is_active: false,
                model: None,
            });
        }
    }
    if names.insert("default".to_string()) {
        entries.insert(
            0,
            ProfileListEntry {
                name: "default".to_string(),
                is_default: true,
                is_active: false,
                model: None,
            },
        );
    }

    let active = active_profile_name();
    let has_active_from_list = entries.iter().any(|entry| entry.is_active);
    let mut profiles = entries
        .into_iter()
        .map(|entry| {
            let is_default = entry.is_default || entry.name == "default";
            let mut profile = read_profile_metadata(&entry.name, is_default);
            if let Some(details) = show_profile_details(&entry.name) {
                if let Some(path) = details.path {
                    profile.home = path;
                }
                if let Some(model) = details.model {
                    profile.model = Some(model);
                }
                if let Some(provider) = details.provider {
                    profile.provider = Some(provider);
                }
                if let Some(skills_count) = details.skills_count {
                    profile.skills_count = skills_count;
                }
                if let Some(env_configured) = details.env_configured {
                    profile.env_configured = env_configured;
                }
            }
            if profile.model.is_none() {
                profile.model = entry.model;
            }
            profile.is_default = is_default;
            profile.is_active = active
                .as_ref()
                .map(|active_name| active_name == &profile.name)
                .unwrap_or(entry.is_active || (!has_active_from_list && profile.is_default));
            profile
        })
        .collect::<Vec<_>>();

    profiles.sort_by(|a, b| {
        b.is_default
            .cmp(&a.is_default)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(profiles)
}

#[tauri::command]
pub fn create_hermes_profile(name: String, clone_default: Option<bool>) -> Result<ProfileCommandResponse, String> {
    validate_profile_name(&name)?;
    let mut args = vec!["create".to_string(), name.clone()];
    if clone_default.unwrap_or(true) {
        args.push("--clone".to_string());
    }
    let output = run_hermes_profile(&args)?;
    Ok(ProfileCommandResponse {
        ok: true,
        message: if output.is_empty() { format!("Profile '{}' created", name) } else { output },
    })
}

#[tauri::command]
pub fn use_hermes_profile(name: String) -> Result<ProfileCommandResponse, String> {
    validate_profile_name(&name)?;
    let output = run_hermes_profile(&["use".to_string(), name.clone()])?;
    Ok(ProfileCommandResponse {
        ok: true,
        message: if output.is_empty() { format!("Profile '{}' selected", name) } else { output },
    })
}

#[tauri::command]
pub fn delete_hermes_profile(name: String) -> Result<ProfileCommandResponse, String> {
    validate_profile_name(&name)?;
    if name == "default" {
        return Err("Default profile cannot be deleted".to_string());
    }
    let output = run_hermes_profile(&["delete".to_string(), name.clone(), "--yes".to_string()])
        .or_else(|_| run_hermes_profile(&["delete".to_string(), name.clone(), "-y".to_string()]))
        .or_else(|_| {
            let delete_cmd = format!("printf 'y\\n' | hermes profile delete {}", quote_shell_arg(&name));
            let cmd = format!("bash -lc {}", quote_shell_arg(&delete_cmd));
            let output = run_shell_command(&cmd)?;
            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                Err(command_error("Hermes profile delete failed", &output.stderr, &output.stdout))
            }
        })?;
    Ok(ProfileCommandResponse {
        ok: true,
        message: if output.is_empty() { format!("Profile '{}' deleted", name) } else { output },
    })
}

#[tauri::command]
pub fn rename_hermes_profile(old_name: String, new_name: String) -> Result<ProfileCommandResponse, String> {
    validate_profile_name(&old_name)?;
    validate_profile_name(&new_name)?;
    if old_name == "default" {
        return Err("Default profile cannot be renamed".to_string());
    }
    let output = run_hermes_profile(&["rename".to_string(), old_name.clone(), new_name.clone()])?;
    Ok(ProfileCommandResponse {
        ok: true,
        message: if output.is_empty() {
            format!("Profile '{}' renamed to '{}'", old_name, new_name)
        } else {
            output
        },
    })
}

#[tauri::command]
pub fn show_hermes_profile(name: String) -> Result<String, String> {
    validate_profile_name(&name)?;
    run_hermes_profile(&["show".to_string(), name])
}

#[tauri::command]
pub fn get_hermes_profile_soul(name: String) -> Result<String, String> {
    validate_profile_name(&name)?;
    let soul_path = profile_soul_path(&name)?;
    let output = run_wsl_args(&["cat", &soul_path])?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(command_error("Failed to read SOUL.md", &output.stderr, &output.stdout))
    }
}

#[tauri::command]
pub fn update_hermes_profile_soul(name: String, content: String) -> Result<ProfileCommandResponse, String> {
    validate_profile_name(&name)?;
    let soul_path = profile_soul_path(&name)?;
    let encoded = BASE64_STANDARD.encode(content.as_bytes());
    let soul_path_arg = quote_shell_arg(&soul_path);
    let encoded_arg = quote_shell_arg(&encoded);
    let script = format!(
        "mkdir -p -- \"$(dirname -- {soul_path_arg})\" && printf '%s' {encoded_arg} | base64 -d > {soul_path_arg}"
    );
    let output = run_shell_command(&script)?;
    if output.status.success() {
        Ok(ProfileCommandResponse {
            ok: true,
            message: format!("SOUL.md saved for profile '{}'", name),
        })
    } else {
        Err(command_error("Failed to save SOUL.md", &output.stderr, &output.stdout))
    }
}

#[tauri::command]
pub fn open_hermes_profile_shell(name: String) -> Result<ProfileCommandResponse, String> {
    validate_profile_name(&name)?;
    let command = format!(
        "export HERMES_PROFILE={}; hermes chat; exec bash",
        quote_shell_arg(&name)
    );

    #[cfg(windows)]
    {
        create_command("wt.exe")
            .args(["wsl", "bash", "-lc", &command])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to open Windows Terminal: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        let script = format!("tell application \"Terminal\" to do script {}", quote_shell_arg(&command));
        create_command("osascript")
            .args(["-e", &script])
            .spawn()
            .map_err(|e| format!("Failed to open Terminal: {}", e))?;
    }

    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        create_command("x-terminal-emulator")
            .args(["-e", "bash", "-lc", &command])
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }

    Ok(ProfileCommandResponse {
        ok: true,
        message: format!("Opening Hermes chat with profile '{}'", name),
    })
}

#[tauri::command]
pub fn run_hermes_profile_setup(name: String) -> Result<ProfileCommandResponse, String> {
    validate_profile_name(&name)?;
    let command = format!(
        "export HERMES_PROFILE={}; hermes setup; exec bash",
        quote_shell_arg(&name)
    );

    #[cfg(windows)]
    {
        create_command("wt.exe")
            .args(["wsl", "bash", "-lc", &command])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to open Windows Terminal: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        let script = format!("tell application \"Terminal\" to do script {}", quote_shell_arg(&command));
        create_command("osascript")
            .args(["-e", &script])
            .spawn()
            .map_err(|e| format!("Failed to open Terminal: {}", e))?;
    }

    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        create_command("x-terminal-emulator")
            .args(["-e", "bash", "-lc", &command])
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }

    Ok(ProfileCommandResponse {
        ok: true,
        message: format!("Opening Hermes setup with profile '{}'", name),
    })
}

fn validate_profile_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 64 {
        return Err("Profile name must be 1-64 characters".to_string());
    }
    let mut chars = name.chars();
    let first = chars.next().unwrap();
    if !first.is_ascii_alphanumeric() {
        return Err("Profile name must start with a letter or number".to_string());
    }
    if !chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-') {
        return Err("Profile name only allows lowercase letters, numbers, underscores, and hyphens".to_string());
    }
    if needs_wsl() && name.contains('\\') {
        return Err("Profile name cannot contain path separators".to_string());
    }
    Ok(())
}
