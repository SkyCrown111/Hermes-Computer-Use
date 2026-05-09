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
  // Track whether the user has actually edited the API key field
  const [apiKeyEdited, setApiKeyEdited] = useState(false);
  // Track the new API key value (separate from masked display)
  const [newApiKey, setNewApiKey] = useState('');

  // Check if an API key value is a masked placeholder from the backend
  const isMaskedKey = (key: string | undefined): boolean => {
    if (!key) return false;
    return key.startsWith('__MASKED__') || key.startsWith('•') || (key.includes('****') && key.length > 8);
  };

  // Display the API key status
  const getApiKeyDisplay = (): string => {
    if (apiKeyEdited && newApiKey) {
      return showApiKey ? newApiKey : newApiKey.slice(0, 4) + '*'.repeat(Math.min(newApiKey.length - 8, 20)) + newApiKey.slice(-4);
    }
    if (formData.api_key && isMaskedKey(formData.api_key)) {
      // Show a friendly masked display
      const suffix = formData.api_key.replace(/^(__MASKED__|[•]+)/, '');
      return showApiKey ? formData.api_key : `****${suffix}`;
    }
    if (formData.api_key) {
      return showApiKey ? formData.api_key : formData.api_key.slice(0, 4) + '*'.repeat(Math.min(formData.api_key.length - 8, 20)) + formData.api_key.slice(-4);
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
    // Build save data — only include api_key if the user actually entered a new one
    const saveData: Partial<ModelConfig> = {
      default: formData.default,
      provider: formData.provider,
      base_url: formData.base_url,
    };
    if (apiKeyEdited && newApiKey) {
      saveData.api_key = newApiKey;
    }
    // If not edited, don't include api_key at all — backend will preserve existing value
    onSave(saveData);
  };

  const handleApiKeyChange = (value: string) => {
    setNewApiKey(value);
    setApiKeyEdited(true);
  };

  const handleApiKeyFocus = () => {
    // When focusing the API key field and it's showing a masked value,
    // switch to edit mode showing the placeholder
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
        <label className="form-label">Provider</label>
        <select
          value={formData.provider || 'auto'}
          onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
          className="form-select"
        >
          <option value="auto">Auto</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="openrouter">OpenRouter</option>
          <option value="ollama">Ollama</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.apiKey')}</label>
        <div className="api-key-input-wrapper">
          <Input
            type={showApiKey ? 'text' : 'password'}
            value={apiKeyEdited ? getApiKeyDisplay() : getApiKeyDisplay()}
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
            ? (apiKeyEdited
              ? (t('settings.willBeUpdated') || 'API key will be updated on save')
              : (t('settings.configured') + ' - ' + (t('settings.leaveEmptyToKeep') || 'leave empty to keep current')))
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
