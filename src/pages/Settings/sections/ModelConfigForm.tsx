import React, { useState, useEffect } from 'react';
import { Button, Input } from '../../../components';
import type { ModelConfig } from '../../../types/config';

const ModelConfigForm: React.FC<{
  config: ModelConfig | null;
  onSave: (data: Partial<ModelConfig>) => void;
  isSaving: boolean;
  t: (key: string) => string;
}> = ({ config, onSave, isSaving, t }) => {
  const [formData, setFormData] = useState<Partial<ModelConfig>>({
    default: '',
    provider: 'auto',
    api_key: '',
    base_url: '',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyEdited, setApiKeyEdited] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');

  const isMaskedKey = (key: string | undefined): boolean => {
    if (!key) return false;
    return key.startsWith('__MASKED__') || (key.includes('****') && key.length > 8);
  };

  const getApiKeyDisplay = (): string => {
    if (apiKeyEdited && newApiKey) {
      return showApiKey
        ? newApiKey
        : newApiKey.slice(0, 4) + '*'.repeat(Math.min(newApiKey.length - 8, 20)) + newApiKey.slice(-4);
    }
    if (formData.api_key && isMaskedKey(formData.api_key)) {
      const suffix = formData.api_key.replace(/^__MASKED__/, '');
      return showApiKey ? formData.api_key : `****${suffix}`;
    }
    if (formData.api_key) {
      return showApiKey
        ? formData.api_key
        : formData.api_key.slice(0, 4) + '*'.repeat(Math.min(formData.api_key.length - 8, 20)) + formData.api_key.slice(-4);
    }
    return '';
  };

  const isApiKeyConfigured = !!(formData.api_key && (isMaskedKey(formData.api_key) || formData.api_key.length > 0));

  useEffect(() => {
    if (config) {
      setFormData(config);
      setApiKeyEdited(false);
      setNewApiKey('');
    }
  }, [config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const saveData: Partial<ModelConfig> = {
      default: formData.default,
      provider: formData.provider,
      base_url: formData.base_url,
    };
    if (apiKeyEdited && newApiKey) {
      saveData.api_key = newApiKey;
    }
    onSave(saveData);
  };

  const handleApiKeyChange = (value: string) => {
    setNewApiKey(value);
    setApiKeyEdited(true);
  };

  const handleApiKeyFocus = () => {
    if (!apiKeyEdited && isMaskedKey(formData.api_key)) {
      setShowApiKey(true);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="config-form">
      <div className="form-group">
        <label className="form-label">{t('settings.defaultModel')}</label>
        <Input
          value={formData.default || ''}
          onChange={(e) => setFormData({ ...formData, default: e.target.value })}
          placeholder="anthropic/claude-opus-4.6"
          className="form-input"
        />
        <span className="form-hint">{t('settings.modelFormat')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.provider')}</label>
        <select
          value={formData.provider || 'auto'}
          onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
          className="form-select"
        >
          <option value="auto">{t('settings.providerAuto')}</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="openrouter">OpenRouter</option>
          <option value="ollama">Ollama</option>
          <option value="custom">{t('settings.providerCustom')}</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.apiKey')}</label>
        <div className="api-key-input-wrapper">
          <Input
            type={showApiKey ? 'text' : 'password'}
            value={getApiKeyDisplay()}
            onChange={(e) => handleApiKeyChange(e.target.value)}
            onFocus={handleApiKeyFocus}
            placeholder={isApiKeyConfigured ? t('settings.enterNewApiKey') || 'Enter new API key to update' : 'sk-...'}
            className="form-input"
          />
          <button
            type="button"
            className="toggle-visibility-btn"
            onClick={() => setShowApiKey(!showApiKey)}
          >
            {showApiKey ? t('common.hide') : t('common.show')}
          </button>
        </div>
        <span className="form-hint">
          {isApiKeyConfigured
            ? (
              apiKeyEdited
                ? (t('settings.willBeUpdated') || 'API key will be updated on save')
                : `${t('settings.configured')} - ${(t('settings.leaveEmptyToKeep') || 'leave empty to keep current')}`
            )
            : t('settings.notConfigured')} - {t('settings.apiKeyStored')}
        </span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.baseUrl')}</label>
        <Input
          value={formData.base_url || ''}
          onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
          placeholder="https://api.openai.com/v1"
          className="form-input"
        />
        <span className="form-hint">{t('settings.customApiEndpoint')}</span>
      </div>

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={isSaving}>
          {isSaving ? t('settings.saving') : t('settings.saveConfig')}
        </Button>
      </div>
    </form>
  );
};

export default ModelConfigForm;
