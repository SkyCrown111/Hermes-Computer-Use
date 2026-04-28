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
} from '../types/config';
import { settingsApi } from '../services/settingsApi';
import { logger } from '../lib/logger';

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

  // 获取模型配置
  fetchModelConfig: async () => {
    set({ isLoadingModel: true, error: null });
    try {
      const config = await settingsApi.loadConfig() as ConfigResponse;
      logger.debug('[Settings] Raw API response:', config);
      logger.debug('[Settings] Loaded config:', config);
      logger.debug('[Settings] config.model:', config.model);
      const modelConfig: ModelConfig = {
        default: config.model?.default || '',
        provider: config.model?.provider || 'auto',
        api_key: config.model?.api_key || '',
        base_url: config.model?.base_url || '',
      };
      logger.debug('[Settings] Computed modelConfig:', modelConfig);
      logger.debug('[Settings] Model config:', modelConfig);
      set({ modelConfig, isLoadingModel: false });
    } catch (err) {
      logger.error('[Settings] Failed to load model config:', err);
      set({ error: (err as Error).message, isLoadingModel: false });
    }
  },

  // 获取 Agent 配置
  fetchAgentConfig: async () => {
    set({ isLoadingAgent: true, error: null });
    try {
      const config = await settingsApi.loadConfig() as ConfigResponse;
      const agentConfig: AgentConfig = {
        max_turns: config.agent?.max_turns || 100,
        timeout: config.agent?.timeout || 300,
        reasoning_effort: (config.agent?.reasoning_effort as 'low' | 'medium' | 'high') || 'medium',
      };
      set({ agentConfig, isLoadingAgent: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoadingAgent: false });
    }
  },

  // 获取终端配置
  fetchTerminalConfig: async () => {
    set({ isLoadingTerminal: true, error: null });
    try {
      const config = await settingsApi.loadConfig() as ConfigResponse;
      const terminalConfig: TerminalConfig = {
        backend: (config.terminal?.backend as 'local' | 'docker' | 'ssh') || 'local',
        timeout: config.terminal?.timeout || 180,
        cwd: config.terminal?.cwd || '',
      };
      set({ terminalConfig, isLoadingTerminal: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoadingTerminal: false });
    }
  },

  // 获取压缩配置
  fetchCompressionConfig: async () => {
    set({ isLoadingCompression: true, error: null });
    try {
      const config = await settingsApi.loadConfig() as ConfigResponse;
      const compressionConfig: CompressionConfig = {
        enabled: config.compression?.enabled ?? true,
        threshold: config.compression?.threshold || 0.8,
        target_ratio: config.compression?.target_ratio || 0.5,
      };
      set({ compressionConfig, isLoadingCompression: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoadingCompression: false });
    }
  },

  // 获取检查点配置
  fetchCheckpointConfig: async () => {
    set({ isLoadingCheckpoint: true, error: null });
    try {
      const config = await settingsApi.loadConfig() as ConfigResponse;
      const checkpointConfig: CheckpointConfig = {
        enabled: config.checkpoint?.enabled ?? true,
        max_snapshots: config.checkpoint?.max_snapshots || 10,
      };
      set({ checkpointConfig, isLoadingCheckpoint: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoadingCheckpoint: false });
    }
  },

  // 获取原始 YAML 配置
  fetchRawYaml: async () => {
    set({ isLoadingRaw: true, error: null });
    try {
      const config = await settingsApi.loadConfig() as ConfigResponse;
      set({ rawYaml: config.raw || '', isLoadingRaw: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoadingRaw: false });
    }
  },

  // 更新模型配置
  updateModelConfig: async (data: Partial<ModelConfig>) => {
    set({ isSaving: true, error: null });
    try {
      logger.debug('[Settings] updateModelConfig called with:', data);
      const currentConfig = await settingsApi.loadConfig();
      logger.debug('[Settings] Current config:', currentConfig);
      // Remove 'raw' field to prevent it from overwriting structured config
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      const configToSave = { ...configWithoutRaw, model: data };
      logger.debug('[Settings] Saving config:', configToSave);
      await settingsApi.saveConfig(configToSave);
      // Restart Gateway to apply new config
      await settingsApi.restartGateway();
      set({ modelConfig: data as ModelConfig, isSaving: false, successMessage: '模型配置已保存，Gateway 已重启' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      logger.error('[Settings] Failed to update model config:', err);
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新 Agent 配置
  updateAgentConfig: async (data: Partial<AgentConfig>) => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      await settingsApi.saveConfig({ ...configWithoutRaw, agent: data });
      await settingsApi.restartGateway();
      set({ agentConfig: data as AgentConfig, isSaving: false, successMessage: 'Agent 配置已保存，Gateway 已重启' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新终端配置
  updateTerminalConfig: async (data: Partial<TerminalConfig>) => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      await settingsApi.saveConfig({ ...configWithoutRaw, terminal: data });
      set({ terminalConfig: data as TerminalConfig, isSaving: false, successMessage: '终端配置已保存' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新压缩配置
  updateCompressionConfig: async (data: Partial<CompressionConfig>) => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      await settingsApi.saveConfig({ ...configWithoutRaw, compression: data });
      set({ compressionConfig: data as CompressionConfig, isSaving: false, successMessage: '压缩配置已保存' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新检查点配置
  updateCheckpointConfig: async (data: Partial<CheckpointConfig>) => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      await settingsApi.saveConfig({ ...configWithoutRaw, checkpoint: data });
      set({ checkpointConfig: data as CheckpointConfig, isSaving: false, successMessage: '检查点配置已保存' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新原始 YAML 配置 (pass raw YAML string, not JSON.parse)
  updateRawYaml: async (yaml: string) => {
    set({ isSaving: true, error: null });
    try {
      await settingsApi.saveConfig({ raw: yaml });
      set({ rawYaml: yaml, isSaving: false, successMessage: '配置已保存' });
      // Refresh all configs
      await get().fetchAllConfigs();
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新 Memory 配置
  updateMemoryConfig: async (data: Partial<MemoryConfig>) => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      await settingsApi.saveConfig({ ...configWithoutRaw, memory: data });
      set({ memoryConfig: data as MemoryConfig, isSaving: false, successMessage: 'Memory 配置已保存' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新 Auxiliary 任务配置
  updateAuxiliaryTaskConfig: async (taskType: AuxiliaryTaskType, data: AuxiliaryTaskConfig) => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      const currentAuxiliary = configWithoutRaw.auxiliary || {};
      await settingsApi.saveConfig({ ...configWithoutRaw, auxiliary: { ...currentAuxiliary, [taskType]: data } });
      set({ auxiliaryConfig: { ...get().auxiliaryConfig, [taskType]: data } as AuxiliaryConfig, isSaving: false, successMessage: 'Auxiliary 任务配置已保存' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 删除 Auxiliary 任务配置
  deleteAuxiliaryTaskConfig: async (taskType: AuxiliaryTaskType) => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      const currentAuxiliary = configWithoutRaw.auxiliary || {};
      const newAuxiliary = { ...currentAuxiliary };
      delete newAuxiliary[taskType];
      await settingsApi.saveConfig({ ...configWithoutRaw, auxiliary: newAuxiliary });
      set({ auxiliaryConfig: newAuxiliary as AuxiliaryConfig, isSaving: false, successMessage: 'Auxiliary 任务配置已删除' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新 Providers 配置
  updateProvidersConfig: async (data: Partial<ProvidersConfig>) => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      await settingsApi.saveConfig({ ...configWithoutRaw, providers: data });
      set({ providersConfig: data as ProvidersConfig, isSaving: false, successMessage: 'Providers 配置已保存' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 添加自定义 Provider
  addCustomProvider: async (provider: { name: string; base_url: string; api_key?: string; model?: string }) => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      const currentProviders = configWithoutRaw.providers || { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} };
      const newCustomProviders = [...(currentProviders.custom_providers || []), provider];
      await settingsApi.saveConfig({ ...configWithoutRaw, providers: { ...currentProviders, custom_providers: newCustomProviders } });
      set({ providersConfig: { ...get().providersConfig, custom_providers: newCustomProviders } as ProvidersConfig, isSaving: false, successMessage: '自定义 Provider 已添加' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新自定义 Provider
  updateCustomProvider: async (index: number, provider: { name: string; base_url: string; api_key?: string; model?: string }) => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      const currentProviders = configWithoutRaw.providers || { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} };
      const newCustomProviders = [...(currentProviders.custom_providers || [])];
      newCustomProviders[index] = provider;
      await settingsApi.saveConfig({ ...configWithoutRaw, providers: { ...currentProviders, custom_providers: newCustomProviders } });
      set({ providersConfig: { ...get().providersConfig, custom_providers: newCustomProviders } as ProvidersConfig, isSaving: false, successMessage: '自定义 Provider 已更新' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 删除自定义 Provider
  deleteCustomProvider: async (index: number) => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      const currentProviders = configWithoutRaw.providers || { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} };
      const newCustomProviders = [...(currentProviders.custom_providers || [])];
      newCustomProviders.splice(index, 1);
      await settingsApi.saveConfig({ ...configWithoutRaw, providers: { ...currentProviders, custom_providers: newCustomProviders } });
      set({ providersConfig: { ...get().providersConfig, custom_providers: newCustomProviders } as ProvidersConfig, isSaving: false, successMessage: '自定义 Provider 已删除' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 添加备用 Provider
  addFallbackProvider: async (provider: { name: string; model?: string; priority?: number }) => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      const currentProviders = configWithoutRaw.providers || { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} };
      const newFallbackProviders = [...(currentProviders.fallback_providers || []), provider];
      await settingsApi.saveConfig({ ...configWithoutRaw, providers: { ...currentProviders, fallback_providers: newFallbackProviders } });
      set({ providersConfig: { ...get().providersConfig, fallback_providers: newFallbackProviders } as ProvidersConfig, isSaving: false, successMessage: '备用 Provider 已添加' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 删除备用 Provider
  deleteFallbackProvider: async (index: number) => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      const currentProviders = configWithoutRaw.providers || { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} };
      const newFallbackProviders = [...(currentProviders.fallback_providers || [])];
      newFallbackProviders.splice(index, 1);
      await settingsApi.saveConfig({ ...configWithoutRaw, providers: { ...currentProviders, fallback_providers: newFallbackProviders } });
      set({ providersConfig: { ...get().providersConfig, fallback_providers: newFallbackProviders } as ProvidersConfig, isSaving: false, successMessage: '备用 Provider 已删除' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新凭据池策略
  updateCredentialPoolStrategy: async (provider: string, strategy: 'fill_first' | 'round_robin' | 'least_used' | 'random') => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      const currentProviders = configWithoutRaw.providers || { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} };
      const newStrategies = { ...(currentProviders.credential_pool_strategies || {}), [provider]: strategy };
      await settingsApi.saveConfig({ ...configWithoutRaw, providers: { ...currentProviders, credential_pool_strategies: newStrategies } });
      set({ providersConfig: { ...get().providersConfig, credential_pool_strategies: newStrategies } as ProvidersConfig, isSaving: false, successMessage: '凭据池策略已更新' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新 Display 配置
  updateDisplayConfig: async (data: Partial<DisplayConfig>) => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      await settingsApi.saveConfig({ ...configWithoutRaw, display: data });
      set({ displayConfig: data as DisplayConfig, isSaving: false, successMessage: 'Display 配置已保存' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: (err as Error).message, isSaving: false });
    }
  },

  // 更新 Approval 配置
  updateApprovalConfig: async (data: Partial<ApprovalConfig>) => {
    set({ isSaving: true, error: null });
    try {
      const currentConfig = await settingsApi.loadConfig();
      const { raw: _raw, ...configWithoutRaw } = currentConfig;
      await settingsApi.saveConfig({ ...configWithoutRaw, approval: data });
      set({ approvalConfig: data as ApprovalConfig, isSaving: false, successMessage: '审批配置已保存' });
      setTimeout(() => set({ successMessage: null }), 3000);
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
      await settingsApi.saveConfig(data);

      // 刷新配置
      await get().fetchAllConfigs();
      set({ isSaving: false, successMessage: '配置导入成功' });
      setTimeout(() => set({ successMessage: null }), 3000);
    } catch (err) {
      set({ error: `导入失败: ${(err as Error).message}`, isSaving: false });
    }
  },
}));
