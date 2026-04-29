import React, { useState, useEffect } from 'react';
import { Button, Input } from '../../../components';
import type { AgentConfig } from '../../../types/config';
import { toast } from '../../../stores/toastStore';
import { validateNumber } from '../../../utils/validation';

const AgentConfigForm: React.FC<{
  config: AgentConfig | null;
  onSave: (data: Partial<AgentConfig>) => void;
  isSaving: boolean;
  t: (key: string) => string;
}> = ({ config, onSave, isSaving, t }) => {
  const [formData, setFormData] = useState<Partial<AgentConfig>>({
    max_turns: 100,
    timeout: 300,
    reasoning_effort: 'medium',
  });
  const [errors, setErrors] = useState<{ maxTurns?: string; timeout?: string }>({});

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  const validateForm = (): boolean => {
    const newErrors: { maxTurns?: string; timeout?: string } = {};

    // max_turns: 1-1000
    const maxTurnsResult = validateNumber(String(formData.max_turns || ''), { min: 1, max: 1000, integer: true });
    if (!maxTurnsResult.valid) {
      newErrors.maxTurns = maxTurnsResult.error;
    }

    // timeout: 10-3600 seconds
    const timeoutResult = validateNumber(String(formData.timeout || ''), { min: 10, max: 3600, integer: true });
    if (!timeoutResult.valid) {
      newErrors.timeout = timeoutResult.error;
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
      max_turns: Number(formData.max_turns),
      timeout: Number(formData.timeout),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="config-form">
      <div className="form-group">
        <label className="form-label">{t('settings.maxTurns')}</label>
        <Input
          type="number"
          value={formData.max_turns || ''}
          onChange={(e) => {
            setFormData({ ...formData, max_turns: parseInt(e.target.value) || undefined });
            setErrors(prev => ({ ...prev, maxTurns: undefined }));
          }}
          placeholder="100"
          className="form-input"
          error={errors.maxTurns}
        />
        <span className="form-hint">{t('settings.maxTurnsHint')} (1-1000)</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.timeout')}</label>
        <Input
          type="number"
          value={formData.timeout || ''}
          onChange={(e) => {
            setFormData({ ...formData, timeout: parseInt(e.target.value) || undefined });
            setErrors(prev => ({ ...prev, timeout: undefined }));
          }}
          placeholder="300"
          className="form-input"
          error={errors.timeout}
        />
        <span className="form-hint">{t('settings.timeoutHint')} (10-3600 seconds)</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.reasoningEffort')}</label>
        <select
          value={formData.reasoning_effort || 'medium'}
          onChange={(e) => setFormData({ ...formData, reasoning_effort: e.target.value as 'low' | 'medium' | 'high' })}
          className="form-select"
        >
          <option value="low">{t('settings.lowFast')}</option>
          <option value="medium">{t('settings.mediumBalanced')}</option>
          <option value="high">{t('settings.highDeep')}</option>
        </select>
        <span className="form-hint">{t('settings.reasoningEffortHint')}</span>
      </div>

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={isSaving}>
          {isSaving ? t('settings.saving') : t('settings.saveConfig')}
        </Button>
      </div>
    </form>
  );
};

export default AgentConfigForm;
