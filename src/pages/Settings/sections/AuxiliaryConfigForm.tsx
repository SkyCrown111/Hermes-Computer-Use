import React, { useState } from 'react';
import { Button, Input, XIcon } from '../../../components';
import type { AuxiliaryConfig, AuxiliaryTaskType, AuxiliaryTaskConfig } from '../../../types/config';
import { AUXILIARY_TASK_INFO } from '../../../types/config';

const AuxiliaryConfigForm: React.FC<{
  config: AuxiliaryConfig | null;
  onSave: (taskType: AuxiliaryTaskType, data: AuxiliaryTaskConfig) => void;
  onDelete: (taskType: AuxiliaryTaskType) => void;
  isSaving: boolean;
  t: (key: string) => string;
}> = ({ config, onSave, onDelete, isSaving, t }) => {
  const [selectedTask, setSelectedTask] = useState<AuxiliaryTaskType | null>(null);
  const [formData, setFormData] = useState<Partial<AuxiliaryTaskConfig>>({
    provider: 'auto',
    model: '',
    base_url: '',
    api_key: '',
    timeout: 120,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<AuxiliaryTaskType | null>(null);

  const taskTypes = Object.keys(AUXILIARY_TASK_INFO) as AuxiliaryTaskType[];

  // 遮蔽 API Key 显示
  const maskApiKey = (key: string | undefined): string => {
    if (!key || key.length < 8) return key || '';
    return key.slice(0, 4) + '*'.repeat(Math.min(key.length - 8, 20)) + key.slice(-4);
  };

  const handleTaskSelect = (taskType: AuxiliaryTaskType) => {
    setSelectedTask(taskType);
    const taskConfig = config?.[taskType];
    if (taskConfig) {
      setFormData(taskConfig);
    } else {
      // Reset to defaults
      setFormData({
        provider: 'auto',
        model: '',
        base_url: '',
        api_key: '',
        timeout: 120,
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTask && formData.provider && formData.model) {
      onSave(selectedTask, formData as AuxiliaryTaskConfig);
    }
  };

  const handleDelete = (taskType: AuxiliaryTaskType) => {
    onDelete(taskType);
    setShowDeleteConfirm(null);
    if (selectedTask === taskType) {
      setSelectedTask(null);
      setFormData({
        provider: 'auto',
        model: '',
        base_url: '',
        api_key: '',
        timeout: 120,
      });
    }
  };

  return (
    <div className="auxiliary-config-container">
      {/* Task List */}
      <div className="auxiliary-task-list">
        <label className="form-label">{t('settings.auxiliaryTask')}</label>
        <div className="task-list">
          {taskTypes.map(taskType => {
            const hasConfig = config?.[taskType];
            const info = AUXILIARY_TASK_INFO[taskType];
            return (
              <div
                key={taskType}
                className={`task-item ${selectedTask === taskType ? 'active' : ''} ${hasConfig ? 'configured' : ''}`}
                onClick={() => handleTaskSelect(taskType)}
              >
                <div className="task-info">
                  <span className="task-name">{t(info.nameKey)}</span>
                  <span className="task-status">
                    {hasConfig ? t('settings.auxiliaryCustomConfigured') : t('settings.auxiliaryUsingDefault')}
                  </span>
                </div>
                {hasConfig && (
                  <button
                    type="button"
                    className="delete-task-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(taskType);
                    }}
                    title={t('settings.auxiliaryDeleteConfig')}
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Task Config Form */}
      {selectedTask && (
        <form onSubmit={handleSubmit} className="config-form auxiliary-form">
          <div className="form-header">
            <h3>{t(AUXILIARY_TASK_INFO[selectedTask].nameKey)}</h3>
            <p>{t(AUXILIARY_TASK_INFO[selectedTask].descKey)}</p>
          </div>

          <div className="form-group">
            <label className="form-label">{t('settings.auxiliaryProvider')}</label>
            <select
              value={formData.provider || 'auto'}
              onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
              className="form-select"
            >
              <option value="auto">Auto (使用默认配置)</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="openrouter">OpenRouter</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">{t('settings.auxiliaryModel')}</label>
            <Input
              value={formData.model || ''}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              placeholder="gpt-4o-mini"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('settings.auxiliaryBaseUrl')}</label>
            <Input
              value={formData.base_url || ''}
              onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="form-input"
            />
            <span className="form-hint">{t('settings.customApiEndpoint')}</span>
          </div>

          <div className="form-group">
            <label className="form-label">{t('settings.auxiliaryApiKey')}</label>
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
          </div>

          <div className="form-group">
            <label className="form-label">{t('settings.auxiliaryTimeout')} (秒)</label>
            <Input
              type="number"
              value={formData.timeout || 120}
              onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) || 120 })}
              placeholder="120"
              className="form-input"
            />
          </div>

          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={isSaving || !formData.model}>
              {isSaving ? t('settings.saving') : t('settings.saveConfig')}
            </Button>
            {config?.[selectedTask] && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowDeleteConfirm(selectedTask)}
                disabled={isSaving}
              >
                {t('settings.auxiliaryDeleteConfig')}
              </Button>
            )}
          </div>
        </form>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(null)}>
          <div className="modal-content delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('settings.auxiliaryDeleteConfig')}</h3>
              <button className="close-button" onClick={() => setShowDeleteConfirm(null)}>
                <XIcon size={14} />
              </button>
            </div>
            <div className="modal-body">
              <p>{t('settings.auxiliaryDeleteConfirm')}</p>
              <p className="task-name-display">{t(AUXILIARY_TASK_INFO[showDeleteConfirm].nameKey)}</p>
            </div>
            <div className="modal-footer">
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="error" onClick={() => handleDelete(showDeleteConfirm)}>
                {t('settings.auxiliaryDeleteConfig')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuxiliaryConfigForm;
