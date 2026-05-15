use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesPaths {
    pub hermes_home: String,
    pub config_yaml: String,
    pub state_db: String,
    pub logs_dir: String,
    pub skills_dir: String,
    pub memories_dir: String,
    pub cron_dir: String,
    pub checkpoints_dir: String,
    pub app_dir: String,
    pub approvals_dir: String,
    pub clarify_dir: String,
    pub secrets_dir: String,
}

impl HermesPaths {
    pub fn from_home(hermes_home: &str) -> Self {
        let normalized = hermes_home.trim_end_matches('/');
        Self {
            hermes_home: normalized.to_string(),
            config_yaml: format!("{normalized}/config.yaml"),
            state_db: format!("{normalized}/state.db"),
            logs_dir: format!("{normalized}/logs"),
            skills_dir: format!("{normalized}/skills"),
            memories_dir: format!("{normalized}/memories"),
            cron_dir: format!("{normalized}/cron"),
            checkpoints_dir: format!("{normalized}/checkpoints"),
            app_dir: format!("{normalized}/hermes-app"),
            approvals_dir: format!("{normalized}/approvals"),
            clarify_dir: format!("{normalized}/clarify"),
            secrets_dir: format!("{normalized}/secrets"),
        }
    }
}
