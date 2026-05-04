// Settings Store - 系统配置状态管理

import { create } from 'zustand';
import type {
  ModelConfig,
  AgentConfig,
  TerminalConfig,
  CompressionConfig,
  CheckpointConfig,
  MemoryConfig,
  AuxiliaryConfig,
  AuxiliaryTaskType,
  AuxiliaryTaskConfig,
  ProvidersConfig,
  DisplayConfig,
  CredentialPoolStrategy,
  ApprovalConfig,
  ApprovalMode,
  HermesConfig,
} from '../types/config';
import * as settingsApi from '../services/settingsApi';
import { logger } from '../lib/logger';
import { getErrorMessage } from '../lib/errorUtils';
import { t } from '../lib/i18n';
import { useThemeStore } from './themeStore';

const SUCCESS_MSG_DURATION = 3000;
function clearSuccessLater() {
  setTimeout(() => useSettingsStore.setState({ successMessage: null }), SUCCESS_MSG_DURATION);
}

/** Get a translated success message using the current language */
function msg(key: string): string {
  return t(key, useThemeStore.getState().language || 'zh');
}

// API response type from backend
interface ConfigResponse {
  raw?: string;
  model?: {
    default?: string;
    provider?: string;
    api_key?: string;
    base_url?: string;
  };
  agent?: {
    max_turns?: number;
    timeout?: number;
    reasoning_effort?: string;
  };
  terminal?: {
    backend?: string;
    timeout?: number;
    cwd?: string;
  };
  compression?: {
    enabled?: boolean;
    threshold?: number;
    target_ratio?: number;
  };
  checkpoint?: {
    enabled?: boolean;
    max_snapshots?: number;
  };
  memory?: {
    enabled?: boolean;
    max_chars?: number;
    auto_cleanup?: boolean;
    cleanup_threshold?: number;
    retention_days?: number;
  };
  auxiliary?: {
    vision?: AuxiliaryTaskConfig;
    web_extract?: AuxiliaryTaskConfig;
    compression?: AuxiliaryTaskConfig;
    session_search?: AuxiliaryTaskConfig;
    title_generation?: AuxiliaryTaskConfig;
    mcp?: AuxiliaryTaskConfig;
    approval?: AuxiliaryTaskConfig;
    flush_memories?: AuxiliaryTaskConfig;
    skills_hub?: AuxiliaryTaskConfig;
  };
  providers?: {
    custom_providers?: Array<{ name: string; base_url: string; api_key?: string; model?: string }>;
    fallback_providers?: Array<{ name: string; model?: string; priority?: number }>;
    credential_pool_strategies?: Record<string, string>;
  };
  display?: {
    compact?: boolean;
    skin?: string;
    streaming?: boolean;
    show_reasoning?: boolean;
    tool_preview?: boolean;
    personality?: string;
    resume_display?: string;
    busy_input_mode?: string;
    bell_on_complete?: boolean;
    final_response_markdown?: string;
    inline_diffs?: boolean;
    show_cost?: boolean;
    tool_progress?: string;
  };
  approval?: {
    mode?: ApprovalMode;
    safe_commands?: string[];
    dangerous_commands?: string[];
    remember_session?: boolean;
    show_command_preview?: boolean;
    timeout_seconds?: number;
  };
}

interface SettingsState {
  // 模型配置
  modelConfig: ModelConfig | null;
  isLoadingModel: boolean;

  // Agent 配置
  agentConfig: AgentConfig | null;
  isLoadingAgent: boolean;

  // 终端配置
  terminalConfig: TerminalConfig | null;
  isLoadingTerminal: boolean;

  // 压缩配置
  compressionConfig: CompressionConfig | null;
  isLoadingCompression: boolean;

  // 检查点配置
  checkpointConfig: CheckpointConfig | null;
  isLoadingCheckpoint: boolean;

  // Memory 配置
  memoryConfig: MemoryConfig | null;
  isLoadingMemory: boolean;

  // Auxiliary 配置
  auxiliaryConfig: AuxiliaryConfig | null;
  isLoadingAuxiliary: boolean;

  // Providers 配置
  providersConfig: ProvidersConfig | null;
  isLoadingProviders: boolean;

  // Display 配置
  displayConfig: DisplayConfig | null;
  isLoadingDisplay: boolean;

  // Approval 配置
  approvalConfig: ApprovalConfig | null;
  isLoadingApproval: boolean;

  // 原始 YAML 配置
  rawYaml: string;
  isLoadingRaw: boolean;

  // 编辑模式
  editMode: 'form' | 'yaml';

  // 错误
  error: string | null;
  successMessage: string | null;

  // 保存状态
  isSaving: boolean;

  // Actions
  fetchAllConfigs: () => Promise<void>;
  fetchModelConfig: () => Promise<void>;
  fetchAgentConfig: () => Promise<void>;
  fetchTerminalConfig: () => Promise<void>;
  fetchCompressionConfig: () => Promise<void>;
  fetchCheckpointConfig: () => Promise<void>;
  fetchRawYaml: () => Promise<void>;

  updateModelConfig: (data: Partial<ModelConfig>) => Promise<void>;
  updateAgentConfig: (data: Partial<AgentConfig>) => Promise<void>;
  updateTerminalConfig: (data: Partial<TerminalConfig>) => Promise<void>;
  updateCompressionConfig: (data: Partial<CompressionConfig>) => Promise<void>;
  updateCheckpointConfig: (data: Partial<CheckpointConfig>) => Promise<void>;
  updateRawYaml: (yaml: string) => Promise<void>;

  updateMemoryConfig: (data: Partial<MemoryConfig>) => Promise<void>;
  updateAuxiliaryTaskConfig: (taskType: AuxiliaryTaskType, data: AuxiliaryTaskConfig) => Promise<void>;
  deleteAuxiliaryTaskConfig: (taskType: AuxiliaryTaskType) => Promise<void>;
  updateProvidersConfig: (data: Partial<ProvidersConfig>) => Promise<void>;
  addCustomProvider: (provider: { name: string; base_url: string; api_key?: string; model?: string }) => Promise<void>;
  updateCustomProvider: (index: number, provider: { name: string; base_url: string; api_key?: string; model?: string }) => Promise<void>;
  deleteCustomProvider: (index: number) => Promise<void>;
  addFallbackProvider: (provider: { name: string; model?: string; priority?: number }) => Promise<void>;
  deleteFallbackProvider: (index: number) => Promise<void>;
  updateCredentialPoolStrategy: (provider: string, strategy: 'fill_first' | 'round_robin' | 'least_used' | 'random') => Promise<void>;
  updateDisplayConfig: (data: Partial<DisplayConfig>) => Promise<void>;
  updateApprovalConfig: (data: Partial<ApprovalConfig>) => Promise<void>;

  setEditMode: (mode: 'form' | 'yaml') => void;
  setRawYaml: (yaml: string) => void;
  clearError: () => void;
  clearSuccessMessage: () => void;

  // 导入导出
  exportConfig: () => Promise<string>;
  importConfig: (jsonStr: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  // 初始状态
  modelConfig: null,
  isLoadingModel: false,
  agentConfig: null,
  isLoadingAgent: false,
  terminalConfig: null,
  isLoadingTerminal: false,
  compressionConfig: null,
  isLoadingCompression: false,
  checkpointConfig: null,
  isLoadingCheckpoint: false,
  memoryConfig: null,
  isLoadingMemory: false,
  auxiliaryConfig: null,
  isLoadingAuxiliary: false,
  providersConfig: null,
  isLoadingProviders: false,
  displayConfig: null,
  isLoadingDisplay: false,
  approvalConfig: null,
  isLoadingApproval: false,
  rawYaml: '',
  isLoadingRaw: false,
  editMode: 'form',
  error: null,
  successMessage: null,
  isSaving: false,

  // 获取所有配置 (single API call, not 5 separate ones)
  fetchAllConfigs: async () => {
    try {
      const config = await settingsApi.loadConfig() as ConfigResponse;
      set({
        modelConfig: {
          default: config.model?.default || '',
          provider: config.model?.provider || 'auto',
          api_key: config.model?.api_key || '',
          base_url: config.model?.base_url || '',
        },
        agentConfig: {
          max_turns: config.agent?.max_turns || 100,
          timeout: config.agent?.timeout || 300,
          reasoning_effort: (config.agent?.reasoning_effort as 'low' | 'medium' | 'high') || 'medium',
        },
        terminalConfig: {
          backend: (config.terminal?.backend as 'local' | 'docker' | 'ssh') || 'local',
          timeout: config.terminal?.timeout || 180,
          cwd: config.terminal?.cwd || '',
        },
        compressionConfig: {
          enabled: config.compression?.enabled ?? true,
          threshold: config.compression?.threshold || 0.8,
          target_ratio: config.compression?.target_ratio || 0.5,
        },
        checkpointConfig: {
          enabled: config.checkpoint?.enabled ?? true,
          max_snapshots: config.checkpoint?.max_snapshots || 10,
        },
        memoryConfig: {
          enabled: config.memory?.enabled ?? true,
          max_chars: config.memory?.max_chars || 10000,
          auto_cleanup: config.memory?.auto_cleanup ?? false,
          cleanup_threshold: config.memory?.cleanup_threshold || 90,
          retention_days: config.memory?.retention_days || 30,
        },
        auxiliaryConfig: config.auxiliary || null,
        providersConfig: config.providers ? {
          custom_providers: config.providers.custom_providers || [],
          fallback_providers: config.providers.fallback_providers || [],
          credential_pool_strategies: (config.providers.credential_pool_strategies || {}) as Record<string, CredentialPoolStrategy>,
        } : null,
        displayConfig: {
          compact: config.display?.compact ?? false,
          skin: config.display?.skin || 'default',
          streaming: config.display?.streaming ?? true,
          show_reasoning: config.display?.show_reasoning ?? false,
          tool_preview: config.display?.tool_preview ?? true,
          personality: config.display?.personality || 'default',
          resume_display: (config.display?.resume_display as 'full' | 'summary' | 'none') || 'full',
          busy_input_mode: (config.display?.busy_input_mode as 'interrupt' | 'queue' | 'block') || 'interrupt',
          bell_on_complete: config.display?.bell_on_complete ?? false,
          final_response_markdown: (config.display?.final_response_markdown as 'render' | 'strip' | 'raw') || 'render',
          inline_diffs: config.display?.inline_diffs ?? true,
          show_cost: config.display?.show_cost ?? false,
          tool_progress: (config.display?.tool_progress as 'all' | 'minimal' | 'none') || 'all',
        },
        approvalConfig: {
          mode: (config.approval?.mode as ApprovalMode) || 'ask',
          safe_commands: config.approval?.safe_commands || [],
          dangerous_commands: config.approval?.dangerous_commands || [],
          remember_session: config.approval?.remember_session ?? false,
          show_command_preview: config.approval?.show_command_preview ?? true,
          timeout_seconds: config.approval?.timeout_seconds || 300,
        },
        rawYaml: config.raw || '',
        isLoadingModel: false,
        isLoadingAgent: false,
        isLoadingTerminal: false,
        isLoadingCompression: false,
        isLoadingCheckpoint: false,
        isLoadingMemory: false,
        isLoadingAuxiliary: false,
        isLoadingProviders: false,
        isLoadingDisplay: false,
        isLoadingApproval: false,
      });
    } catch (err) {
      const msg = (err as Error).message;
      set({
        error: msg,
        isLoadingModel: false,
        isLoadingAgent: false,
        isLoadingTerminal: false,
        isLoadingCompression: false,
        isLoadingCheckpoint: false,
        isLoadingMemory: false,
        isLoadingAuxiliary: false,
        isLoadingProviders: false,
        isLoadingDisplay: false,
        isLoadingApproval: false,
      });
    }
  },

  // 获取模型配置 (delegates to fetchAllConfigs to avoid duplicate API calls)
  fetchModelConfig: async () => {
    await get().fetchAllConfigs();
  },

  fetchAgentConfig: async () => {
    await get().fetchAllConfigs();
  },

  fetchTerminalConfig: async () => {
    await get().fetchAllConfigs();
  },

  fetchCompressionConfig: async () => {
    await get().fetchAllConfigs();
  },

  fetchCheckpointConfig: async () => {
    await get().fetchAllConfigs();
  },

  fetchRawYaml: async () => {
    set({ isLoadingRaw: true, error: null });
    try {
      const config = await settingsApi.loadConfig() as ConfigResponse;
      set({ rawYaml: config.raw || '', isLoadingRaw: false });
    } catch (err) {
      set({ error: getErrorMessage(err), isLoadingRaw: false });
    }
  },

  // 更新模型配置（使用 section API 避免重复加载完整配置）
  updateModelConfig: async (data: Partial<ModelConfig>) => {
    set({ isSaving: true, error: null });
    try {
      await settingsApi.updateConfigSection('model', data as Record<string, unknown>);
      await settingsApi.restartGateway();
      set({ modelConfig: data as ModelConfig, isSaving: false, successMessage: msg('settings.saved.model') });
      clearSuccessLater();
    } catch (err) {
      logger.error('[Settings] Failed to update model config:', err);
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新 Agent 配置
  updateAgentConfig: async (data: Partial<AgentConfig>) => {
    set({ isSaving: true, error: null });
    try {
      await settingsApi.updateConfigSection('agent', data as Record<string, unknown>);
      await settingsApi.restartGateway();
      set({ agentConfig: data as AgentConfig, isSaving: false, successMessage: msg('settings.saved.agent') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新终端配置
  updateTerminalConfig: async (data: Partial<TerminalConfig>) => {
    set({ isSaving: true, error: null });
    try {
      await settingsApi.updateConfigSection('terminal', data as Record<string, unknown>);
      set({ terminalConfig: data as TerminalConfig, isSaving: false, successMessage: msg('settings.saved.terminal') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新压缩配置
  updateCompressionConfig: async (data: Partial<CompressionConfig>) => {
    set({ isSaving: true, error: null });
    try {
      await settingsApi.updateConfigSection('compression', data as Record<string, unknown>);
      set({ compressionConfig: data as CompressionConfig, isSaving: false, successMessage: msg('settings.saved.compression') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新检查点配置
  updateCheckpointConfig: async (data: Partial<CheckpointConfig>) => {
    set({ isSaving: true, error: null });
    try {
      await settingsApi.updateConfigSection('checkpoint', data as Record<string, unknown>);
      set({ checkpointConfig: data as CheckpointConfig, isSaving: false, successMessage: msg('settings.saved.checkpoint') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新原始 YAML 配置 (pass raw YAML string, not JSON.parse)
  updateRawYaml: async (yaml: string) => {
    set({ isSaving: true, error: null });
    try {
      await settingsApi.saveConfig({ raw: yaml } as HermesConfig);
      set({ rawYaml: yaml, isSaving: false, successMessage: msg('settings.saved.config') });
      await get().fetchAllConfigs();
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新 Memory 配置
  updateMemoryConfig: async (data: Partial<MemoryConfig>) => {
    set({ isSaving: true, error: null });
    try {
      await settingsApi.updateConfigSection('memory', data as Record<string, unknown>);
      set({ memoryConfig: data as MemoryConfig, isSaving: false, successMessage: msg('settings.saved.memory') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新 Auxiliary 任务配置（需要读取现有数据做合并）
  updateAuxiliaryTaskConfig: async (taskType: AuxiliaryTaskType, data: AuxiliaryTaskConfig) => {
    set({ isSaving: true, error: null });
    try {
      const resp = await settingsApi.getConfigSection<Record<string, AuxiliaryTaskConfig>>('auxiliary');
      const currentAuxiliary = resp.data || {};
      await settingsApi.updateConfigSection('auxiliary', { ...currentAuxiliary, [taskType]: data });
      set({ auxiliaryConfig: { ...get().auxiliaryConfig, [taskType]: data } as AuxiliaryConfig, isSaving: false, successMessage: msg('settings.saved.auxiliary') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 删除 Auxiliary 任务配置
  deleteAuxiliaryTaskConfig: async (taskType: AuxiliaryTaskType) => {
    set({ isSaving: true, error: null });
    try {
      const resp = await settingsApi.getConfigSection<Record<string, AuxiliaryTaskConfig>>('auxiliary');
      const currentAuxiliary = { ...(resp.data || {}) };
      delete currentAuxiliary[taskType];
      await settingsApi.updateConfigSection('auxiliary', currentAuxiliary);
      set({ auxiliaryConfig: currentAuxiliary as AuxiliaryConfig, isSaving: false, successMessage: msg('settings.deleted.auxiliary') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新 Providers 配置
  updateProvidersConfig: async (data: Partial<ProvidersConfig>) => {
    set({ isSaving: true, error: null });
    try {
      await settingsApi.updateConfigSection('providers', data as Record<string, unknown>);
      set({ providersConfig: data as ProvidersConfig, isSaving: false, successMessage: msg('settings.saved.providers') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 添加自定义 Provider
  addCustomProvider: async (provider: { name: string; base_url: string; api_key?: string; model?: string }) => {
    set({ isSaving: true, error: null });
    try {
      const resp = await settingsApi.getConfigSection<ProvidersConfig>('providers');
      const currentProviders = resp.data || { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} };
      const newCustomProviders = [...(currentProviders.custom_providers || []), provider];
      await settingsApi.updateConfigSection('providers', { ...currentProviders, custom_providers: newCustomProviders });
      set({ providersConfig: { ...get().providersConfig, custom_providers: newCustomProviders } as ProvidersConfig, isSaving: false, successMessage: msg('settings.added.customProvider') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新自定义 Provider
  updateCustomProvider: async (index: number, provider: { name: string; base_url: string; api_key?: string; model?: string }) => {
    set({ isSaving: true, error: null });
    try {
      const resp = await settingsApi.getConfigSection<ProvidersConfig>('providers');
      const currentProviders = resp.data || { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} };
      const newCustomProviders = [...(currentProviders.custom_providers || [])];
      newCustomProviders[index] = provider;
      await settingsApi.updateConfigSection('providers', { ...currentProviders, custom_providers: newCustomProviders });
      set({ providersConfig: { ...get().providersConfig, custom_providers: newCustomProviders } as ProvidersConfig, isSaving: false, successMessage: msg('settings.updated.customProvider') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 删除自定义 Provider
  deleteCustomProvider: async (index: number) => {
    set({ isSaving: true, error: null });
    try {
      const resp = await settingsApi.getConfigSection<ProvidersConfig>('providers');
      const currentProviders = resp.data || { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} };
      const newCustomProviders = [...(currentProviders.custom_providers || [])];
      newCustomProviders.splice(index, 1);
      await settingsApi.updateConfigSection('providers', { ...currentProviders, custom_providers: newCustomProviders });
      set({ providersConfig: { ...get().providersConfig, custom_providers: newCustomProviders } as ProvidersConfig, isSaving: false, successMessage: msg('settings.deleted.customProvider') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 添加备用 Provider
  addFallbackProvider: async (provider: { name: string; model?: string; priority?: number }) => {
    set({ isSaving: true, error: null });
    try {
      const resp = await settingsApi.getConfigSection<ProvidersConfig>('providers');
      const currentProviders = resp.data || { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} };
      const newFallbackProviders = [...(currentProviders.fallback_providers || []), provider];
      await settingsApi.updateConfigSection('providers', { ...currentProviders, fallback_providers: newFallbackProviders });
      set({ providersConfig: { ...get().providersConfig, fallback_providers: newFallbackProviders } as ProvidersConfig, isSaving: false, successMessage: msg('settings.added.fallbackProvider') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 删除备用 Provider
  deleteFallbackProvider: async (index: number) => {
    set({ isSaving: true, error: null });
    try {
      const resp = await settingsApi.getConfigSection<ProvidersConfig>('providers');
      const currentProviders = resp.data || { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} };
      const newFallbackProviders = [...(currentProviders.fallback_providers || [])];
      newFallbackProviders.splice(index, 1);
      await settingsApi.updateConfigSection('providers', { ...currentProviders, fallback_providers: newFallbackProviders });
      set({ providersConfig: { ...get().providersConfig, fallback_providers: newFallbackProviders } as ProvidersConfig, isSaving: false, successMessage: msg('settings.deleted.fallbackProvider') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新凭据池策略
  updateCredentialPoolStrategy: async (provider: string, strategy: 'fill_first' | 'round_robin' | 'least_used' | 'random') => {
    set({ isSaving: true, error: null });
    try {
      const resp = await settingsApi.getConfigSection<ProvidersConfig>('providers');
      const currentProviders = resp.data || { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} };
      const newStrategies = { ...(currentProviders.credential_pool_strategies || {}), [provider]: strategy };
      await settingsApi.updateConfigSection('providers', { ...currentProviders, credential_pool_strategies: newStrategies });
      set({ providersConfig: { ...get().providersConfig, credential_pool_strategies: newStrategies } as ProvidersConfig, isSaving: false, successMessage: msg('settings.updated.credentialPool') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新 Display 配置
  updateDisplayConfig: async (data: Partial<DisplayConfig>) => {
    set({ isSaving: true, error: null });
    try {
      await settingsApi.updateConfigSection('display', data as Record<string, unknown>);
      set({ displayConfig: data as DisplayConfig, isSaving: false, successMessage: msg('settings.saved.display') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新 Approval 配置
  updateApprovalConfig: async (data: Partial<ApprovalConfig>) => {
    set({ isSaving: true, error: null });
    try {
      await settingsApi.updateConfigSection('approval', data as Record<string, unknown>);
      set({ approvalConfig: data as ApprovalConfig, isSaving: false, successMessage: msg('settings.saved.approval') });
      clearSuccessLater();
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 设置编辑模式
  setEditMode: (mode: 'form' | 'yaml') => {
    set({ editMode: mode });
    if (mode === 'yaml') {
      get().fetchRawYaml();
    }
  },

  // 设置原始 YAML
  setRawYaml: (yaml: string) => {
    set({ rawYaml: yaml });
  },

  // 清除错误
  clearError: () => {
    set({ error: null });
  },

  // 清除成功消息
  clearSuccessMessage: () => {
    set({ successMessage: null });
  },

  // 导出配置
  exportConfig: async () => {
    const state = get();
    const exportData = {
      model: state.modelConfig,
      agent: state.agentConfig,
      terminal: state.terminalConfig,
      compression: state.compressionConfig,
      checkpoint: state.checkpointConfig,
      exported_at: new Date().toISOString(),
      version: '1.0.0',
    };
    return JSON.stringify(exportData, null, 2);
  },

  // 导入配置
  importConfig: async (jsonStr: string) => {
    set({ isSaving: true, error: null });
    try {
      const data = JSON.parse(jsonStr);
      await settingsApi.saveConfig(data as HermesConfig);

      // 刷新配置
      await get().fetchAllConfigs();
      set({ isSaving: false, successMessage: msg('settings.imported') });
      clearSuccessLater();
    } catch (err) {
      set({ error: `${msg('settings.importFailed')}: ${(err as Error).message}`, isSaving: false });
    }
  },
}));
