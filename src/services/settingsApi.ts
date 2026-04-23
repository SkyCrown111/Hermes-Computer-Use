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
