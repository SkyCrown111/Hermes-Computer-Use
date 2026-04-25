// Settings Store - 系统配置状态管理

import { create } from 'zustand';
import type {
  ModelConfig,
  AgentConfig,
  TerminalConfig,
  CompressionConfig,
  CheckpointConfig,
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
  rawYaml: '',
  isLoadingRaw: false,
  editMode: 'form',
  error: null,
  successMessage: null,
  isSaving: false,

  // 获取所有配置
  fetchAllConfigs: async () => {
    const state = get();
    await Promise.all([
      state.fetchModelConfig(),
      state.fetchAgentConfig(),
      state.fetchTerminalConfig(),
      state.fetchCompressionConfig(),
      state.fetchCheckpointConfig(),
    ]);
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

  // 更新原始 YAML 配置
  updateRawYaml: async (yaml: string) => {
    set({ isSaving: true, error: null });
    try {
      const config = JSON.parse(yaml);
      await settingsApi.saveConfig(config);
      set({ rawYaml: yaml, isSaving: false, successMessage: '配置已保存' });
      // 刷新所有配置
      get().fetchAllConfigs();
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
