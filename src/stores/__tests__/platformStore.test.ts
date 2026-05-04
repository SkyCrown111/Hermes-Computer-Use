// Platform Store Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePlatformStore } from '../platformStore';
import * as platformApi from '../../services/platformApi';

// Mock the platform API
vi.mock('../../services/platformApi', () => ({
  platformApi: {
    getPlatforms: vi.fn(),
    updatePlatformConfig: vi.fn(),
    enablePlatform: vi.fn(),
    disablePlatform: vi.fn(),
    testConnection: vi.fn(),
    reconnect: vi.fn(),
  },
}));

// Helper to create valid mock Platform
const createMockPlatform = (overrides: Partial<{
  type: 'telegram' | 'discord' | 'slack';
  name: string;
  description: string;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  enabled: boolean;
  config: Record<string, unknown>;
}> = {}) => ({
  type: 'telegram' as const,
  name: 'Telegram',
  description: 'Telegram Bot Platform',
  status: 'disconnected' as const,
  enabled: false,
  config: {},
  ...overrides,
});

describe('PlatformStore', () => {
  beforeEach(() => {
    // Reset store to default state
    usePlatformStore.setState({
      platforms: [],
      isLoading: false,
      selectedPlatform: null,
      isConfigModalOpen: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  describe('fetchPlatforms', () => {
    it('should fetch and set platforms', async () => {
      const mockPlatforms = [
        createMockPlatform({ type: 'telegram', name: 'Telegram', status: 'connected', enabled: true }),
        createMockPlatform({ type: 'discord', name: 'Discord', status: 'disconnected', enabled: false }),
      ];
      vi.mocked(platformApi.platformApi.getPlatforms).mockResolvedValue(mockPlatforms);

      await usePlatformStore.getState().fetchPlatforms();

      const state = usePlatformStore.getState();
      expect(state.platforms).toHaveLength(2);
      expect(state.isLoading).toBe(false);
    });

    it('should use default platforms on fetch error', async () => {
      vi.mocked(platformApi.platformApi.getPlatforms).mockRejectedValue(new Error('Network error'));

      await usePlatformStore.getState().fetchPlatforms();

      const state = usePlatformStore.getState();
      // Should have default platforms
      expect(state.platforms.length).toBeGreaterThan(0);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('selectPlatform', () => {
    it('should set selected platform', () => {
      usePlatformStore.getState().selectPlatform('telegram');
      expect(usePlatformStore.getState().selectedPlatform).toBe('telegram');
    });

    it('should clear selected platform when null', () => {
      usePlatformStore.getState().selectPlatform('telegram');
      usePlatformStore.getState().selectPlatform(null);
      expect(usePlatformStore.getState().selectedPlatform).toBeNull();
    });
  });

  describe('openConfigModal / closeConfigModal', () => {
    it('should open config modal and set selected platform', () => {
      usePlatformStore.getState().openConfigModal('slack');
      const state = usePlatformStore.getState();
      expect(state.selectedPlatform).toBe('slack');
      expect(state.isConfigModalOpen).toBe(true);
    });

    it('should close config modal', () => {
      usePlatformStore.getState().openConfigModal('slack');
      usePlatformStore.getState().closeConfigModal();
      expect(usePlatformStore.getState().isConfigModalOpen).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('should update platform config', async () => {
      // Set up initial platforms
      usePlatformStore.setState({
        platforms: [createMockPlatform({ type: 'telegram', status: 'disconnected' })],
      });

      vi.mocked(platformApi.platformApi.updatePlatformConfig).mockResolvedValue(undefined);

      const result = await usePlatformStore.getState().updateConfig('telegram', { bot_token: 'test' });

      expect(result).toBe(true);
      const platform = usePlatformStore.getState().platforms.find(p => p.type === 'telegram');
      expect(platform?.config).toEqual({ bot_token: 'test' });
    });

    it('should set error on update failure', async () => {
      usePlatformStore.setState({
        platforms: [createMockPlatform({ type: 'telegram' })],
      });

      vi.mocked(platformApi.platformApi.updatePlatformConfig).mockRejectedValue(new Error('Update failed'));

      const result = await usePlatformStore.getState().updateConfig('telegram', { bot_token: 'test' });

      expect(result).toBe(false);
      expect(usePlatformStore.getState().error).toBe('Update failed');
    });
  });

  describe('enablePlatform', () => {
    it('should enable platform and set status to pending', async () => {
      usePlatformStore.setState({
        platforms: [createMockPlatform({ type: 'telegram', status: 'disconnected', enabled: false })],
      });

      vi.mocked(platformApi.platformApi.enablePlatform).mockResolvedValue(undefined);

      const result = await usePlatformStore.getState().enablePlatform('telegram');

      expect(result).toBe(true);
      const platform = usePlatformStore.getState().platforms.find(p => p.type === 'telegram');
      expect(platform?.enabled).toBe(true);
      expect(platform?.status).toBe('pending');
    });
  });

  describe('disablePlatform', () => {
    it('should disable platform and set status to disconnected', async () => {
      usePlatformStore.setState({
        platforms: [createMockPlatform({ type: 'telegram', status: 'connected', enabled: true })],
      });

      vi.mocked(platformApi.platformApi.disablePlatform).mockResolvedValue(undefined);

      const result = await usePlatformStore.getState().disablePlatform('telegram');

      expect(result).toBe(true);
      const platform = usePlatformStore.getState().platforms.find(p => p.type === 'telegram');
      expect(platform?.enabled).toBe(false);
      expect(platform?.status).toBe('disconnected');
    });
  });

  describe('testConnection', () => {
    it('should return ok and update status on success', async () => {
      usePlatformStore.setState({
        platforms: [createMockPlatform({ type: 'telegram', status: 'pending', enabled: true })],
      });

      vi.mocked(platformApi.platformApi.testConnection).mockResolvedValue({ ok: true });

      const result = await usePlatformStore.getState().testConnection('telegram');

      expect(result.ok).toBe(true);
      const platform = usePlatformStore.getState().platforms.find(p => p.type === 'telegram');
      expect(platform?.status).toBe('connected');
    });

    it('should return error on failure', async () => {
      vi.mocked(platformApi.platformApi.testConnection).mockRejectedValue(new Error('Connection failed'));

      const result = await usePlatformStore.getState().testConnection('telegram');

      expect(result.ok).toBe(false);
      expect(result.message).toBe('Connection failed');
    });
  });

  describe('reconnect', () => {
    it('should set status to pending on reconnect', async () => {
      usePlatformStore.setState({
        platforms: [createMockPlatform({ type: 'telegram', status: 'error', enabled: true })],
      });

      vi.mocked(platformApi.platformApi.reconnect).mockResolvedValue(undefined);

      const result = await usePlatformStore.getState().reconnect('telegram');

      expect(result).toBe(true);
      const platform = usePlatformStore.getState().platforms.find(p => p.type === 'telegram');
      expect(platform?.status).toBe('pending');
    });
  });
});
