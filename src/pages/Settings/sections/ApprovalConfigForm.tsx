import React, { useEffect, useState } from 'react';
import { Button, Input } from '../../../components';
import type { ApprovalConfig, ApprovalMode } from '../../../types/config';

const ApprovalConfigForm: React.FC<{
  config: ApprovalConfig | null;
  onSave: (data: Partial<ApprovalConfig>) => void;
  isSaving: boolean;
  t: (key: string) => string;
}> = ({ config, onSave, isSaving, t }) => {
  const [formData, setFormData] = useState<Partial<ApprovalConfig>>({
    mode: 'ask',
    safe_commands: [],
    dangerous_commands: [],
    remember_session: false,
    show_command_preview: true,
    timeout_seconds: 300,
  });
  const [newSafeCommand, setNewSafeCommand] = useState('');
  const [newDangerousCommand, setNewDangerousCommand] = useState('');

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const addSafeCommand = () => {
    if (newSafeCommand.trim()) {
      setFormData({
        ...formData,
        safe_commands: [...(formData.safe_commands || []), newSafeCommand.trim()],
      });
      setNewSafeCommand('');
    }
  };

  const removeSafeCommand = (index: number) => {
    setFormData({
      ...formData,
      safe_commands: (formData.safe_commands || []).filter((_, i) => i !== index),
    });
  };

  const addDangerousCommand = () => {
    if (newDangerousCommand.trim()) {
      setFormData({
        ...formData,
        dangerous_commands: [...(formData.dangerous_commands || []), newDangerousCommand.trim()],
      });
      setNewDangerousCommand('');
    }
  };

  const removeDangerousCommand = (index: number) => {
    setFormData({
      ...formData,
      dangerous_commands: (formData.dangerous_commands || []).filter((_, i) => i !== index),
    });
  };

  const approvalModes: { value: ApprovalMode; label: string; description: string }[] = [
    { value: 'ask', label: t('settings.approvalModeAsk'), description: t('settings.approvalModeAskDesc') },
    { value: 'auto_approve_safe', label: t('settings.approvalModeSafe'), description: t('settings.approvalModeSafeDesc') },
    { value: 'auto_approve_all', label: t('settings.approvalModeAll'), description: t('settings.approvalModeAllDesc') },
    { value: 'auto_deny', label: t('settings.approvalModeDeny'), description: t('settings.approvalModeDenyDesc') },
  ];

  return (
    <form onSubmit={handleSubmit} className="config-form">
      {/* 审批模式 */}
      <div className="form-section-title">{t('settings.approvalModeTitle')}</div>

      <div className="form-group">
        <label className="form-label">{t('settings.approvalMode')}</label>
        <div className="approval-mode-options">
          {approvalModes.map((mode) => (
            <label key={mode.value} className={`approval-mode-option ${formData.mode === mode.value ? 'selected' : ''}`}>
              <input
                type="radio"
                name="approvalMode"
                value={mode.value}
                checked={formData.mode === mode.value}
                onChange={(e) => setFormData({ ...formData, mode: e.target.value as ApprovalMode })}
              />
              <div className="approval-mode-content">
                <span className="approval-mode-label">{mode.label}</span>
                <span className="approval-mode-desc">{mode.description}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* 安全命令白名单 */}
      <div className="form-section-title">{t('settings.safeCommandsTitle')}</div>

      <div className="form-group">
        <label className="form-label">{t('settings.safeCommands')}</label>
        <div className="command-list-input">
          <Input
            value={newSafeCommand}
            onChange={(e) => setNewSafeCommand(e.target.value)}
            placeholder="ls, cat, echo..."
            className="form-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSafeCommand();
              }
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={addSafeCommand}>
            {t('common.add')}
          </Button>
        </div>
        <span className="form-hint">{t('settings.safeCommandsHint')}</span>
        {formData.safe_commands && formData.safe_commands.length > 0 && (
          <div className="command-tags">
            {formData.safe_commands.map((cmd, index) => (
              <span key={index} className="command-tag safe">
                {cmd}
                <button type="button" onClick={() => removeSafeCommand(index)}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 危险命令黑名单 */}
      <div className="form-section-title">{t('settings.dangerousCommandsTitle')}</div>

      <div className="form-group">
        <label className="form-label">{t('settings.dangerousCommands')}</label>
        <div className="command-list-input">
          <Input
            value={newDangerousCommand}
            onChange={(e) => setNewDangerousCommand(e.target.value)}
            placeholder="rm -rf, sudo, dd..."
            className="form-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addDangerousCommand();
              }
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={addDangerousCommand}>
            {t('common.add')}
          </Button>
        </div>
        <span className="form-hint">{t('settings.dangerousCommandsHint')}</span>
        {formData.dangerous_commands && formData.dangerous_commands.length > 0 && (
          <div className="command-tags">
            {formData.dangerous_commands.map((cmd, index) => (
              <span key={index} className="command-tag dangerous">
                {cmd}
                <button type="button" onClick={() => removeDangerousCommand(index)}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 其他设置 */}
      <div className="form-section-title">{t('settings.approvalOtherSettings')}</div>

      <div className="form-group">
        <label className="form-label">{t('settings.rememberSession')}</label>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={formData.remember_session || false}
            onChange={(e) => setFormData({ ...formData, remember_session: e.target.checked })}
          />
          <span className="toggle-slider"></span>
        </label>
        <span className="form-hint">{t('settings.rememberSessionHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.showCommandPreview')}</label>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={formData.show_command_preview ?? true}
            onChange={(e) => setFormData({ ...formData, show_command_preview: e.target.checked })}
          />
          <span className="toggle-slider"></span>
        </label>
        <span className="form-hint">{t('settings.showCommandPreviewHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.approvalTimeout')}</label>
        <Input
          type="number"
          min="10"
          max="3600"
          value={formData.timeout_seconds || ''}
          onChange={(e) => setFormData({ ...formData, timeout_seconds: parseInt(e.target.value) || undefined })}
          placeholder="300"
          className="form-input"
        />
        <span className="form-hint">{t('settings.approvalTimeoutHint')} (10-3600 {t('common.seconds')})</span>
      </div>

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={isSaving}>
          {isSaving ? t('settings.saving') : t('settings.saveConfig')}
        </Button>
      </div>
    </form>
  );
};

export default ApprovalConfigForm;
