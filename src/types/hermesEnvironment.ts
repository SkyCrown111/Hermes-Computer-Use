export interface HermesRuntime {
  python_path: string | null;
  cli_command: string | null;
  agent_root: string | null;
  import_root: string | null;
}

export interface HermesPaths {
  hermes_home: string;
  config_yaml: string;
  state_db: string;
  logs_dir: string;
  skills_dir: string;
  memories_dir: string;
  cron_dir: string;
  checkpoints_dir: string;
  app_dir: string;
  approvals_dir: string;
  clarify_dir: string;
  secrets_dir: string;
}

export interface HermesCapabilities {
  has_chat: boolean;
  has_sessions: boolean;
  has_skills: boolean;
  has_memories: boolean;
  has_mcp: boolean;
  has_cron: boolean;
  has_platforms: boolean;
  chat: HermesCapabilityStatus;
  sessions: HermesCapabilityStatus;
  skills: HermesCapabilityStatus;
  memories: HermesCapabilityStatus;
  mcp: HermesCapabilityStatus;
  cron: HermesCapabilityStatus;
  platforms: HermesCapabilityStatus;
}

export interface HermesCapabilityStatus {
  available: boolean;
  detection_method: string;
  reason: string | null;
  checked_paths: string[];
}

export interface HermesEnvironment {
  hermes_home: string;
  active_profile: string | null;
  runtime: HermesRuntime;
  paths: HermesPaths;
  capabilities: HermesCapabilities;
  uses_wsl: boolean;
}
