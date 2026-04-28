// Settings 配置类型定义

// Approval 模式 - 智能审批配置
export type ApprovalMode = 'ask' | 'auto_approve_safe' | 'auto_approve_all' | 'auto_deny';

// Approval 配置
export interface ApprovalConfig {
  mode?: ApprovalMode;                    // 审批模式
  safe_commands?: string[];               // 安全命令白名单（自动批准）
  dangerous_commands?: string[];          // 危险命令黑名单（必须确认）
  remember_session?: boolean;             // 记住本次会话的选择
  show_command_preview?: boolean;         // 显示命令预览
  timeout_seconds?: number;               // 审批超时时间（秒）
}

// 模型配置
export interface ModelConfig {
  default: string;
  provider: string;
  api_key?: string;
  base_url?: string;
}

// Memory 配置 - Hermes Agent 的记忆系统配置
export interface MemoryConfig {
  enabled?: boolean;
  max_chars?: number;
  auto_cleanup?: boolean;
  cleanup_threshold?: number;  // 清理阈值 (百分比)
  retention_days?: number;     // 记忆保留天数
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

// 检查点保留策略
export type CheckpointRetentionPolicy = 'count' | 'time' | 'size';

// 检查点配置
export interface CheckpointConfig {
  enabled?: boolean;
  max_snapshots?: number;
  // 检查点存储路径
  storage_path?: string;
  // 自动恢复设置
  auto_restore?: boolean;
  auto_restore_on_crash?: boolean;
  // 检查点保留策略
  retention_policy?: CheckpointRetentionPolicy;
  retention_days?: number;       // 当 retention_policy 为 'time' 时有效
  retention_size_mb?: number;    // 当 retention_policy 为 'size' 时有效
  // 压缩设置
  compress_snapshots?: boolean;
}

// Auxiliary 任务配置 - 单个任务的 API 配置
export interface AuxiliaryTaskConfig {
  provider: string;      // 'auto' | 'openai' | 'anthropic' | 'custom' 等
  model: string;
  base_url: string;
  api_key: string;
  timeout?: number;
}

// Auxiliary 配置 - 为不同任务指定不同的 API
export interface AuxiliaryConfig {
  vision?: AuxiliaryTaskConfig;           // 图像分析/视觉任务
  web_extract?: AuxiliaryTaskConfig;      // 网页内容提取
  compression?: AuxiliaryTaskConfig;      // 上下文压缩
  session_search?: AuxiliaryTaskConfig;   // 会话搜索
  title_generation?: AuxiliaryTaskConfig; // 标题生成
  mcp?: AuxiliaryTaskConfig;              // MCP 相关任务
  approval?: AuxiliaryTaskConfig;         // 权限审批
  flush_memories?: AuxiliaryTaskConfig;   // 记忆清理
  skills_hub?: AuxiliaryTaskConfig;       // 技能中心
}

// Auxiliary 任务类型
export type AuxiliaryTaskType = keyof AuxiliaryConfig;

// Auxiliary 任务显示信息
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

// 配置节类型映射
export type ConfigSection = 'model' | 'agent' | 'terminal' | 'compression' | 'checkpoint' | 'auxiliary' | 'display' | 'memory';

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

// Custom Provider 配置 - 自定义 API 提供商
export interface CustomProvider {
  name: string;           // 提供商名称（显示用）
  base_url: string;       // API 端点 URL
  api_key?: string;       // API 密钥
  model?: string;         // 默认模型
  api_mode?: 'chat_completions' | 'anthropic_messages' | 'codex_responses';  // API 模式
  key_env?: string;       // 环境变量名（可选，用于从环境变量读取 key）
}

// Fallback Provider 配置 - 备用提供商
export interface FallbackProvider {
  name: string;
  model?: string;
  priority?: number;      // 优先级，数字越小优先级越高
}

// Credential Pool Strategy - 凭据池策略
export type CredentialPoolStrategy = 'fill_first' | 'round_robin' | 'least_used' | 'random';

// Providers 配置 - 提供商管理配置
export interface ProvidersConfig {
  custom_providers: CustomProvider[];
  fallback_providers: FallbackProvider[];
  credential_pool_strategies: Record<string, CredentialPoolStrategy>;
}

// Display 配置 - 显示设置
export interface DisplayConfig {
  compact?: boolean;                      // 紧凑模式
  skin?: string;                          // 主题皮肤 (default, dark, light, etc.)
  streaming?: boolean;                    // 流式显示
  show_reasoning?: boolean;               // 显示推理过程
  tool_preview?: boolean;                 // 工具预览
  personality?: string;                   // 个性设置 (kawaii, professional, etc.)
  resume_display?: 'full' | 'summary' | 'none';  // 会话恢复显示模式
  busy_input_mode?: 'interrupt' | 'queue' | 'block';  // 忙碌时输入处理模式
  bell_on_complete?: boolean;             // 完成时提示音
  final_response_markdown?: 'render' | 'strip' | 'raw';  // 最终响应 Markdown 处理
  inline_diffs?: boolean;                 // 内联差异显示
  show_cost?: boolean;                    // 显示费用
  tool_progress?: 'all' | 'minimal' | 'none';  // 工具进度显示
}

// 可用的主题皮肤列表
export const DISPLAY_SKINS = ['default', 'dark', 'light', 'minimal', 'compact'] as const;
export type DisplaySkin = typeof DISPLAY_SKINS[number];

// 可用的个性设置列表
export const DISPLAY_PERSONALITIES = ['default', 'kawaii', 'professional', 'friendly', 'concise'] as const;
export type DisplayPersonality = typeof DISPLAY_PERSONALITIES[number];
