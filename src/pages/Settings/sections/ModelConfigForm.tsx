import React, { useState, useEffect } from 'react';
import { Button, Input } from '../../../components';
import type { ModelConfig } from '../../../types/config';
import { logger } from '../../../lib/logger';

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

  // 遮蔽 API Key 显示
  const maskApiKey = (key: string | undefined): string => {
    if (!key || key.length < 8) return key || '';
    return key.slice(0, 4) + '*'.repeat(Math.min(key.length - 8, 20)) + key.slice(-4);
  };

  useEffect(() => {
    logger.debug('[ModelConfigForm] Config changed:', config);
    if (config) {
      logger.debug('[ModelConfigForm] Setting formData to:', config);
      setFormData(config);
    }
  }, [config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
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
            value={showApiKey ? (formData.api_key || '') : maskApiKey(formData.api_key)}
            onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
            placeholder="sk-..."
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
          {formData.api_key ? t('settings.configured') : t('settings.notConfigured')} - {t('settings.apiKeyStored')}
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
