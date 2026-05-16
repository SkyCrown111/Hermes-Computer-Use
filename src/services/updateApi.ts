// Update API — Tauri updater plugin with GitHub Releases fallback

import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauri } from '../lib/tauri';
import { logger } from '../lib/logger';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  newVersion?: string;
  releaseDate?: string;
  releaseNotes?: string;
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'ready' | 'uptodate' | 'error';
  error?: string;
  downloadProgress?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  /** When true, only GitHub release page is available (no signed updater bundle yet). */
  manualDownloadOnly?: boolean;
  releaseUrl?: string;
}

export type ProgressCallback = (progress: UpdateInfo) => void;

interface GitHubUpdateCheck {
  currentVersion: string;
  latestVersion?: string;
  available: boolean;
  releaseUrl: string;
  releaseNotes?: string;
  publishedAt?: string;
}

const DEFAULT_RELEASE_URL = 'https://github.com/SkyCrown111/Hermes-Computer-Use/releases/latest';

let _currentVersion: string | null = null;
let _pendingUpdate: Update | null = null;
let _lastReleaseUrl: string = DEFAULT_RELEASE_URL;

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

async function checkViaGitHub(currentVersion: string): Promise<UpdateInfo> {
  if (!isTauri()) {
    return {
      available: false,
      currentVersion,
      status: 'error',
      error: 'Update check requires the desktop app.',
    };
  }

  try {
    const gh = await invoke<GitHubUpdateCheck>('check_github_release');
    _lastReleaseUrl = gh.releaseUrl || DEFAULT_RELEASE_URL;

    if (!gh.available) {
      return {
        available: false,
        currentVersion: gh.currentVersion || currentVersion,
        status: 'uptodate',
      };
    }

    return {
      available: true,
      currentVersion: gh.currentVersion || currentVersion,
      newVersion: gh.latestVersion,
      releaseDate: gh.publishedAt,
      releaseNotes: gh.releaseNotes,
      releaseUrl: _lastReleaseUrl,
      manualDownloadOnly: true,
      status: 'available',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      currentVersion,
      status: 'error',
      error: message,
    };
  }
}

/**
 * Check for updates (signed Tauri updater first, then GitHub Releases API).
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  const currentVersion = await getCurrentVersion();
  _pendingUpdate = null;

  if (!isTauri()) {
    return checkViaGitHub(currentVersion);
  }

  try {
    const update = await check();
    if (!update) {
      return {
        available: false,
        currentVersion,
        status: 'uptodate',
      };
    }

    _pendingUpdate = update;
    return {
      available: true,
      currentVersion,
      newVersion: update.version,
      releaseDate: update.date,
      releaseNotes: update.body ?? undefined,
      status: 'available',
      manualDownloadOnly: false,
    };
  } catch (err) {
    logger.warn('[Update] Tauri updater check failed, using GitHub API:', err);
    return checkViaGitHub(currentVersion);
  }
}

/**
 * Download and install a pending update, or open the release page when only manual download is available.
 */
export async function installPendingUpdate(onProgress?: ProgressCallback): Promise<void> {
  const currentVersion = await getCurrentVersion();

  if (_pendingUpdate) {
    const update = _pendingUpdate;
    let downloaded = 0;
    let contentLength = 0;

    const base: UpdateInfo = {
      available: true,
      currentVersion,
      newVersion: update.version,
      status: 'downloading',
    };

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          contentLength = event.data.contentLength ?? 0;
          onProgress?.({
            ...base,
            status: 'downloading',
            downloadProgress: 0,
            downloadedBytes: 0,
            totalBytes: contentLength || undefined,
          });
          break;
        case 'Progress':
          downloaded += event.data.chunkLength;
          onProgress?.({
            ...base,
            status: 'downloading',
            downloadProgress:
              contentLength > 0 ? Math.min(100, Math.round((downloaded / contentLength) * 100)) : undefined,
            downloadedBytes: downloaded,
            totalBytes: contentLength || undefined,
          });
          break;
        case 'Finished':
          _pendingUpdate = null;
          onProgress?.({
            ...base,
            status: 'ready',
            downloadProgress: 100,
          });
          break;
      }
    });
    return;
  }

  await openUpdateReleasePage();
  throw new Error('MANUAL_DOWNLOAD_OPENED');
}

/** Open the latest GitHub release page in the system browser. */
export async function openUpdateReleasePage(url?: string): Promise<void> {
  await openUrl(url ?? _lastReleaseUrl ?? DEFAULT_RELEASE_URL);
}

export function _resetState(): void {
  _currentVersion = null;
  _pendingUpdate = null;
  _lastReleaseUrl = DEFAULT_RELEASE_URL;
}
