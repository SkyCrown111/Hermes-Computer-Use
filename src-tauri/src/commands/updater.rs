//! App update checks via GitHub Releases API (fallback when updater artifacts are unavailable).

use serde::Serialize;

const GITHUB_LATEST_API: &str =
    "https://api.github.com/repos/SkyCrown111/Hermes-Computer-Use/releases/latest";
const GITHUB_RELEASE_PAGE: &str =
    "https://github.com/SkyCrown111/Hermes-Computer-Use/releases/latest";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubUpdateCheck {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub available: bool,
    pub release_url: String,
    pub release_notes: Option<String>,
    pub published_at: Option<String>,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn check_github_release() -> Result<GitHubUpdateCheck, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    let client = reqwest::Client::builder()
        .user_agent("Hermes-Computer-Use-Updater")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let response = client
        .get(GITHUB_LATEST_API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Failed to reach GitHub: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "GitHub API returned {} — verify the repository is public and releases exist",
            response.status()
        ));
    }

    let payload: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Invalid GitHub response: {e}"))?;

    let tag = payload
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .trim_start_matches('v')
        .to_string();

    let latest_version = if tag.is_empty() { None } else { Some(tag.clone()) };

    let available = latest_version
        .as_ref()
        .map(|latest| version_is_newer(latest, &current_version))
        .unwrap_or(false);

    let release_url = payload
        .get("html_url")
        .and_then(|v| v.as_str())
        .unwrap_or(GITHUB_RELEASE_PAGE)
        .to_string();

    let release_notes = payload
        .get("body")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.trim().is_empty());

    let published_at = payload
        .get("published_at")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Ok(GitHubUpdateCheck {
        current_version,
        latest_version,
        available,
        release_url,
        release_notes,
        published_at,
    })
}

/// Compare `a` and `b` as dot-separated numeric segments (semver-like).
fn version_is_newer(latest: &str, current: &str) -> bool {
    parse_version_parts(latest) > parse_version_parts(current)
}

fn parse_version_parts(version: &str) -> Vec<u64> {
    version
        .split('.')
        .filter_map(|part| {
            let digits: String = part.chars().take_while(|c| c.is_ascii_digit()).collect();
            if digits.is_empty() {
                None
            } else {
                digits.parse().ok()
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_version_detected() {
        assert!(version_is_newer("0.2.0", "0.1.1"));
        assert!(!version_is_newer("0.1.1", "0.1.1"));
        assert!(!version_is_newer("0.1.0", "0.1.1"));
    }
}
