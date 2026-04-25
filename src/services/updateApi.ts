// Update API Service - Tauri Updater Plugin

import { check, type Update, type DownloadEvent } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';
import { logger } from '../lib/logger';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  newVersion?: string;
  releaseDate?: string;
  releaseNotes?: string;
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'uptodate' | 'error';
  error?: string;
}

export type ProgressCallback = (progress: number) => void;

let _currentVersion: string | null = null;
let _pendingUpdate: Update | null = null;

/**
 * Get the current application version
 */
export async function getCurrentVersion(): Promise<string> {
  if (_currentVersion) return _currentVersion;
  try {
    _currentVersion = await getVersion();
    return _currentVersion;
  } catch {
    _currentVersion = '0.1.1';
    return _currentVersion;
  }
}

/**
 * Check for updates. Stores the Update instance internally for later install.
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  try {
    const currentVersion = await getCurrentVersion();
    _pendingUpdate = await check();

    if (!_pendingUpdate) {
      return {
        available: false,
        currentVersion,
        status: 'uptodate',
      };
    }

    return {
      available: true,
      currentVersion,
      newVersion: _pendingUpdate.version,
      releaseDate: _pendingUpdate.date,
      releaseNotes: _pendingUpdate.body,
      status: 'available',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check for updates';
    logger.error('[UpdateApi] Check failed:', error);
    return {
      available: false,
      currentVersion: await getCurrentVersion(),
      status: 'error',
      error: message,
    };
  }
}

/**
 * Install the pending update (stored from the last check).
 */
export async function installPendingUpdate(
  onProgress?: ProgressCallback
): Promise<void> {
  if (!_pendingUpdate) {
    throw new Error('No pending update to install. Call checkForUpdates first.');
  }

  logger.info('[UpdateApi] Downloading update...');

  await _pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === 'Progress' && onProgress) {
      onProgress(event.data.chunkLength);
    }
  });

  _pendingUpdate = null;
  logger.info('[UpdateApi] Update installed successfully');
}

/**
 * Reset cached state (useful for testing).
 */
export function _resetState(): void {
  _currentVersion = null;
  _pendingUpdate = null;
}
