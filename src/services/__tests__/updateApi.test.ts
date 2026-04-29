// Update API Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @tauri-apps/plugin-updater
const mockDownloadAndInstall = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}));

// Mock @tauri-apps/api/app
vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('0.1.1'),
}));

import { check } from '@tauri-apps/plugin-updater';
import type { Update } from '@tauri-apps/plugin-updater';
import {
  checkForUpdates,
  installPendingUpdate,
  getCurrentVersion,
  _resetState,
} from '../updateApi';

describe('updateApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_TAURI_UPDATER_PUBKEY', 'test-pubkey');
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
    it('should return uptodate when no update available', async () => {
      vi.mocked(check).mockResolvedValue(null);

      const result = await checkForUpdates();

      expect(result.available).toBe(false);
      expect(result.status).toBe('uptodate');
      expect(result.currentVersion).toBe('0.1.1');
    });

    it('should return update info when update is available', async () => {
      const mockUpdate = {
        version: '0.2.0',
        date: '2026-04-20',
        body: 'Bug fixes and improvements',
        currentVersion: '0.1.1',
        downloadAndInstall: mockDownloadAndInstall,
      };
      vi.mocked(check).mockResolvedValue(mockUpdate as unknown as Update);

      const result = await checkForUpdates();

      expect(result.available).toBe(true);
      expect(result.status).toBe('available');
      expect(result.newVersion).toBe('0.2.0');
      expect(result.releaseDate).toBe('2026-04-20');
      expect(result.releaseNotes).toBe('Bug fixes and improvements');
    });

    it('should return error on check failure', async () => {
      vi.mocked(check).mockRejectedValue(new Error('Network error'));

      const result = await checkForUpdates();

      expect(result.status).toBe('error');
      expect(result.available).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('installPendingUpdate', () => {
    it('should throw if no pending update', async () => {
      await expect(installPendingUpdate()).rejects.toThrow('No pending update');
    });

    it('should install the pending update', async () => {
      const mockUpdate = {
        version: '0.2.0',
        currentVersion: '0.1.1',
        downloadAndInstall: mockDownloadAndInstall,
      };
      vi.mocked(check).mockResolvedValue(mockUpdate as unknown as Update);
      await checkForUpdates();

      await installPendingUpdate();
      expect(mockDownloadAndInstall).toHaveBeenCalledTimes(1);
    });

    it('should pass progress callback', async () => {
      const onProgress = vi.fn();
      const mockUpdate = {
        version: '0.2.0',
        currentVersion: '0.1.1',
        downloadAndInstall: vi.fn().mockImplementation(
          async (callback?: (event: { event: string; data?: { chunkLength: number } }) => void) => {
            if (callback) {
              callback({ event: 'Progress', data: { chunkLength: 1024 } });
            }
          }
        ),
      };
      vi.mocked(check).mockResolvedValue(mockUpdate as unknown as Update);
      await checkForUpdates();

      await installPendingUpdate(onProgress);
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          available: true,
          status: 'downloading',
          downloadedBytes: 1024,
        })
      );
    });
  });
});
