export type ApprovalMode = 'ask' | 'auto_approve_safe' | 'auto_approve_all' | 'auto_deny';

export interface ApprovalConfig {
  mode?: ApprovalMode;
  safe_commands?: string[];
  dangerous_commands?: string[];
  remember_session?: boolean;
  show_command_preview?: boolean;
  timeout_seconds?: number;
}

export interface ModelConfig {
  default: string;
  provider: string;
  api_key?: string;
  base_url?: string;
  context_length?: number;
}

export interface MemoryConfig {
  enabled?: boolean;
  max_chars?: number;
  auto_cleanup?: boolean;
  cleanup_threshold?: number;
  retention_days?: number;
}

export interface AgentConfig {
  max_turns?: number;
  timeout?: number;
  reasoning_effort?: 'low' | 'medium' | 'high';
  gateway_timeout?: number;
  personalities?: Record<string, string>;
  verbose?: boolean;
}

export interface TerminalConfig {
  backend?: 'local' | 'docker' | 'ssh';
  timeout?: number;
  cwd?: string;
}

export interface BrowserConfig {
  inactivity_timeout?: number;
  command_timeout?: number;
}

export interface CompressionConfig {
  enabled?: boolean;
  threshold?: number;
  target_ratio?: number;
}

export type CheckpointRetentionPolicy = 'count' | 'time' | 'size';

export interface CheckpointConfig {
  enabled?: boolean;
  max_snapshots?: number;
  storage_path?: string;
  auto_restore?: boolean;
  auto_restore_on_crash?: boolean;
  retention_policy?: CheckpointRetentionPolicy;
  retention_days?: number;
  retention_size_mb?: number;
  compress_snapshots?: boolean;
}

export interface AuxiliaryTaskConfig {
  provider: string;
  model: string;
  base_url: string;
  api_key: string;
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

export type AuxiliaryTaskType = keyof AuxiliaryConfig;

export const AUXILIARY_TASK_INFO: Record<AuxiliaryTaskType, { nameKey: string; descKey: string }> = {
  vision: { nameKey: 'aux.vision', descKey: 'aux.visionDesc' },
  web_extract: { nameKey: 'aux.webExtract', descKey: 'aux.webExtractDesc' },
  compression: { nameKey: 'aux.compression', descKey: 'aux.compressionDesc' },
  session_search: { nameKey: 'aux.sessionSearch', descKey: 'aux.sessionSearchDesc' },
  title_generation: { nameKey: 'aux.titleGeneration', descKey: 'aux.titleGenerationDesc' },
  mcp: { nameKey: 'aux.mcp', descKey: 'aux.mcpDesc' },
  approval: { nameKey: 'aux.approval', descKey: 'aux.approvalDesc' },
  flush_memories: { nameKey: 'aux.flushMemories', descKey: 'aux.flushMemoriesDesc' },
  skills_hub: { nameKey: 'aux.skillsHub', descKey: 'aux.skillsHubDesc' },
};

export type ConfigSection = 'model' | 'agent' | 'terminal' | 'browser' | 'compression' | 'checkpoint' | 'auxiliary' | 'display' | 'memory' | 'approval' | 'skills' | 'providers';

export interface ConfigSectionResponse<T> {
  section: string;
  data: T;
}

export interface RawConfigResponse {
  yaml: string;
}

export interface UpdateRawConfigRequest {
  yaml_text: string;
}

export interface ConfigUpdateResponse<T> {
  ok: boolean;
  section: string;
  data: T;
}

export interface ExportConfigData {
  model: ModelConfig;
  agent: AgentConfig;
  terminal: TerminalConfig;
  compression: CompressionConfig;
  checkpoint: CheckpointConfig;
  exported_at: string;
  version: string;
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

export const DISPLAY_SKINS = ['default', 'dark', 'light', 'minimal', 'compact'] as const;
export type DisplaySkin = typeof DISPLAY_SKINS[number];

export const DISPLAY_PERSONALITIES = ['default', 'kawaii', 'professional', 'friendly', 'concise'] as const;
export type DisplayPersonality = typeof DISPLAY_PERSONALITIES[number];

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
  browser?: BrowserConfig;
  compression?: CompressionConfig;
  checkpoint?: CheckpointConfig;
  auxiliary?: AuxiliaryConfig;
  providers?: ProvidersConfig;
  display?: DisplayConfig;
  memory?: MemoryConfig;
  approval?: ApprovalConfig;
}
