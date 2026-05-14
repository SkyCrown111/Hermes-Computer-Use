// Update API Tests (updater plugin is disabled — tests verify stub behavior)
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @tauri-apps/api/app
vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('0.1.1'),
}));

import {
  checkForUpdates,
  installPendingUpdate,
  getCurrentVersion,
  _resetState,
} from '../updateApi';

describe('updateApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetState();
  });

  describe('getCurrentVersion', () => {
    it('should return the current version', async () => {
      const version = await getCurrentVersion();
      expect(version).toBe('0.1.1');
    });

    it('should return a string version', async () => {
      const version = await getCurrentVersion();
      expect(typeof version).toBe('string');
      expect(version.length).toBeGreaterThan(0);
    });
  });

  describe('checkForUpdates', () => {
    it('should return not configured error', async () => {
      const result = await checkForUpdates();

      expect(result.available).toBe(false);
      expect(result.status).toBe('error');
      expect(result.currentVersion).toBe('0.1.1');
      expect(result.error).toContain('not configured');
    });
  });

  describe('installPendingUpdate', () => {
    it('should throw not configured error', async () => {
      await expect(installPendingUpdate()).rejects.toThrow('not configured');
    });
  });
});
