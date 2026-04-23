// Settings 配置类型定义

// 模型配置
export interface ModelConfig {
  default: string;
  provider: string;
  api_key?: string;
  base_url?: string;
}

// Agent 配置
export interface AgentConfig {
  max_turns?: number;
  timeout?: number;
  reasoning_effort?: 'low' | 'medium' | 'high';
}

// 终端配置
export interface TerminalConfig {
  backend?: 'local' | 'docker' | 'ssh';
  timeout?: number;
  cwd?: string;
}

// 压缩配置
export interface CompressionConfig {
  enabled?: boolean;
  threshold?: number;
  target_ratio?: number;
}

// 检查点配置
export interface CheckpointConfig {
  enabled?: boolean;
  max_snapshots?: number;
}

// 配置节类型映射
export type ConfigSection = 'model' | 'agent' | 'terminal' | 'compression' | 'checkpoint';

// 配置节响应
export interface ConfigSectionResponse<T> {
  section: string;
  data: T;
}

// 原始配置响应
export interface RawConfigResponse {
  yaml: string;
}

// 更新原始配置请求
export interface UpdateRawConfigRequest {
  yaml_text: string;
}

// 配置更新响应
export interface ConfigUpdateResponse<T> {
  ok: boolean;
  section: string;
  data: T;
}

// 导出配置数据
export interface ExportConfigData {
  model: ModelConfig;
  agent: AgentConfig;
  terminal: TerminalConfig;
  compression: CompressionConfig;
  checkpoint: CheckpointConfig;
  exported_at: string;
  version: string;
}
