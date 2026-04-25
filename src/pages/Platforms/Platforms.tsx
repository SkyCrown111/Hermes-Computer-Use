import { useEffect, useState } from 'react';
import { ConfirmModal } from '../../components';
import { usePlatformStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
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

export default function Platforms() {
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

  useEffect(() => {
    fetchPlatforms();
  }, [fetchPlatforms]);

  const selectedPlatformData = platforms.find(p => p.type === selectedPlatform);
  const configFields = selectedPlatform ? platformConfigFields[selectedPlatform] : [];

  const [disableConfirm, setDisableConfirm] = useState<Platform | null>(null);

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
    const result = await testConnection(type);
    if (result.ok) {
      alert(t('platforms.testConnection') + ' ' + (t('nav.home') === 'Home' ? 'successful!' : '成功！'));
    } else {
      alert(`${t('platforms.testConnection')} ${t('nav.home') === 'Home' ? 'failed' : '失败'}: ${result.message || (t('nav.home') === 'Home' ? 'Unknown error' : '未知错误')}`);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPlatform) return;

    const formData = new FormData(e.currentTarget);
    const config: Record<string, string> = {};
    formData.forEach((value, key) => {
      config[key] = value.toString();
    });

    const success = await updateConfig(selectedPlatform, config);
    if (success) {
      closeConfigModal();
    }
  };

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
                      defaultValue={selectedPlatformData.config?.[field.key] || ''}
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
    </div>
  );
}
