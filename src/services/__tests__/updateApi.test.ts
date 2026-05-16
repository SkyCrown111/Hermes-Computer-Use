// Update API Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('0.1.1'),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}));

vi.mock('../../lib/tauri', () => ({
  isTauri: vi.fn().mockReturnValue(true),
}));

import { invoke } from '@tauri-apps/api/core';
import { check as updaterCheck } from '@tauri-apps/plugin-updater';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  checkForUpdates,
  installPendingUpdate,
  getCurrentVersion,
  openUpdateReleasePage,
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
  });

  describe('checkForUpdates', () => {
    it('should report available update from Tauri updater', async () => {
      vi.mocked(updaterCheck).mockResolvedValue({
        version: '0.2.0',
        date: '2026-01-01',
        body: 'Notes',
        downloadAndInstall: vi.fn(),
      } as never);

      const result = await checkForUpdates();

      expect(result.available).toBe(true);
      expect(result.status).toBe('available');
      expect(result.newVersion).toBe('0.2.0');
      expect(result.manualDownloadOnly).toBe(false);
    });

    it('should report up to date from Tauri updater', async () => {
      vi.mocked(updaterCheck).mockResolvedValue(null);

      const result = await checkForUpdates();

      expect(result.available).toBe(false);
      expect(result.status).toBe('uptodate');
    });

    it('should fall back to GitHub when updater check fails', async () => {
      vi.mocked(updaterCheck).mockRejectedValue(new Error('no latest.json'));
      vi.mocked(invoke).mockResolvedValue({
        currentVersion: '0.1.1',
        latestVersion: '0.2.0',
        available: true,
        releaseUrl: 'https://github.com/SkyCrown111/Hermes-Computer-Use/releases/tag/v0.2.0',
        releaseNotes: 'Bug fixes',
        publishedAt: '2026-05-01T00:00:00Z',
      });

      const result = await checkForUpdates();

      expect(invoke).toHaveBeenCalledWith('check_github_release');
      expect(result.available).toBe(true);
      expect(result.manualDownloadOnly).toBe(true);
      expect(result.newVersion).toBe('0.2.0');
    });
  });

  describe('installPendingUpdate', () => {
    it('should open release page when no pending updater bundle', async () => {
      vi.mocked(updaterCheck).mockRejectedValue(new Error('no latest.json'));
      vi.mocked(invoke).mockResolvedValue({
        currentVersion: '0.1.1',
        latestVersion: '0.2.0',
        available: true,
        releaseUrl: 'https://github.com/example/releases/latest',
      });
      await checkForUpdates();

      await expect(installPendingUpdate()).rejects.toThrow('MANUAL_DOWNLOAD_OPENED');
      expect(openUrl).toHaveBeenCalledWith('https://github.com/example/releases/latest');
    });
  });

  describe('openUpdateReleasePage', () => {
    it('should open default release URL', async () => {
      await openUpdateReleasePage();
      expect(openUrl).toHaveBeenCalled();
    });
  });
});
