import React, { useEffect, useState } from 'react';
import { Button, Input } from '../../../components';
import { toast } from '../../../stores/toastStore';
import { validateNumber } from '../../../utils/validation';
import type { MemoryConfig } from '../../../types/config';

const MemoryConfigForm: React.FC<{
  config: MemoryConfig | null;
  onSave: (data: Partial<MemoryConfig>) => void;
  isSaving: boolean;
  t: (key: string) => string;
}> = ({ config, onSave, isSaving, t }) => {
  const [formData, setFormData] = useState<Partial<MemoryConfig>>({
    enabled: true,
    max_chars: 10000,
    auto_cleanup: false,
    cleanup_threshold: 90,
    retention_days: 30,
  });
  const [errors, setErrors] = useState<{ max_chars?: string; cleanup_threshold?: string; retention_days?: string }>({});

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  const validateForm = () => {
    const newErrors: typeof errors = {};

    // max_chars: 1000-100000
    const maxCharsResult = validateNumber(String(formData.max_chars || ''), { min: 1000, max: 100000, integer: true });
    if (!maxCharsResult.valid) {
      newErrors.max_chars = maxCharsResult.error;
    }

    // cleanup_threshold: 50-100
    if (formData.auto_cleanup) {
      const thresholdResult = validateNumber(String(formData.cleanup_threshold || ''), { min: 50, max: 100, integer: true });
      if (!thresholdResult.valid) {
        newErrors.cleanup_threshold = thresholdResult.error;
      }
    }

    // retention_days: 1-365
    if (formData.auto_cleanup) {
      const retentionResult = validateNumber(String(formData.retention_days || ''), { min: 1, max: 365, integer: true });
      if (!retentionResult.valid) {
        newErrors.retention_days = retentionResult.error;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error(t('settings.validationErrors'));
      return;
    }

    onSave({
      ...formData,
      max_chars: Number(formData.max_chars),
      cleanup_threshold: Number(formData.cleanup_threshold),
      retention_days: Number(formData.retention_days),
    });
    // Success message handled by store
  };

  return (
    <form onSubmit={handleSubmit} className="config-form">
      <div className="form-group">
        <label className="form-label">{t('settings.memoryEnabled')}</label>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={formData.enabled || false}
            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
          />
          <span className="toggle-slider"></span>
        </label>
        <span className="form-hint">{t('settings.memoryEnabledHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.memoryMaxChars')}</label>
        <Input
          type="number"
          value={formData.max_chars || ''}
          onChange={(e) => {
            setFormData({ ...formData, max_chars: parseInt(e.target.value) || undefined });
            setErrors(prev => ({ ...prev, max_chars: undefined }));
          }}
          placeholder="10000"
          className="form-input"
          error={errors.max_chars}
        />
        <span className="form-hint">{t('settings.memoryMaxCharsHint')} (1,000-100,000)</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.memoryAutoCleanup')}</label>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={formData.auto_cleanup || false}
            onChange={(e) => setFormData({ ...formData, auto_cleanup: e.target.checked })}
          />
          <span className="toggle-slider"></span>
        </label>
        <span className="form-hint">{t('settings.memoryAutoCleanupHint')}</span>
      </div>

      {formData.auto_cleanup && (
        <>
          <div className="form-group">
            <label className="form-label">{t('settings.memoryCleanupThreshold')}</label>
            <Input
              type="number"
              value={formData.cleanup_threshold || ''}
              onChange={(e) => {
                setFormData({ ...formData, cleanup_threshold: parseInt(e.target.value) || undefined });
                setErrors(prev => ({ ...prev, cleanup_threshold: undefined }));
              }}
              placeholder="90"
              className="form-input"
              error={errors.cleanup_threshold}
            />
            <span className="form-hint">{t('settings.memoryCleanupThresholdHint')} (50-100%)</span>
          </div>

          <div className="form-group">
            <label className="form-label">{t('settings.memoryRetentionDays')}</label>
            <Input
              type="number"
              value={formData.retention_days || ''}
              onChange={(e) => {
                setFormData({ ...formData, retention_days: parseInt(e.target.value) || undefined });
                setErrors(prev => ({ ...prev, retention_days: undefined }));
              }}
              placeholder="30"
              className="form-input"
              error={errors.retention_days}
            />
            <span className="form-hint">{t('settings.memoryRetentionDaysHint')} (1-365 days)</span>
          </div>
        </>
      )}

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={isSaving}>
          {isSaving ? t('settings.saving') : t('settings.saveConfig')}
        </Button>
      </div>
    </form>
  );
};

export default MemoryConfigForm;
