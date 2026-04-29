import React, { useEffect, useState } from 'react';
import { Button, RefreshIcon, CheckIcon, AlertIcon } from '../../../components';
import { checkForUpdates, installPendingUpdate, type UpdateInfo } from '../../../services/updateApi';
import { logger } from '../../../lib/logger';
import { relaunch } from '@tauri-apps/plugin-process';

const UpdateSection: React.FC<{ t: (key: string) => string }> = ({ t }) => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showRestartPrompt, setShowRestartPrompt] = useState(false);

  const handleCheck = async () => {
    setIsChecking(true);
    setUpdateInfo(null);

    try {
      setUpdateInfo(prev => prev ? { ...prev, status: 'checking' } : null);
      const info = await checkForUpdates();
      setUpdateInfo(info);
    } finally {
      setIsChecking(false);
    }
  };

  const handleInstall = async () => {
    setUpdateInfo(prev => prev ? { ...prev, status: 'downloading' } : null);
    try {
      await installPendingUpdate((progress) => {
        setUpdateInfo(progress);
      });
      // Download complete, show restart prompt
      setShowRestartPrompt(true);
    } catch (err) {
      setUpdateInfo(prev =>
        prev ? { ...prev, status: 'error', error: err instanceof Error ? err.message : 'Install failed' } : null
      );
    }
  };

  const handleRestart = async () => {
    try {
      await relaunch();
    } catch (err) {
      logger.error('[Settings] Failed to restart app:', err);
      // Fallback to page reload if restart fails
      window.location.reload();
    }
  };

  useEffect(() => {
    checkForUpdates().then(info => {
      setUpdateInfo(info);
    });
  }, []);

  // Format bytes to human readable
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="update-section">
      {/* Restart Prompt Modal */}
      {showRestartPrompt && (
        <div className="restart-prompt-overlay">
          <div className="restart-prompt-modal">
            <div className="restart-prompt-icon"><RefreshIcon size={24} /></div>
            <h3>{t('settings.updateReady')}</h3>
            <p>{t('settings.updateReadyDesc')}</p>
            <div className="restart-prompt-actions">
              <Button variant="secondary" onClick={() => setShowRestartPrompt(false)}>
                {t('common.later')}
              </Button>
              <Button variant="primary" onClick={handleRestart}>
                {t('settings.restartNow')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="update-info">
        <div className="update-info-row">
          <span className="update-label">{t('settings.currentVersion')}</span>
          <span className="update-value">{updateInfo?.currentVersion || '...'}</span>
        </div>

        {updateInfo?.status === 'checking' && (
          <div className="update-status checking">
            <div className="update-spinner" />
            <span>{t('settings.checkingUpdates')}</span>
          </div>
        )}

        {updateInfo?.status === 'uptodate' && (
          <div className="update-status uptodate">
            <span className="update-status-icon"><CheckIcon size={14} /></span>
            <span>{t('settings.appUptodate')}</span>
          </div>
        )}

        {updateInfo?.available && (
          <div className="update-available">
            <div className="update-available-header">
              <span className="update-status-icon update-icon-new"><RefreshIcon size={14} /></span>
              <span>{t('settings.updateAvailable')}</span>
            </div>
            <div className="update-info-row">
              <span className="update-label">{t('settings.newVersion')}</span>
              <span className="update-value">{updateInfo.newVersion}</span>
            </div>
            {updateInfo.releaseDate && (
              <div className="update-info-row">
                <span className="update-label">{t('settings.releaseDate')}</span>
                <span className="update-value">{updateInfo.releaseDate}</span>
              </div>
            )}
            {updateInfo.releaseNotes && (
              <div className="update-release-notes">
                <span className="update-label">{t('settings.releaseNotes')}</span>
                <pre className="update-notes-text">{updateInfo.releaseNotes}</pre>
              </div>
            )}
          </div>
        )}

        {updateInfo?.status === 'downloading' && (
          <div className="update-status downloading">
            <div className="update-spinner" />
            <span>{t('settings.downloadingUpdate')}</span>
            {updateInfo.downloadProgress !== undefined && (
              <div className="download-progress">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${updateInfo.downloadProgress}%` }}
                  />
                </div>
                <span className="progress-text">
                  {updateInfo.downloadProgress}%
                  {updateInfo.downloadedBytes && ` (${formatBytes(updateInfo.downloadedBytes)})`}
                </span>
              </div>
            )}
          </div>
        )}

        {updateInfo?.status === 'ready' && (
          <div className="update-status ready">
            <span className="update-status-icon"><CheckIcon size={14} /></span>
            <span>{t('settings.updateDownloaded')}</span>
          </div>
        )}

        {updateInfo?.status === 'error' && (
          <div className="update-status error">
            <span className="update-status-icon"><AlertIcon size={14} /></span>
            <span>{updateInfo.error || t('settings.updateCheckFailed')}</span>
          </div>
        )}
      </div>

      <div className="update-actions">
        <Button
          variant="secondary"
          onClick={handleCheck}
          disabled={isChecking || updateInfo?.status === 'downloading'}
        >
          {isChecking ? t('settings.checking') : t('settings.checkForUpdates')}
        </Button>
        {updateInfo?.available && updateInfo.status !== 'ready' && (
          <Button
            variant="primary"
            onClick={handleInstall}
            disabled={updateInfo.status === 'downloading'}
          >
            {updateInfo.status === 'downloading' ? t('settings.downloading') : t('settings.installUpdate')}
          </Button>
        )}
        {updateInfo?.status === 'ready' && (
          <Button variant="primary" onClick={handleRestart}>
            {t('settings.restartNow')}
          </Button>
        )}
      </div>
    </div>
  );
};

export default UpdateSection;
