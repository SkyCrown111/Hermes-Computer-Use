import { useEffect, useState, useCallback } from 'react';
import { ConfirmModal, AlertIcon, WarningIcon, CheckIcon } from '../../components';
import { usePlatformStore, getPlatformIcon } from '../../stores';
import { usePageVisibility, usePolling } from '../../hooks';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../stores/toastStore';
import { platformApi } from '../../services/platformApi';
import type { Platform, PlatformType } from '../../types/platform';
import { PlatformInbox } from './PlatformInbox';
import './Platforms.css';

// 平台配置表单字段
const platformConfigFields: Partial<Record<PlatformType, { key: string; label: string; type: string; placeholder: string; hint?: string }[]>> = {
  telegram: [
    { key: 'bot_token', label: 'Bot Token', type: 'password', placeholder: 'Enter Telegram Bot Token' },
    { key: 'webhook_url', label: 'Webhook URL', type: 'text', placeholder: 'Optional: Webhook URL' },
  ],
  discord: [
    { key: 'bot_token', label: 'Bot Token', type: 'password', placeholder: 'Enter Discord Bot Token' },
    { key: 'application_id', label: 'Application ID', type: 'text', placeholder: 'Discord Application ID' },
    // Hermes Agent 特定配置
    { key: 'require_mention', label: 'Require Mention', type: 'checkbox', placeholder: '', hint: 'Bot only responds when mentioned' },
    { key: 'auto_thread', label: 'Auto Thread', type: 'checkbox', placeholder: '', hint: 'Automatically create threads for responses' },
    { key: 'reactions', label: 'Reactions', type: 'checkbox', placeholder: '', hint: 'Add reactions to messages' },
    { key: 'allowed_channels', label: 'Allowed Channels', type: 'text', placeholder: 'Channel IDs, comma-separated', hint: 'Restrict bot to these channels' },
    { key: 'free_response_channels', label: 'Free Response Channels', type: 'text', placeholder: 'Channel IDs, comma-separated', hint: 'Channels where bot responds without mention' },
  ],
  slack: [
    { key: 'bot_token', label: 'Bot Token', type: 'password', placeholder: 'xoxb-...' },
    { key: 'app_token', label: 'App Token', type: 'password', placeholder: 'xapp-...' },
    { key: 'signing_secret', label: 'Signing Secret', type: 'password', placeholder: 'Signing Secret' },
  ],
  whatsapp: [
    { key: 'phone_number_id', label: 'Phone Number ID', type: 'text', placeholder: 'WhatsApp Business Phone ID' },
    { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'WhatsApp Access Token' },
  ],
  wechat: [
    { key: 'corp_id', label: 'Corp ID', type: 'text', placeholder: 'WeChat Work Corp ID' },
    { key: 'agent_id', label: 'Agent ID', type: 'text', placeholder: 'App Agent ID' },
    { key: 'secret', label: 'Secret', type: 'password', placeholder: 'App Secret' },
  ],
  weixin: [
    // 个人微信使用扫码登录，allowed_users 在扫码成功后自动添加
  ],
  lark: [
    { key: 'app_id', label: 'App ID', type: 'text', placeholder: 'Lark App ID' },
    { key: 'app_secret', label: 'App Secret', type: 'password', placeholder: 'Lark App Secret' },
  ],
  api: [
    { key: 'port', label: 'Port', type: 'number', placeholder: '8080' },
    { key: 'host', label: 'Host', type: 'text', placeholder: '0.0.0.0' },
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Optional: API access key' },
  ],
  webhook: [
    { key: 'url', label: 'Webhook URL', type: 'text', placeholder: 'https://...' },
    { key: 'secret', label: 'Secret', type: 'password', placeholder: 'Optional: signing secret' },
  ],
};

// 状态徽章
const StatusBadge = ({ status, t }: { status: Platform['status']; t: (key: string) => string }) => {
  const statusConfig: Record<string, { label: string; className: string }> = {
    connected: { label: t('platforms.connected'), className: 'status-connected' },
    disconnected: { label: t('platforms.disconnected'), className: 'status-disconnected' },
    error: { label: t('platforms.error'), className: 'status-error' },
    connecting: { label: t('platforms.connecting'), className: 'status-pending' },
    pending: { label: t('platforms.connecting'), className: 'status-pending' },
  };

  const config = statusConfig[status] || statusConfig.disconnected;
  return <span className={`status-badge ${config.className}`}>{config.label}</span>;
};

export function Platforms() {
  const { t } = useTranslation();

  const platforms = usePlatformStore(s => s.platforms);
  const selectedPlatform = usePlatformStore(s => s.selectedPlatform);
  const isConfigModalOpen = usePlatformStore(s => s.isConfigModalOpen);
  const fetchPlatforms = usePlatformStore(s => s.fetchPlatforms);
  const openConfigModal = usePlatformStore(s => s.openConfigModal);
  const closeConfigModal = usePlatformStore(s => s.closeConfigModal);
  const updateConfig = usePlatformStore(s => s.updateConfig);
  const enablePlatform = usePlatformStore(s => s.enablePlatform);
  const disablePlatform = usePlatformStore(s => s.disablePlatform);
  const testConnection = usePlatformStore(s => s.testConnection);
  const reconnect = usePlatformStore(s => s.reconnect);

  // Controlled form state for config modal
  const [configForm, setConfigForm] = useState<Record<string, string | boolean>>({});

  useEffect(() => {
    fetchPlatforms();
  }, [fetchPlatforms]);

  // Sync form state when modal opens or selected platform changes
  useEffect(() => {
    if (isConfigModalOpen && selectedPlatform) {
      const platformData = platforms.find(p => p.type === selectedPlatform);
      const initialConfig: Record<string, string | boolean> = {};
      const fields = platformConfigFields[selectedPlatform] || [];
      for (const field of fields) {
        const rawValue = platformData?.config?.[field.key];
        if (field.type === 'checkbox') {
          initialConfig[field.key] = rawValue === true || rawValue === 'true';
        } else {
          initialConfig[field.key] = rawValue == null ? '' : String(rawValue);
        }
      }
      setConfigForm(initialConfig);
    }
  }, [isConfigModalOpen, selectedPlatform, platforms]);

  const selectedPlatformData = platforms.find(p => p.type === selectedPlatform);
  const configFields = selectedPlatform ? (platformConfigFields[selectedPlatform] ?? []) : [];

  const [disableConfirm, setDisableConfirm] = useState<Platform | null>(null);
  const [connectionError, setConnectionError] = useState<{ platform: PlatformType; error: string; details?: string } | null>(null);

  const handleTogglePlatform = useCallback(async (platform: Platform) => {
    if (platform.enabled) {
      setDisableConfirm(platform);
    } else {
      await enablePlatform(platform.type);
    }
  }, [enablePlatform]);

  const confirmDisable = useCallback(async () => {
    if (disableConfirm) {
      await disablePlatform(disableConfirm.type);
      setDisableConfirm(null);
    }
  }, [disableConfirm, disablePlatform]);

  const handleTestConnection = useCallback(async (type: PlatformType) => {
    setConnectionError(null);
    const result = await testConnection(type);
    if (result.ok) {
      toast.success(t('platforms.testSuccess'));
    } else {
      toast.error(t('platforms.testFailed'));
      setConnectionError({
        platform: type,
        error: result.message || t('platforms.unknownError'),
        details: result.details,
      });
    }
  }, [testConnection, t]);

  const handleConfigChange = useCallback((key: string, value: string | boolean) => {
    setConfigForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const getTextConfigValue = useCallback((key: string): string => {
    const value = configForm[key];
    return typeof value === 'string' ? value : '';
  }, [configForm]);

  const handleSaveConfig = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPlatform) return;

    const success = await updateConfig(selectedPlatform, configForm);
    if (success) {
      closeConfigModal();
    }
  }, [selectedPlatform, updateConfig, configForm, closeConfigModal]);

  // ===== WeChat QR Code =====
  const [qrcodeUrl, setQrcodeUrl] = useState<string | null>(null);
  const [qrcodeStatus, setQrcodeStatus] = useState<'pending' | 'scanned' | 'expired' | 'confirmed'>('pending');
  const [qrcodeError, setQrcodeError] = useState<string | null>(null);
  const isPageVisible = usePageVisibility();

  const loadQRCode = useCallback(async () => {
    setQrcodeUrl(null);
    setQrcodeStatus('pending');
    setQrcodeError(null);
    try {
      const result = await platformApi.getWechatQRCode();
      setQrcodeUrl(result.qrcode_url);
    } catch {
      setQrcodeError(t('platforms.wechat.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    if (!isConfigModalOpen) {
      setQrcodeUrl(null);
      setQrcodeStatus('pending');
      setQrcodeError(null);
    }
  }, [isConfigModalOpen]);

  // Fetch QR code when opening WeChat config modal
  useEffect(() => {
    if (isConfigModalOpen && selectedPlatform === 'weixin') {
      loadQRCode();
    }
  }, [isConfigModalOpen, selectedPlatform, loadQRCode]);

  usePolling(async () => {
    try {
      const result = await platformApi.checkWechatQRCodeStatus();
      if (result.status === 'scanned' || result.status === 'expired' || result.status === 'confirmed') {
        setQrcodeStatus(result.status as 'scanned' | 'expired' | 'confirmed');
      }
      if (result.status === 'confirmed') {
        toast.success(t('platforms.wechat.confirmed'));
        await fetchPlatforms();
      }
    } catch {
      // QR code polling failed silently
    }
  }, 3000, {
    enabled: isPageVisible && isConfigModalOpen && selectedPlatform === 'weixin' && qrcodeStatus !== 'expired' && qrcodeStatus !== 'confirmed',
    immediate: false,
  });

  return (
    <div className="platforms-page">
      <div className="page-header">
        <h1>{t('platforms.title')}</h1>
        <p>{t('platforms.subtitle')}</p>
      </div>

      <div className="platforms-grid">
        {platforms.map(platform => (
          <div key={platform.type} className="platform-card glass-card">
            <div className="platform-header">
              <span className="platform-icon">{getPlatformIcon(platform.type)}</span>
              <div className="platform-info">
                <h3>{platform.name}</h3>
                <p>{platform.description}</p>
              </div>
              <StatusBadge status={platform.status} t={t} />
            </div>

            <div className="platform-actions">
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={platform.enabled}
                  onChange={() => handleTogglePlatform(platform)}
                />
                <span className="toggle-slider"></span>
              </label>

              <button
                className="btn btn-secondary"
                onClick={() => openConfigModal(platform.type)}
              >
                {t('platforms.configure')}
              </button>

              {platform.enabled && (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleTestConnection(platform.type)}
                  >
                    {t('platforms.testConnection')}
                  </button>
                  {platform.status === 'error' && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => reconnect(platform.type)}
                    >
                      {t('platforms.reconnect')}
                    </button>
                  )}
                </>
              )}
            </div>

            {platform.error && (
              <div className="platform-error">
                <span><AlertIcon size={14} /> {platform.error}</span>
              </div>
            )}

            {platform.lastConnected && (
              <div className="platform-meta">
                <span>{t('platforms.lastConnected')}: {new Date(platform.lastConnected).toLocaleString()}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <PlatformInbox platforms={platforms} />

      {/* 配置弹窗 */}
      {isConfigModalOpen && selectedPlatformData && (
        <div className="modal-overlay" onClick={closeConfigModal}>
          <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {getPlatformIcon(selectedPlatformData.type)} {selectedPlatformData.name} {t('platforms.configure')}
              </h2>
              <button className="modal-close" onClick={closeConfigModal}>
                ×
              </button>
            </div>

            {selectedPlatform === 'weixin' ? (
              // 微信扫码配置
              <div className="modal-body">
                {qrcodeError ? (
                  <div className="qrcode-error">
                    <p><WarningIcon size={16} /> {qrcodeError}</p>
                    <button className="btn btn-secondary" onClick={loadQRCode}>
                      {t('common.refresh')}
                    </button>
                  </div>
                ) : qrcodeUrl ? (
                  <div className="qrcode-container">
                    <div className="qrcode-image-wrapper">
                      <img
                        src={qrcodeUrl}
                        alt="WeChat QR Code"
                        className="qrcode-image"
                      />
                    </div>
                    {qrcodeStatus === 'expired' && (
                      <div className="qrcode-error qrcode-expired">
                        <p><WarningIcon size={16} /> {t('platforms.wechat.expired')}</p>
                        <button type="button" className="btn btn-secondary" onClick={() => void loadQRCode()}>
                          {t('platforms.wechat.refreshQrcode')}
                        </button>
                      </div>
                    )}
                    {qrcodeStatus === 'pending' && (
                      <p className="qrcode-hint">{t('platforms.wechat.scanPrompt')}</p>
                    )}
                    {qrcodeStatus === 'scanned' && (
                      <p className="qrcode-scanned"><CheckIcon size={16} /> {t('platforms.wechat.scanned')}</p>
                    )}
                    {qrcodeStatus === 'confirmed' && (
                      <p className="qrcode-scanned qrcode-confirmed">
                        <CheckIcon size={16} /> {t('platforms.wechat.confirmedHint')}
                      </p>
                    )}
                    {qrcodeStatus !== 'expired' && (
                      <p className="qrcode-expiry">{t('platforms.wechat.qrcodeExpiry')}</p>
                    )}
                  </div>
                ) : (
                  <div className="qrcode-loading">
                    <p>{t('platforms.wechat.loadingQrcode')}</p>
                  </div>
                )}
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => { closeConfigModal(); }}>
                    {t('common.close')}
                  </button>
                </div>
              </div>
            ) : (
              // 其他平台表单配置
              <form onSubmit={handleSaveConfig}>
                <div className="modal-body">
                  {configFields.map(field => (
                    <div key={field.key} className="form-group">
                      {field.type === 'checkbox' ? (
                        <label className="checkbox-label">
                          <input
                            id={field.key}
                            name={field.key}
                            type="checkbox"
                            checked={configForm[field.key] === true}
                            onChange={(e) => handleConfigChange(field.key, e.target.checked)}
                          />
                          <span className="checkbox-text">{field.label}</span>
                          {field.hint && <span className="field-hint">{field.hint}</span>}
                        </label>
                      ) : (
                        <>
                          <label htmlFor={field.key}>{field.label}</label>
                          <input
                            id={field.key}
                            name={field.key}
                            type={field.type}
                            placeholder={field.placeholder}
                            value={getTextConfigValue(field.key)}
                            onChange={(e) => handleConfigChange(field.key, e.target.value)}
                          />
                          {field.hint && <span className="field-hint">{field.hint}</span>}
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeConfigModal}>
                    {t('common.cancel')}
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {t('platforms.saveConfig')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Disable Confirmation Modal */}
      <ConfirmModal
        isOpen={disableConfirm !== null}
        title={t('platforms.disableConfirmTitle') || 'Disable Platform'}
        message={`${t('platforms.disableConfirm') || 'Are you sure you want to disable this platform?'}`}
        confirmText={t('platforms.disable') || 'Disable'}
        cancelText={t('common.cancel')}
        variant="warning"
        onConfirm={confirmDisable}
        onCancel={() => setDisableConfirm(null)}
      />

      {/* Connection Error Details Modal */}
      {connectionError && (
        <div className="modal-overlay" onClick={() => setConnectionError(null)}>
          <div className="modal-content glass-card connection-error-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><WarningIcon size={18} /> {t('platforms.testFailedTitle')}</h2>
              <button className="modal-close" onClick={() => setConnectionError(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="connection-error-platform">
                <strong>{t('sessions.platform')}:</strong> {connectionError.platform}
              </div>
              <div className="connection-error-message">
                <strong>{t('platforms.error')}:</strong>
                <pre>{connectionError.error}</pre>
              </div>
              {connectionError.details && (
                <div className="connection-error-details">
                  <strong>{t('monitor.logFile')}:</strong>
                  <pre>{connectionError.details}</pre>
                </div>
              )}
              <div className="connection-error-tips">
                <strong>{t('platforms.troubleshooting')}:</strong>
                <p>{t('platforms.troubleshootingTips')}</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConnectionError(null)}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
