import React, { useState, useEffect } from 'react';
import { Button, Input } from '../../../components';
import type { CompressionConfig } from '../../../types/config';

const CompressionConfigForm: React.FC<{
  config: CompressionConfig | null;
  onSave: (data: Partial<CompressionConfig>) => void;
  isSaving: boolean;
  t: (key: string) => string;
}> = ({ config, onSave, isSaving, t }) => {
  const [formData, setFormData] = useState<Partial<CompressionConfig>>({
    enabled: true,
    threshold: 0.8,
    target_ratio: 0.5,
  });

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      threshold: Number(formData.threshold),
      target_ratio: Number(formData.target_ratio),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="config-form">
      <div className="form-group">
        <label className="form-label">{t('settings.enableCompression')}</label>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={formData.enabled || false}
            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
          />
          <span className="toggle-slider"></span>
        </label>
        <span className="form-hint">{t('settings.compressionHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.compressionThreshold')}</label>
        <Input
          type="number"
          step="0.1"
          min="0"
          max="1"
          value={formData.threshold || ''}
          onChange={(e) => setFormData({ ...formData, threshold: parseFloat(e.target.value) })}
          placeholder="0.8"
          className="form-input"
        />
        <span className="form-hint">{t('settings.compressionThresholdHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.targetRatio')}</label>
        <Input
          type="number"
          step="0.1"
          min="0"
          max="1"
          value={formData.target_ratio || ''}
          onChange={(e) => setFormData({ ...formData, target_ratio: parseFloat(e.target.value) })}
          placeholder="0.5"
          className="form-input"
        />
        <span className="form-hint">{t('settings.targetRatioHint')}</span>
      </div>

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={isSaving}>
          {isSaving ? t('settings.saving') : t('settings.saveConfig')}
        </Button>
      </div>
    </form>
  );
};

export default CompressionConfigForm;
