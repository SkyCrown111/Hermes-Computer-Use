import React, { useState, useEffect } from 'react';
import { Button, Input } from '../../../components';
import type { CheckpointConfig } from '../../../types/config';
import { toast } from '../../../stores/toastStore';
import { validateNumber, validatePath } from '../../../utils/validation';

const CheckpointConfigForm: React.FC<{
  config: CheckpointConfig | null;
  onSave: (data: Partial<CheckpointConfig>) => void;
  isSaving: boolean;
  t: (key: string) => string;
}> = ({ config, onSave, isSaving, t }) => {
  const [formData, setFormData] = useState<Partial<CheckpointConfig>>({
    enabled: true,
    max_snapshots: 10,
    storage_path: '',
    auto_restore: true,
    auto_restore_on_crash: true,
    retention_policy: 'count',
    retention_days: 30,
    retention_size_mb: 100,
    compress_snapshots: false,
  });
  const [errors, setErrors] = useState<{ maxSnapshots?: string; storagePath?: string; retentionDays?: string; retentionSize?: string }>({});

  useEffect(() => {
    if (config) {
      setFormData({
        enabled: config.enabled ?? true,
        max_snapshots: config.max_snapshots ?? 10,
        storage_path: config.storage_path ?? '',
        auto_restore: config.auto_restore ?? true,
        auto_restore_on_crash: config.auto_restore_on_crash ?? true,
        retention_policy: config.retention_policy ?? 'count',
        retention_days: config.retention_days ?? 30,
        retention_size_mb: config.retention_size_mb ?? 100,
        compress_snapshots: config.compress_snapshots ?? false,
      });
    }
  }, [config]);

  const validateForm = (): boolean => {
    const newErrors: { maxSnapshots?: string; storagePath?: string; retentionDays?: string; retentionSize?: string } = {};

    // max_snapshots: 1-100
    const maxSnapshotsResult = validateNumber(String(formData.max_snapshots || ''), { min: 1, max: 100, integer: true });
    if (!maxSnapshotsResult.valid) {
      newErrors.maxSnapshots = maxSnapshotsResult.error;
    }

    // storage_path: valid path (optional)
    if (formData.storage_path) {
      const pathResult = validatePath(formData.storage_path);
      if (!pathResult.valid) {
        newErrors.storagePath = pathResult.error;
      }
    }

    // retention_days: 1-365
    if (formData.retention_policy === 'time') {
      const daysResult = validateNumber(String(formData.retention_days || ''), { min: 1, max: 365, integer: true });
      if (!daysResult.valid) {
        newErrors.retentionDays = daysResult.error;
      }
    }

    // retention_size_mb: 1-10000
    if (formData.retention_policy === 'size') {
      const sizeResult = validateNumber(String(formData.retention_size_mb || ''), { min: 1, max: 10000, integer: true });
      if (!sizeResult.valid) {
        newErrors.retentionSize = sizeResult.error;
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
      max_snapshots: Number(formData.max_snapshots),
      retention_days: Number(formData.retention_days),
      retention_size_mb: Number(formData.retention_size_mb),
    });
    // Success message handled by store
  };

  return (
    <form onSubmit={handleSubmit} className="config-form">
      {/* 基本设置 */}
      <div className="form-section">
        <h3 className="form-section-title">{t('settings.checkpointBasic')}</h3>

        <div className="form-group">
          <label className="form-label">{t('settings.enableCheckpoint')}</label>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={formData.enabled || false}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            />
            <span className="toggle-slider"></span>
          </label>
          <span className="form-hint">{t('settings.checkpointHint')}</span>
        </div>

        <div className="form-group">
          <label className="form-label">{t('settings.maxSnapshots')}</label>
          <Input
            type="number"
            min="1"
            max="100"
            value={formData.max_snapshots || ''}
            onChange={(e) => {
              setFormData({ ...formData, max_snapshots: parseInt(e.target.value) || undefined });
              setErrors(prev => ({ ...prev, maxSnapshots: undefined }));
            }}
            placeholder="10"
            className="form-input"
            error={errors.maxSnapshots}
          />
          <span className="form-hint">{t('settings.maxSnapshotsHint')}</span>
        </div>

        <div className="form-group">
          <label className="form-label">{t('settings.checkpointStoragePath')}</label>
          <Input
            value={formData.storage_path || ''}
            onChange={(e) => {
              setFormData({ ...formData, storage_path: e.target.value });
              setErrors(prev => ({ ...prev, storagePath: undefined }));
            }}
            placeholder="/path/to/checkpoints"
            className="form-input"
            error={errors.storagePath}
          />
          <span className="form-hint">{t('settings.checkpointStoragePathHint')}</span>
        </div>
      </div>

      {/* 自动恢复设置 */}
      <div className="form-section">
        <h3 className="form-section-title">{t('settings.checkpointAutoRestore')}</h3>

        <div className="form-group">
          <label className="form-label">{t('settings.autoRestore')}</label>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={formData.auto_restore || false}
              onChange={(e) => setFormData({ ...formData, auto_restore: e.target.checked })}
            />
            <span className="toggle-slider"></span>
          </label>
          <span className="form-hint">{t('settings.autoRestoreHint')}</span>
        </div>

        <div className="form-group">
          <label className="form-label">{t('settings.autoRestoreOnCrash')}</label>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={formData.auto_restore_on_crash || false}
              onChange={(e) => setFormData({ ...formData, auto_restore_on_crash: e.target.checked })}
            />
            <span className="toggle-slider"></span>
          </label>
          <span className="form-hint">{t('settings.autoRestoreOnCrashHint')}</span>
        </div>
      </div>

      {/* 保留策略 */}
      <div className="form-section">
        <h3 className="form-section-title">{t('settings.checkpointRetentionPolicy')}</h3>

        <div className="form-group">
          <label className="form-label">{t('settings.retentionPolicy')}</label>
          <select
            value={formData.retention_policy || 'count'}
            onChange={(e) => setFormData({ ...formData, retention_policy: e.target.value as 'count' | 'time' | 'size' })}
            className="form-select"
          >
            <option value="count">{t('settings.retentionPolicyCount')}</option>
            <option value="time">{t('settings.retentionPolicyTime')}</option>
            <option value="size">{t('settings.retentionPolicySize')}</option>
          </select>
          <span className="form-hint">{t('settings.retentionPolicyHint')}</span>
        </div>

        {formData.retention_policy === 'time' && (
          <div className="form-group">
            <label className="form-label">{t('settings.retentionDays')}</label>
            <Input
              type="number"
              min="1"
              max="365"
              value={formData.retention_days || ''}
              onChange={(e) => {
                setFormData({ ...formData, retention_days: parseInt(e.target.value) || undefined });
                setErrors(prev => ({ ...prev, retentionDays: undefined }));
              }}
              placeholder="30"
              className="form-input"
              error={errors.retentionDays}
            />
            <span className="form-hint">{t('settings.retentionDaysHint')}</span>
          </div>
        )}

        {formData.retention_policy === 'size' && (
          <div className="form-group">
            <label className="form-label">{t('settings.retentionSizeMb')}</label>
            <Input
              type="number"
              min="1"
              max="10000"
              value={formData.retention_size_mb || ''}
              onChange={(e) => {
                setFormData({ ...formData, retention_size_mb: parseInt(e.target.value) || undefined });
                setErrors(prev => ({ ...prev, retentionSize: undefined }));
              }}
              placeholder="100"
              className="form-input"
              error={errors.retentionSize}
            />
            <span className="form-hint">{t('settings.retentionSizeMbHint')}</span>
          </div>
        )}
      </div>

      {/* 压缩设置 */}
      <div className="form-section">
        <h3 className="form-section-title">{t('settings.checkpointCompression')}</h3>

        <div className="form-group">
          <label className="form-label">{t('settings.compressSnapshots')}</label>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={formData.compress_snapshots || false}
              onChange={(e) => setFormData({ ...formData, compress_snapshots: e.target.checked })}
            />
            <span className="toggle-slider"></span>
          </label>
          <span className="form-hint">{t('settings.compressSnapshotsHint')}</span>
        </div>
      </div>

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={isSaving}>
          {isSaving ? t('settings.saving') : t('settings.saveConfig')}
        </Button>
      </div>
    </form>
  );
};

export default CheckpointConfigForm;
