// Settings Store Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from '../settingsStore';

// Mock the settings API - settingsApi.ts uses named exports (export async function ...)
vi.mock('../../services/settingsApi', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  validateConfigSection: vi.fn(),
  updateConfigSection: vi.fn(),
  getConfigSection: vi.fn(),
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
        memory: { enabled: true, max_chars: 5000 },
        providers: { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} },
        display: { compact: true, skin: 'dark', streaming: false },
        approval: { mode: 'ask', safe_commands: [], dangerous_commands: [] },
        auxiliary: { vision: { provider: 'openai', model: 'gpt-4o', base_url: '', api_key: '' } },
        raw: 'model:\n  default: gpt-4',
      };
      vi.mocked(settingsApi.loadConfig).mockResolvedValue(mockConfig);

      await useSettingsStore.getState().fetchAllConfigs();

      const state = useSettingsStore.getState();
      expect(state.modelConfig).toEqual(mockConfig.model);
      expect(state.agentConfig).toEqual(mockConfig.agent);
      expect(state.terminalConfig).toEqual(mockConfig.terminal);
      expect(state.compressionConfig).toEqual(mockConfig.compression);
      expect(state.checkpointConfig).toEqual(mockConfig.checkpoint);
      expect(state.memoryConfig?.max_chars).toBe(5000);
      expect(state.displayConfig?.compact).toBe(true);
      expect(state.approvalConfig?.mode).toBe('ask');
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
      });

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
      });

      await useSettingsStore.getState().fetchAgentConfig();

      const state = useSettingsStore.getState();
      expect(state.agentConfig?.max_turns).toBe(50);
      expect(state.agentConfig?.timeout).toBe(600);
    });
  });

  describe('updateModelConfig', () => {
    it('should validate then update model config', async () => {
      vi.mocked(settingsApi.validateConfigSection).mockResolvedValue({ valid: true, errors: [] });
      vi.mocked(settingsApi.updateConfigSection).mockResolvedValue({ ok: true, section: 'model', data: {} });

      await useSettingsStore.getState().updateModelConfig({ default: 'gpt-4o' });

      expect(settingsApi.validateConfigSection).toHaveBeenCalledWith('model', expect.objectContaining({ default: 'gpt-4o' }));
      expect(settingsApi.updateConfigSection).toHaveBeenCalledWith('model', expect.objectContaining({ default: 'gpt-4o' }));
      expect(useSettingsStore.getState().modelConfig?.default).toBe('gpt-4o');
    });

    it('should set error on update failure', async () => {
      vi.mocked(settingsApi.validateConfigSection).mockResolvedValue({ valid: true, errors: [] });
      vi.mocked(settingsApi.updateConfigSection).mockRejectedValue(new Error('Update failed'));

      await useSettingsStore.getState().updateModelConfig({ default: 'test' });

      expect(useSettingsStore.getState().error).toBe('Update failed');
    });
  });

  describe('updateAgentConfig', () => {
    it('should update agent config', async () => {
      vi.mocked(settingsApi.validateConfigSection).mockResolvedValue({ valid: true, errors: [] });
      vi.mocked(settingsApi.updateConfigSection).mockResolvedValue({ ok: true, section: 'agent', data: {} });

      await useSettingsStore.getState().updateAgentConfig({ max_turns: 200 });

      expect(settingsApi.validateConfigSection).toHaveBeenCalledWith('agent', expect.objectContaining({ max_turns: 200 }));
      expect(settingsApi.updateConfigSection).toHaveBeenCalledWith('agent', expect.objectContaining({ max_turns: 200 }));
      expect(useSettingsStore.getState().agentConfig?.max_turns).toBe(200);
    });
  });

  describe('updateTerminalConfig', () => {
    it('should update terminal config', async () => {
      vi.mocked(settingsApi.validateConfigSection).mockResolvedValue({ valid: true, errors: [] });
      vi.mocked(settingsApi.updateConfigSection).mockResolvedValue({ ok: true, section: 'terminal', data: {} });

      await useSettingsStore.getState().updateTerminalConfig({ backend: 'docker' });

      expect(settingsApi.validateConfigSection).toHaveBeenCalledWith('terminal', expect.objectContaining({ backend: 'docker' }));
      expect(settingsApi.updateConfigSection).toHaveBeenCalledWith('terminal', expect.objectContaining({ backend: 'docker' }));
      expect(useSettingsStore.getState().terminalConfig?.backend).toBe('docker');
    });
  });

  describe('setEditMode', () => {
    it('should set edit mode to yaml', async () => {
      vi.mocked(settingsApi.loadConfig).mockResolvedValue({ raw: 'test: value' });

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
      });

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

  describe('additional section updates', () => {
    beforeEach(() => {
      vi.mocked(settingsApi.validateConfigSection).mockResolvedValue({ valid: true, section: 'x' });
      vi.mocked(settingsApi.updateConfigSection).mockResolvedValue({ ok: true, section: 'x', data: {} });
    });

    it('should update compression config', async () => {
      await useSettingsStore.getState().updateCompressionConfig({ enabled: false, threshold: 0.9, target_ratio: 0.4 });
      expect(useSettingsStore.getState().compressionConfig?.enabled).toBe(false);
    });

    it('should update checkpoint config', async () => {
      await useSettingsStore.getState().updateCheckpointConfig({ enabled: true, max_snapshots: 5 });
      expect(useSettingsStore.getState().checkpointConfig?.max_snapshots).toBe(5);
    });

    it('should update memory config', async () => {
      await useSettingsStore.getState().updateMemoryConfig({ enabled: true, max_chars: 1000 });
      expect(useSettingsStore.getState().memoryConfig?.max_chars).toBe(1000);
    });

    it('should update display and approval config', async () => {
      await useSettingsStore.getState().updateDisplayConfig({ language: 'en', theme: 'dark' });
      await useSettingsStore.getState().updateApprovalConfig({ enabled: true });

      expect(useSettingsStore.getState().displayConfig?.language).toBe('en');
      expect(useSettingsStore.getState().approvalConfig?.enabled).toBe(true);
    });

    it('should strip masked api key before model update', async () => {
      await useSettingsStore.getState().updateModelConfig({
        default: 'gpt-4',
        provider: 'openai',
        api_key: '__MASKED__1234',
        base_url: '',
      });

      expect(settingsApi.updateConfigSection).toHaveBeenCalledWith(
        'model',
        expect.not.objectContaining({ api_key: '__MASKED__1234' }),
      );
    });

    it('should update raw yaml', async () => {
      vi.mocked(settingsApi.saveConfig).mockResolvedValue({ ok: true });
      vi.mocked(settingsApi.loadConfig).mockResolvedValue({ raw: 'key: value' });

      await useSettingsStore.getState().updateRawYaml('key: value');

      expect(useSettingsStore.getState().rawYaml).toBe('key: value');
    });

    it('should add custom provider via getConfigSection merge', async () => {
      vi.mocked(settingsApi.getConfigSection).mockResolvedValue({
        data: { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} },
      });

      await useSettingsStore.getState().addCustomProvider({
        name: 'local',
        base_url: 'http://localhost:11434',
      });

      expect(settingsApi.updateConfigSection).toHaveBeenCalledWith(
        'providers',
        expect.objectContaining({
          custom_providers: [expect.objectContaining({ name: 'local' })],
        }),
      );
    });

    it('fetchCompressionConfig loads section', async () => {
      vi.mocked(settingsApi.loadConfig).mockResolvedValue({
        compression: { enabled: true, threshold: 0.7, target_ratio: 0.5 },
      });

      await useSettingsStore.getState().fetchCompressionConfig();

      expect(useSettingsStore.getState().compressionConfig?.threshold).toBe(0.7);
    });

    it('updates auxiliary task config', async () => {
      vi.mocked(settingsApi.getConfigSection).mockResolvedValue({
        data: { vision: { enabled: false } },
      });

      await useSettingsStore.getState().updateAuxiliaryTaskConfig('vision', {
        provider: 'openai',
        model: 'gpt-4o',
        base_url: 'https://api.openai.com',
        api_key: 'sk-test',
      });

      expect(useSettingsStore.getState().auxiliaryConfig?.vision?.model).toBe('gpt-4o');
    });

    it('deletes auxiliary task config', async () => {
      vi.mocked(settingsApi.getConfigSection).mockResolvedValue({
        data: {
          vision: {
            provider: 'openai',
            model: 'gpt-4o',
            base_url: 'https://api.openai.com',
            api_key: 'sk-test',
          },
        },
      });

      await useSettingsStore.getState().deleteAuxiliaryTaskConfig('vision');

      expect(useSettingsStore.getState().auxiliaryConfig?.vision).toBeUndefined();
    });

    it('manages fallback providers', async () => {
      vi.mocked(settingsApi.getConfigSection).mockResolvedValue({
        data: { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} },
      });

      await useSettingsStore.getState().addFallbackProvider({ name: 'backup', priority: 2 });
      await useSettingsStore.getState().deleteFallbackProvider(0);

      expect(settingsApi.updateConfigSection).toHaveBeenCalled();
    });

    it('updates credential pool strategy', async () => {
      vi.mocked(settingsApi.getConfigSection).mockResolvedValue({
        data: { custom_providers: [], fallback_providers: [], credential_pool_strategies: {} },
      });

      await useSettingsStore.getState().updateCredentialPoolStrategy('openai', 'round_robin');

      expect(useSettingsStore.getState().providersConfig?.credential_pool_strategies?.openai).toBe('round_robin');
    });

    it('updates and deletes custom provider', async () => {
      vi.mocked(settingsApi.getConfigSection).mockResolvedValue({
        data: {
          custom_providers: [{ name: 'local', base_url: 'http://localhost' }],
          fallback_providers: [],
          credential_pool_strategies: {},
        },
      });

      await useSettingsStore.getState().updateCustomProvider(0, {
        name: 'local-v2',
        base_url: 'http://127.0.0.1:11434',
      });
      await useSettingsStore.getState().deleteCustomProvider(0);

      expect(settingsApi.updateConfigSection).toHaveBeenCalled();
    });

    it('fetchCheckpointConfig and fetchRawYaml', async () => {
      vi.mocked(settingsApi.loadConfig).mockResolvedValue({
        checkpoint: { enabled: true, max_snapshots: 8 },
        raw: 'key: value',
      });

      await useSettingsStore.getState().fetchCheckpointConfig();
      await useSettingsStore.getState().fetchRawYaml();

      expect(useSettingsStore.getState().checkpointConfig?.max_snapshots).toBe(8);
      expect(useSettingsStore.getState().rawYaml).toBe('key: value');
    });
  });
});
