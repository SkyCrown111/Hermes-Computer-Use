// Settings API Service - Tauri Commands

import { safeInvoke } from '../lib/tauri';

export interface ModelConfig {
  default?: string;
  provider?: string;
  api_key?: string;
  base_url?: string;
}

export interface AgentConfig {
  max_turns?: number;
  timeout?: number;
  reasoning_effort?: string;
}

export interface TerminalConfig {
  backend?: string;
  timeout?: number;
  cwd?: string;
}

export interface CompressionConfig {
  enabled?: boolean;
  threshold?: number;
  target_ratio?: number;
}

export interface CheckpointConfig {
  enabled?: boolean;
  max_snapshots?: number;
}

export interface MemoryConfig {
  enabled?: boolean;
  max_chars?: number;
  auto_cleanup?: boolean;
  cleanup_threshold?: number;
  retention_days?: number;
}

export interface AuxiliaryTaskConfig {
  provider?: string;
  model?: string;
  base_url?: string;
  api_key?: string;
  timeout?: number;
}

export interface AuxiliaryConfig {
  vision?: AuxiliaryTaskConfig;
  web_extract?: AuxiliaryTaskConfig;
  compression?: AuxiliaryTaskConfig;
  session_search?: AuxiliaryTaskConfig;
  title_generation?: AuxiliaryTaskConfig;
  mcp?: AuxiliaryTaskConfig;
  approval?: AuxiliaryTaskConfig;
  flush_memories?: AuxiliaryTaskConfig;
  skills_hub?: AuxiliaryTaskConfig;
}

export interface CustomProvider {
  name: string;
  base_url: string;
  api_key?: string;
  model?: string;
  api_mode?: 'chat_completions' | 'anthropic_messages' | 'codex_responses';
  key_env?: string;
}

export interface FallbackProvider {
  name: string;
  model?: string;
  priority?: number;
}

export type CredentialPoolStrategy = 'fill_first' | 'round_robin' | 'least_used' | 'random';

export interface ProvidersConfig {
  custom_providers?: CustomProvider[];
  fallback_providers?: FallbackProvider[];
  credential_pool_strategies?: Record<string, CredentialPoolStrategy>;
}

export interface DisplayConfig {
  compact?: boolean;
  skin?: string;
  streaming?: boolean;
  show_reasoning?: boolean;
  tool_preview?: boolean;
  personality?: string;
  resume_display?: 'full' | 'summary' | 'none';
  busy_input_mode?: 'interrupt' | 'queue' | 'block';
  bell_on_complete?: boolean;
  final_response_markdown?: 'render' | 'strip' | 'raw';
  inline_diffs?: boolean;
  show_cost?: boolean;
  tool_progress?: 'all' | 'minimal' | 'none';
}

export type ApprovalMode = 'ask' | 'auto_approve_safe' | 'auto_approve_all' | 'auto_deny';

export interface ApprovalConfig {
  mode?: ApprovalMode;
  safe_commands?: string[];
  dangerous_commands?: string[];
  remember_session?: boolean;
  show_command_preview?: boolean;
  timeout_seconds?: number;
}

export interface HermesConfig {
  raw?: string;
  global_state?: Record<string, unknown>;
  agent_mode?: string;
  active_workspace_roots?: string[];
  prompt_history?: string[];
  sidebar_collapsed_groups?: Record<string, unknown>;
  model?: ModelConfig;
  agent?: AgentConfig;
  terminal?: TerminalConfig;
  compression?: CompressionConfig;
  checkpoint?: CheckpointConfig;
  auxiliary?: AuxiliaryConfig;
  providers?: ProvidersConfig;
  display?: DisplayConfig;
  memory?: MemoryConfig;
  approval?: ApprovalConfig;
}

// Load configuration
export async function loadConfig(): Promise<HermesConfig> {
  return safeInvoke<HermesConfig>('load_config');
}

// Save configuration
export async function saveConfig(config: HermesConfig): Promise<void> {
  await safeInvoke('save_config', { config });
}

// Restart Hermes Gateway (needed after config changes)
export async function restartGateway(): Promise<string> {
  return safeInvoke<string>('restart_hermes_gateway');
}

// Get data directory path
export async function getDataDir(): Promise<string> {
  return safeInvoke<string>('get_data_dir');
}

// Check if data directory exists
export async function checkDataDirExists(): Promise<boolean> {
  return safeInvoke<boolean>('check_data_dir_exists');
}

// Export all functions
export const settingsApi = {
  loadConfig,
  saveConfig,
  restartGateway,
  getDataDir,
  checkDataDirExists,
};
