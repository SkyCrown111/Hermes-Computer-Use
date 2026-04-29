import React, { useState, useEffect } from 'react';
import { Button, Input } from '../../../components';
import type { TerminalConfig } from '../../../types/config';
import { toast } from '../../../stores/toastStore';
import { validateNumber, validatePath } from '../../../utils/validation';

const TerminalConfigForm: React.FC<{
  config: TerminalConfig | null;
  onSave: (data: Partial<TerminalConfig>) => void;
  isSaving: boolean;
  t: (key: string) => string;
}> = ({ config, onSave, isSaving, t }) => {
  const [formData, setFormData] = useState<Partial<TerminalConfig>>({
    backend: 'local',
    timeout: 180,
    cwd: '',
  });
  const [errors, setErrors] = useState<{ timeout?: string; cwd?: string }>({});

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  const validateForm = (): boolean => {
    const newErrors: { timeout?: string; cwd?: string } = {};

    // timeout: 10-7200 seconds
    const timeoutResult = validateNumber(String(formData.timeout || ''), { min: 10, max: 7200, integer: true });
    if (!timeoutResult.valid) {
      newErrors.timeout = timeoutResult.error;
    }

    // cwd: valid path
    if (formData.cwd) {
      const pathResult = validatePath(formData.cwd);
      if (!pathResult.valid) {
        newErrors.cwd = pathResult.error;
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
      timeout: Number(formData.timeout),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="config-form">
      <div className="form-group">
        <label className="form-label">{t('settings.terminalBackend')}</label>
        <select
          value={formData.backend || 'local'}
          onChange={(e) => setFormData({ ...formData, backend: e.target.value as 'local' | 'docker' | 'ssh' })}
          className="form-select"
        >
          <option value="local">{t('settings.localTerminal')}</option>
          <option value="docker">{t('settings.dockerContainer')}</option>
          <option value="ssh">{t('settings.sshRemote')}</option>
        </select>
        <span className="form-hint">{t('settings.terminalBackendHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.commandTimeout')}</label>
        <Input
          type="number"
          value={formData.timeout || ''}
          onChange={(e) => {
            setFormData({ ...formData, timeout: parseInt(e.target.value) || undefined });
            setErrors(prev => ({ ...prev, timeout: undefined }));
          }}
          placeholder="180"
          className="form-input"
          error={errors.timeout}
        />
        <span className="form-hint">Command execution timeout (10-7200 seconds)</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.workDir')}</label>
        <Input
          value={formData.cwd || ''}
          onChange={(e) => {
            setFormData({ ...formData, cwd: e.target.value });
            setErrors(prev => ({ ...prev, cwd: undefined }));
          }}
          placeholder="/home/user/projects"
          className="form-input"
          error={errors.cwd}
        />
        <span className="form-hint">{t('settings.workDirHint')}</span>
      </div>

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={isSaving}>
          {isSaving ? t('settings.saving') : t('settings.saveConfig')}
        </Button>
      </div>
    </form>
  );
};

export default TerminalConfigForm;
