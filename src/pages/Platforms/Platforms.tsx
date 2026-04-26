import { useEffect, useRef, useState } from 'react';
import { ConfirmModal } from '../../components';
import { usePlatformStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../stores/toastStore';
import { platformApi } from '../../services/platformApi';
import type { Platform, PlatformType } from '../../types/platform';
import './Platforms.css';

// 平台配置表单字段
const platformConfigFields: Record<PlatformType, { key: string; label: string; type: string; placeholder: string }[]> = {
  telegram: [
    { key: 'bot_token', label: 'Bot Token', type: 'password', placeholder: 'Enter Telegram Bot Token' },
    { key: 'webhook_url', label: 'Webhook URL', type: 'text', placeholder: 'Optional: Webhook URL' },
  ],
  discord: [
    { key: 'bot_token', label: 'Bot Token', type: 'password', placeholder: 'Enter Discord Bot Token' },
    { key: 'application_id', label: 'Application ID', type: 'text', placeholder: 'Discord Application ID' },
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
  weixin: [], // 个人微信使用扫码登录，无需表单字段
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
  const statusConfig = {
    connected: { label: t('platforms.connected'), className: 'status-connected' },
    disconnected: { label: t('platforms.disconnected'), className: 'status-disconnected' },
    error: { label: t('platforms.error'), className: 'status-error' },
    pending: { label: t('platforms.connecting'), className: 'status-pending' },
  };

  const config = statusConfig[status];
  return <span className={`status-badge ${config.className}`}>{config.label}</span>;
};

export function Platforms() {
  const { t } = useTranslation();

  const {
    platforms,
    selectedPlatform,
    isConfigModalOpen,
    fetchPlatforms,
    openConfigModal,
    closeConfigModal,
    updateConfig,
    enablePlatform,
    disablePlatform,
    testConnection,
    reconnect,
  } = usePlatformStore();

  // Controlled form state for config modal
  const [configForm, setConfigForm] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchPlatforms();
  }, [fetchPlatforms]);

  // Sync form state when modal opens or selected platform changes
  useEffect(() => {
    if (isConfigModalOpen && selectedPlatform) {
      const platformData = platforms.find(p => p.type === selectedPlatform);
      const initialConfig: Record<string, string> = {};
      const fields = platformConfigFields[selectedPlatform] || [];
      for (const field of fields) {
        initialConfig[field.key] = platformData?.config?.[field.key] || '';
      }
      setConfigForm(initialConfig);
    }
  }, [isConfigModalOpen, selectedPlatform, platforms]);

  const selectedPlatformData = platforms.find(p => p.type === selectedPlatform);
  const configFields = selectedPlatform ? (platformConfigFields[selectedPlatform] ?? []) : [];

  const [disableConfirm, setDisableConfirm] = useState<Platform | null>(null);
  const [connectionError, setConnectionError] = useState<{ platform: PlatformType; error: string; details?: string } | null>(null);

  const handleTogglePlatform = async (platform: Platform) => {
    if (platform.enabled) {
      setDisableConfirm(platform);
    } else {
      await enablePlatform(platform.type);
    }
  };

  const confirmDisable = async () => {
    if (disableConfirm) {
      await disablePlatform(disableConfirm.type);
      setDisableConfirm(null);
    }
  };

  const handleTestConnection = async (type: PlatformType) => {
    setConnectionError(null);
    const result = await testConnection(type);
    if (result.ok) {
      toast.success(t('platforms.testConnection') + ' ' + (t('nav.home') === 'Home' ? 'successful!' : '成功！'));
    } else {
      toast.error(`${t('platforms.testConnection')} ${t('nav.home') === 'Home' ? 'failed' : '失败'}`);
      setConnectionError({
        platform: type,
        error: result.message || (t('nav.home') === 'Home' ? 'Unknown error' : '未知错误'),
        details: result.details,
      });
    }
  };

  const handleConfigChange = (key: string, value: string) => {
    setConfigForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveConfig = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPlatform) return;

    const success = await updateConfig(selectedPlatform, configForm);
    if (success) {
      closeConfigModal();
    }
  };

  // ===== WeChat QR Code =====
  const [qrcodeUrl, setQrcodeUrl] = useState<string | null>(null);
  const [qrcodeStatus, setQrcodeStatus] = useState<'pending' | 'scanned' | 'expired'>('pending');
  const [qrcodeError, setQrcodeError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadQRCode = async () => {
    setQrcodeUrl(null);
    setQrcodeStatus('pending');
    setQrcodeError(null);
    try {
      const result = await platformApi.getWechatQRCode();
      setQrcodeUrl(result.qrcode_url);
    } catch {
      setQrcodeError('Failed to load QR code');
    }
  };

  // Fetch QR code when opening WeChat config modal
  useEffect(() => {
    if (isConfigModalOpen && selectedPlatform === 'weixin') {
      loadQRCode();
    }
  }, [isConfigModalOpen, selectedPlatform]);

  // Poll QR code scan status
  useEffect(() => {
    if (isConfigModalOpen && selectedPlatform === 'weixin' && qrcodeStatus === 'pending') {
      pollRef.current = setInterval(async () => {
        try {
          const result = await platformApi.checkWechatQRCodeStatus();
          if (result.status === 'scanned') {
            setQrcodeStatus('scanned');
            clearInterval(pollRef.current ?? undefined);
          }
        } catch {
          // ignore polling errors
        }
      }, 3000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isConfigModalOpen, selectedPlatform, qrcodeStatus]);

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
              <span className="platform-icon">{platform.icon}</span>
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
                <span>⚠️ {platform.error}</span>
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

      {/* 配置弹窗 */}
      {isConfigModalOpen && selectedPlatformData && (
        <div className="modal-overlay" onClick={closeConfigModal}>
          <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {selectedPlatformData.icon} {selectedPlatformData.name} {t('platforms.configure')}
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
                    <p>⚠️ {qrcodeError}</p>
                    <button className="btn btn-secondary" onClick={loadQRCode}>
                      重新加载
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
                    {qrcodeStatus === 'pending' && (
                      <p className="qrcode-hint">请使用微信扫描二维码以登录</p>
                    )}
                    {qrcodeStatus === 'scanned' && (
                      <p className="qrcode-scanned">✅ 已扫描，请在手机上确认登录</p>
                    )}
                    <p className="qrcode-expiry">二维码有效期为 2 分钟</p>
                  </div>
                ) : (
                  <div className="qrcode-loading">
                    <p>正在加载二维码...</p>
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
                      <label htmlFor={field.key}>{field.label}</label>
                      <input
                        id={field.key}
                        name={field.key}
                        type={field.type}
                        placeholder={field.placeholder}
                        value={configForm[field.key] || ''}
                        onChange={(e) => handleConfigChange(field.key, e.target.value)}
                      />
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
              <h2>⚠️ {t('platforms.testConnection')} {t('nav.home') === 'Home' ? 'Failed' : '失败'}</h2>
              <button className="modal-close" onClick={() => setConnectionError(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="connection-error-platform">
                <strong>Platform:</strong> {connectionError.platform}
              </div>
              <div className="connection-error-message">
                <strong>Error:</strong>
                <pre>{connectionError.error}</pre>
              </div>
              {connectionError.details && (
                <div className="connection-error-details">
                  <strong>Details:</strong>
                  <pre>{connectionError.details}</pre>
                </div>
              )}
              <div className="connection-error-tips">
                <strong>Troubleshooting:</strong>
                <ul>
                  <li>Check that your API credentials are correct</li>
                  <li>Verify network connectivity</li>
                  <li>Ensure the service is not rate-limiting your requests</li>
                  <li>Check the service status page for outages</li>
                </ul>
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
