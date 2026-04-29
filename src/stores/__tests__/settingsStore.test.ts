// Settings Store Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from '../settingsStore';

// Mock the settings API - settingsApi.ts uses named exports (export async function ...)
vi.mock('../../services/settingsApi', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  restartGateway: vi.fn(),
}));

import * as settingsApi from '../../services/settingsApi';

describe('SettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
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
    });
    vi.clearAllMocks();
  });

  describe('fetchAllConfigs', () => {
    it('should fetch all configs in one call', async () => {
      const mockConfig = {
        model: { default: 'gpt-4', provider: 'openai', api_key: 'key', base_url: '' },
        agent: { max_turns: 100, timeout: 300, reasoning_effort: 'medium' as const },
        terminal: { backend: 'local' as const, timeout: 180, cwd: '' },
        compression: { enabled: true, threshold: 0.8, target_ratio: 0.5 },
        checkpoint: { enabled: true, max_snapshots: 10 },
        raw: 'model:\n  default: gpt-4',
      };
      vi.mocked(settingsApi.loadConfig).mockResolvedValue(mockConfig as any);

      await useSettingsStore.getState().fetchAllConfigs();

      const state = useSettingsStore.getState();
      expect(state.modelConfig).toEqual(mockConfig.model);
      expect(state.agentConfig).toEqual(mockConfig.agent);
      expect(state.terminalConfig).toEqual(mockConfig.terminal);
      expect(state.compressionConfig).toEqual(mockConfig.compression);
      expect(state.checkpointConfig).toEqual(mockConfig.checkpoint);
    });

    it('should set error on fetch failure', async () => {
      vi.mocked(settingsApi.loadConfig).mockRejectedValue(new Error('Load failed'));

      await useSettingsStore.getState().fetchAllConfigs();

      expect(useSettingsStore.getState().error).toBe('Load failed');
    });
  });

  describe('fetchModelConfig', () => {
    it('should fetch model config', async () => {
      vi.mocked(settingsApi.loadConfig).mockResolvedValue({
        model: { default: 'claude', provider: 'anthropic' },
      } as any);

      await useSettingsStore.getState().fetchModelConfig();

      const state = useSettingsStore.getState();
      expect(state.modelConfig).not.toBeNull();
      expect(state.modelConfig?.default).toBe('claude');
    });
  });

  describe('fetchAgentConfig', () => {
    it('should fetch agent config', async () => {
      vi.mocked(settingsApi.loadConfig).mockResolvedValue({
        agent: { max_turns: 50, timeout: 600 },
      } as any);

      await useSettingsStore.getState().fetchAgentConfig();

      const state = useSettingsStore.getState();
      expect(state.agentConfig?.max_turns).toBe(50);
      expect(state.agentConfig?.timeout).toBe(600);
    });
  });

  describe('updateModelConfig', () => {
    it('should update model config and restart gateway', async () => {
      vi.mocked(settingsApi.loadConfig).mockResolvedValue({} as any);
      vi.mocked(settingsApi.saveConfig).mockResolvedValue({ ok: true });
      vi.mocked(settingsApi.restartGateway).mockResolvedValue({ ok: true });

      await useSettingsStore.getState().updateModelConfig({ default: 'gpt-4o' });

      expect(settingsApi.saveConfig).toHaveBeenCalled();
      expect(settingsApi.restartGateway).toHaveBeenCalled();
      expect(useSettingsStore.getState().modelConfig?.default).toBe('gpt-4o');
    });

    it('should set error on update failure', async () => {
      vi.mocked(settingsApi.loadConfig).mockRejectedValue(new Error('Update failed'));

      await useSettingsStore.getState().updateModelConfig({ default: 'test' });

      expect(useSettingsStore.getState().error).toBe('Update failed');
    });
  });

  describe('updateAgentConfig', () => {
    it('should update agent config', async () => {
      vi.mocked(settingsApi.loadConfig).mockResolvedValue({} as any);
      vi.mocked(settingsApi.saveConfig).mockResolvedValue({ ok: true });
      vi.mocked(settingsApi.restartGateway).mockResolvedValue({ ok: true });

      await useSettingsStore.getState().updateAgentConfig({ max_turns: 200 });

      expect(useSettingsStore.getState().agentConfig?.max_turns).toBe(200);
    });
  });

  describe('updateTerminalConfig', () => {
    it('should update terminal config without restart', async () => {
      vi.mocked(settingsApi.loadConfig).mockResolvedValue({} as any);
      vi.mocked(settingsApi.saveConfig).mockResolvedValue({ ok: true });

      await useSettingsStore.getState().updateTerminalConfig({ backend: 'docker' });

      expect(useSettingsStore.getState().terminalConfig?.backend).toBe('docker');
      expect(settingsApi.restartGateway).not.toHaveBeenCalled();
    });
  });

  describe('setEditMode', () => {
    it('should set edit mode to yaml', async () => {
      vi.mocked(settingsApi.loadConfig).mockResolvedValue({ raw: 'test: value' } as any);

      useSettingsStore.getState().setEditMode('yaml');

      expect(useSettingsStore.getState().editMode).toBe('yaml');
    });

    it('should set edit mode to form', () => {
      useSettingsStore.getState().setEditMode('form');
      expect(useSettingsStore.getState().editMode).toBe('form');
    });
  });

  describe('setRawYaml', () => {
    it('should set raw yaml content', () => {
      useSettingsStore.getState().setRawYaml('test: value');
      expect(useSettingsStore.getState().rawYaml).toBe('test: value');
    });
  });

  describe('exportConfig', () => {
    it('should export config as JSON', async () => {
      useSettingsStore.setState({
        modelConfig: { default: 'gpt-4', provider: 'openai', api_key: '', base_url: '' },
        agentConfig: { max_turns: 100, timeout: 300, reasoning_effort: 'medium' },
        terminalConfig: { backend: 'local', timeout: 180, cwd: '' },
        compressionConfig: { enabled: true, threshold: 0.8, target_ratio: 0.5 },
        checkpointConfig: { enabled: true, max_snapshots: 10 },
      });

      const json = await useSettingsStore.getState().exportConfig();

      const parsed = JSON.parse(json);
      expect(parsed.model.default).toBe('gpt-4');
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.exported_at).toBeDefined();
    });
  });

  describe('importConfig', () => {
    it('should import config from JSON', async () => {
      vi.mocked(settingsApi.saveConfig).mockResolvedValue({ ok: true });
      vi.mocked(settingsApi.loadConfig).mockResolvedValue({
        model: { default: 'imported', provider: 'auto' },
      } as any);

      const json = JSON.stringify({
        model: { default: 'imported', provider: 'auto', api_key: '', base_url: '' },
      });

      await useSettingsStore.getState().importConfig(json);

      expect(settingsApi.saveConfig).toHaveBeenCalled();
    });

    it('should set error on invalid JSON', async () => {
      await useSettingsStore.getState().importConfig('invalid json');

      expect(useSettingsStore.getState().error).toContain('导入失败');
    });
  });

  describe('clearError', () => {
    it('should clear error', () => {
      useSettingsStore.setState({ error: 'Error' });
      useSettingsStore.getState().clearError();
      expect(useSettingsStore.getState().error).toBeNull();
    });
  });

  describe('clearSuccessMessage', () => {
    it('should clear success message', () => {
      useSettingsStore.setState({ successMessage: 'Success' });
      useSettingsStore.getState().clearSuccessMessage();
      expect(useSettingsStore.getState().successMessage).toBeNull();
    });
  });
});
