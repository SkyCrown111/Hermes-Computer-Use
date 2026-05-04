// Update API Service
// Updater plugin is currently disabled (no signing key configured).
// This module provides stub implementations that report "not configured".

import { getVersion } from '@tauri-apps/api/app';
import { logger } from '../lib/logger';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  newVersion?: string;
  releaseDate?: string;
  releaseNotes?: string;
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'ready' | 'uptodate' | 'error';
  error?: string;
  downloadProgress?: number; // 0-100
  downloadedBytes?: number;
  totalBytes?: number;
}

export type ProgressCallback = (progress: UpdateInfo) => void;

let _currentVersion: string | null = null;

/**
 * Get the current application version
 */
export async function getCurrentVersion(): Promise<string> {
  if (_currentVersion) return _currentVersion;
  try {
    _currentVersion = await getVersion();
    return _currentVersion;
  } catch (error) {
    logger.debug('[Update] getCurrentVersion failed, using fallback:', error);
    _currentVersion = '0.1.1';
    return _currentVersion;
  }
}

/**
 * Check for updates.
 * Currently returns "not configured" because the updater plugin is disabled.
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  return {
    available: false,
    currentVersion: await getCurrentVersion(),
    status: 'error',
    error: 'Auto-update is not configured. Please update manually.',
  };
}

/**
 * Install the pending update.
 * Currently throws because the updater plugin is disabled.
 */
export async function installPendingUpdate(_onProgress?: ProgressCallback): Promise<void> {
  throw new Error('Auto-update is not configured. Please update manually.');
}

/**
 * Reset cached state (useful for testing).
 */
export function _resetState(): void {
  _currentVersion = null;
}
