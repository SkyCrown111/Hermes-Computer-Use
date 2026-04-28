import React, { useEffect, useState, useRef } from 'react';
import { Card, Button, Input, SettingsIcon, ZapIcon, TerminalIcon, SaveIcon, RefreshIcon, AlertIcon, FileTextIcon, CheckIcon, XIcon } from '../../components';
import { useSettingsStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../stores/toastStore';
import { validateNumber, validatePath } from '../../utils/validation';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  checkForUpdates,
  installPendingUpdate,
  type UpdateInfo,
} from '../../services/updateApi';
import { logger } from '../../lib/logger';
import type {
  ModelConfig,
  AgentConfig,
  TerminalConfig,
  CompressionConfig,
  CheckpointConfig,
  AuxiliaryConfig,
  AuxiliaryTaskType,
  AuxiliaryTaskConfig,
  CustomProvider,
  FallbackProvider,
  CredentialPoolStrategy,
  DisplayConfig,
  MemoryConfig,
  ApprovalConfig,
  ApprovalMode,
} from '../../types/config';
import { AUXILIARY_TASK_INFO } from '../../types/config';
import './Settings.css';

// 配置节类型
type ConfigSection = 'model' | 'agent' | 'terminal' | 'compression' | 'checkpoint' | 'auxiliary' | 'display' | 'providers' | 'memory' | 'approval' | 'update';

// 配置节图标
const SectionIcon: React.FC<{ section: ConfigSection; size?: number }> = ({ section, size = 16 }) => {
  switch (section) {
    case 'model': return <SettingsIcon size={size} />;
    case 'agent': return <ZapIcon size={size} />;
    case 'terminal': return <TerminalIcon size={size} />;
    case 'compression': return <SaveIcon size={size} />;
    case 'checkpoint': return <SaveIcon size={size} />;
    case 'auxiliary': return <ZapIcon size={size} />;
    case 'display': return <SettingsIcon size={size} />;
    case 'providers': return <SettingsIcon size={size} />;
    case 'memory': return <SettingsIcon size={size} />;
    case 'approval': return <SettingsIcon size={size} />;
    case 'update': return <RefreshIcon size={size} />;
  }
};

// 配置节标题
const getSectionTitles = (t: (key: string) => string): Record<ConfigSection, { title: string; description: string }> => ({
  model: { title: t('settings.modelConfig'), description: t('settings.modelConfigDesc') },
  agent: { title: t('settings.agentConfig'), description: t('settings.agentConfigDesc') },
  terminal: { title: t('settings.terminalConfig'), description: t('settings.terminalConfigDesc') },
  compression: { title: t('settings.compressionConfig'), description: t('settings.compressionConfigDesc') },
  checkpoint: { title: t('settings.checkpointConfig'), description: t('settings.checkpointConfigDesc') },
  auxiliary: { title: t('settings.auxiliaryConfig'), description: t('settings.auxiliaryConfigDesc') },
  display: { title: t('settings.displayConfig'), description: t('settings.displayConfigDesc') },
  providers: { title: t('settings.providersConfig'), description: t('settings.providersConfigDesc') },
  memory: { title: t('settings.memoryConfig'), description: t('settings.memoryConfigDesc') },
  approval: { title: t('settings.approvalConfig'), description: t('settings.approvalConfigDesc') },
  update: { title: t('settings.update'), description: t('settings.updateDesc') },
});

// 模型配置表单
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

// Agent 配置表单
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

// 终端配置表单
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

// 压缩配置表单
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

// 检查点配置表单
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

// Auxiliary 任务路由配置表单
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

// Providers 配置表单
const ProvidersConfigForm: React.FC<{
  customProviders: CustomProvider[];
  fallbackProviders: FallbackProvider[];
  credentialPoolStrategies: Record<string, CredentialPoolStrategy>;
  onAddCustomProvider: (provider: CustomProvider) => void;
  onUpdateCustomProvider: (index: number, provider: CustomProvider) => void;
  onDeleteCustomProvider: (index: number) => void;
  onAddFallbackProvider: (provider: FallbackProvider) => void;
  onDeleteFallbackProvider: (index: number) => void;
  onUpdateStrategy: (providerName: string, strategy: CredentialPoolStrategy) => void;
  isSaving: boolean;
  t: (key: string) => string;
}> = ({
  customProviders,
  fallbackProviders,
  credentialPoolStrategies,
  onAddCustomProvider,
  onUpdateCustomProvider,
  onDeleteCustomProvider,
  onAddFallbackProvider,
  onDeleteFallbackProvider,
  onUpdateStrategy,
  isSaving,
  t,
}) => {
  const [activeTab, setActiveTab] = useState<'custom' | 'fallback' | 'strategies'>('custom');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<number | null>(null);
  const [showAddFallbackModal, setShowAddFallbackModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ type: 'custom' | 'fallback'; index: number } | null>(null);
  const [newProvider, setNewProvider] = useState<CustomProvider>({
    name: '',
    base_url: '',
    api_key: '',
    model: '',
    api_mode: 'chat_completions',
    key_env: '',
  });
  const [newFallback, setNewFallback] = useState<FallbackProvider>({
    name: '',
    model: '',
    priority: 1,
  });
  const [showApiKey, setShowApiKey] = useState(false);

  const apiModes = [
    { value: 'chat_completions', label: t('settings.apiModeChatCompletions') },
    { value: 'anthropic_messages', label: t('settings.apiModeAnthropic') },
    { value: 'codex_responses', label: t('settings.apiModeCodex') },
  ];

  const strategies = [
    { value: 'fill_first', label: t('settings.strategyFillFirst') },
    { value: 'round_robin', label: t('settings.strategyRoundRobin') },
    { value: 'least_used', label: t('settings.strategyLeastUsed') },
    { value: 'random', label: t('settings.strategyRandom') },
  ];

  const maskApiKey = (key: string | undefined): string => {
    if (!key || key.length < 8) return key || '';
    return key.slice(0, 4) + '*'.repeat(Math.min(key.length - 8, 20)) + key.slice(-4);
  };

  const handleAddProvider = () => {
    if (newProvider.name && newProvider.base_url) {
      onAddCustomProvider(newProvider);
      setNewProvider({
        name: '',
        base_url: '',
        api_key: '',
        model: '',
        api_mode: 'chat_completions',
        key_env: '',
      });
      setShowAddModal(false);
    }
  };

  const handleEditProvider = () => {
    if (showEditModal !== null) {
      onUpdateCustomProvider(showEditModal, newProvider);
      setShowEditModal(null);
      setNewProvider({
        name: '',
        base_url: '',
        api_key: '',
        model: '',
        api_mode: 'chat_completions',
        key_env: '',
      });
    }
  };

  const handleAddFallback = () => {
    if (newFallback.name) {
      onAddFallbackProvider(newFallback);
      setNewFallback({ name: '', model: '', priority: 1 });
      setShowAddFallbackModal(false);
    }
  };

  const handleDelete = () => {
    if (showDeleteConfirm) {
      if (showDeleteConfirm.type === 'custom') {
        onDeleteCustomProvider(showDeleteConfirm.index);
      } else {
        onDeleteFallbackProvider(showDeleteConfirm.index);
      }
      setShowDeleteConfirm(null);
    }
  };

  const openEditModal = (index: number) => {
    const provider = customProviders[index];
    setNewProvider({ ...provider });
    setShowEditModal(index);
  };

  return (
    <div className="providers-config-container">
      {/* Tabs */}
      <div className="providers-tabs">
        <button
          className={`providers-tab ${activeTab === 'custom' ? 'active' : ''}`}
          onClick={() => setActiveTab('custom')}
        >
          {t('settings.customProviders')} ({customProviders.length})
        </button>
        <button
          className={`providers-tab ${activeTab === 'fallback' ? 'active' : ''}`}
          onClick={() => setActiveTab('fallback')}
        >
          {t('settings.fallbackProviders')} ({fallbackProviders.length})
        </button>
        <button
          className={`providers-tab ${activeTab === 'strategies' ? 'active' : ''}`}
          onClick={() => setActiveTab('strategies')}
        >
          {t('settings.credentialPoolStrategies')} ({Object.keys(credentialPoolStrategies).length})
        </button>
      </div>

      {/* Custom Providers Tab */}
      {activeTab === 'custom' && (
        <div className="providers-tab-content">
          <div className="providers-list-header">
            <h3>{t('settings.customProviders')}</h3>
            <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>
              + {t('settings.addCustomProvider')}
            </Button>
          </div>

          {customProviders.length === 0 ? (
            <div className="providers-empty">
              <p>{t('settings.noCustomProviders')}</p>
            </div>
          ) : (
            <div className="providers-list">
              {customProviders.map((provider, index) => (
                <div key={index} className="provider-item">
                  <div className="provider-info">
                    <h4 className="provider-name">{provider.name}</h4>
                    <div className="provider-details">
                      <span className="provider-detail">
                        <strong>URL:</strong> {provider.base_url}
                      </span>
                      {provider.model && (
                        <span className="provider-detail">
                          <strong>{t('settings.providerModel')}:</strong> {provider.model}
                        </span>
                      )}
                      {provider.api_mode && (
                        <span className="provider-detail">
                          <strong>{t('settings.providerApiMode')}:</strong> {provider.api_mode}
                        </span>
                      )}
                      {provider.api_key && (
                        <span className="provider-detail">
                          <strong>{t('settings.providerApiKey')}:</strong> {maskApiKey(provider.api_key)}
                        </span>
                      )}
                      {provider.key_env && (
                        <span className="provider-detail">
                          <strong>{t('settings.providerKeyEnv')}:</strong> {provider.key_env}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="provider-actions">
                    <Button variant="secondary" size="sm" onClick={() => openEditModal(index)}>
                      {t('common.edit')}
                    </Button>
                    <Button variant="error" size="sm" onClick={() => setShowDeleteConfirm({ type: 'custom', index })}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fallback Providers Tab */}
      {activeTab === 'fallback' && (
        <div className="providers-tab-content">
          <div className="providers-list-header">
            <h3>{t('settings.fallbackProviders')}</h3>
            <Button variant="primary" size="sm" onClick={() => setShowAddFallbackModal(true)}>
              + {t('settings.addFallbackProvider')}
            </Button>
          </div>

          {fallbackProviders.length === 0 ? (
            <div className="providers-empty">
              <p>{t('settings.noFallbackProviders')}</p>
            </div>
          ) : (
            <div className="providers-list">
              {fallbackProviders.map((provider, index) => (
                <div key={index} className="provider-item fallback-item">
                  <div className="provider-info">
                    <h4 className="provider-name">{provider.name}</h4>
                    <div className="provider-details">
                      {provider.model && (
                        <span className="provider-detail">
                          <strong>{t('settings.providerModel')}:</strong> {provider.model}
                        </span>
                      )}
                      {provider.priority !== undefined && (
                        <span className="provider-detail">
                          <strong>{t('settings.providerPriority')}:</strong> {provider.priority}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="provider-actions">
                    <Button variant="error" size="sm" onClick={() => setShowDeleteConfirm({ type: 'fallback', index })}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Credential Pool Strategies Tab */}
      {activeTab === 'strategies' && (
        <div className="providers-tab-content">
          <div className="providers-list-header">
            <h3>{t('settings.credentialPoolStrategies')}</h3>
          </div>

          {Object.keys(credentialPoolStrategies).length === 0 ? (
            <div className="providers-empty">
              <p>{t('settings.noStrategies')}</p>
            </div>
          ) : (
            <div className="strategies-list">
              {Object.entries(credentialPoolStrategies).map(([providerName, strategy]) => (
                <div key={providerName} className="strategy-item">
                  <span className="strategy-provider-name">{providerName}</span>
                  <select
                    value={strategy}
                    onChange={(e) => onUpdateStrategy(providerName, e.target.value as CredentialPoolStrategy)}
                    className="form-select strategy-select"
                    disabled={isSaving}
                  >
                    {strategies.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Custom Provider Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content provider-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('settings.addCustomProvider')}</h3>
              <button className="close-button" onClick={() => setShowAddModal(false)}>
                <XIcon size={14} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('settings.providerName')} *</label>
                <Input
                  value={newProvider.name}
                  onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                  placeholder="my-provider"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.providerBaseUrl')} *</label>
                <Input
                  value={newProvider.base_url}
                  onChange={(e) => setNewProvider({ ...newProvider, base_url: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.providerApiKey')}</label>
                <div className="api-key-input-wrapper">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={newProvider.api_key || ''}
                    onChange={(e) => setNewProvider({ ...newProvider, api_key: e.target.value })}
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
                <label className="form-label">{t('settings.providerModel')}</label>
                <Input
                  value={newProvider.model || ''}
                  onChange={(e) => setNewProvider({ ...newProvider, model: e.target.value })}
                  placeholder="gpt-4o"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.providerApiMode')}</label>
                <select
                  value={newProvider.api_mode || 'chat_completions'}
                  onChange={(e) => setNewProvider({ ...newProvider, api_mode: e.target.value as CustomProvider['api_mode'] })}
                  className="form-select"
                >
                  {apiModes.map(mode => (
                    <option key={mode.value} value={mode.value}>{mode.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.providerKeyEnv')}</label>
                <Input
                  value={newProvider.key_env || ''}
                  onChange={(e) => setNewProvider({ ...newProvider, key_env: e.target.value })}
                  placeholder="MY_API_KEY"
                  className="form-input"
                />
                <span className="form-hint">Optional: Environment variable name for API key</span>
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="secondary" onClick={() => setShowAddModal(false)}>
                {t('settings.cancel')}
              </Button>
              <Button variant="primary" onClick={handleAddProvider} disabled={!newProvider.name || !newProvider.base_url || isSaving}>
                {t('settings.addCustomProvider')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Custom Provider Modal */}
      {showEditModal !== null && (
        <div className="modal-overlay" onClick={() => setShowEditModal(null)}>
          <div className="modal-content provider-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('settings.editProvider')}</h3>
              <button className="close-button" onClick={() => setShowEditModal(null)}>
                <XIcon size={14} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('settings.providerName')} *</label>
                <Input
                  value={newProvider.name}
                  onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                  placeholder="my-provider"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.providerBaseUrl')} *</label>
                <Input
                  value={newProvider.base_url}
                  onChange={(e) => setNewProvider({ ...newProvider, base_url: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.providerApiKey')}</label>
                <div className="api-key-input-wrapper">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={showApiKey ? (newProvider.api_key || '') : maskApiKey(newProvider.api_key)}
                    onChange={(e) => setNewProvider({ ...newProvider, api_key: e.target.value })}
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
                <label className="form-label">{t('settings.providerModel')}</label>
                <Input
                  value={newProvider.model || ''}
                  onChange={(e) => setNewProvider({ ...newProvider, model: e.target.value })}
                  placeholder="gpt-4o"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.providerApiMode')}</label>
                <select
                  value={newProvider.api_mode || 'chat_completions'}
                  onChange={(e) => setNewProvider({ ...newProvider, api_mode: e.target.value as CustomProvider['api_mode'] })}
                  className="form-select"
                >
                  {apiModes.map(mode => (
                    <option key={mode.value} value={mode.value}>{mode.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.providerKeyEnv')}</label>
                <Input
                  value={newProvider.key_env || ''}
                  onChange={(e) => setNewProvider({ ...newProvider, key_env: e.target.value })}
                  placeholder="MY_API_KEY"
                  className="form-input"
                />
                <span className="form-hint">Optional: Environment variable name for API key</span>
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="secondary" onClick={() => setShowEditModal(null)}>
                {t('settings.cancel')}
              </Button>
              <Button variant="primary" onClick={handleEditProvider} disabled={!newProvider.name || !newProvider.base_url || isSaving}>
                {t('settings.saveConfig')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Fallback Provider Modal */}
      {showAddFallbackModal && (
        <div className="modal-overlay" onClick={() => setShowAddFallbackModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('settings.addFallbackProvider')}</h3>
              <button className="close-button" onClick={() => setShowAddFallbackModal(false)}>
                <XIcon size={14} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('settings.providerName')} *</label>
                <Input
                  value={newFallback.name}
                  onChange={(e) => setNewFallback({ ...newFallback, name: e.target.value })}
                  placeholder="openai"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.providerModel')}</label>
                <Input
                  value={newFallback.model || ''}
                  onChange={(e) => setNewFallback({ ...newFallback, model: e.target.value })}
                  placeholder="gpt-4o"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.providerPriority')}</label>
                <Input
                  type="number"
                  min="1"
                  value={newFallback.priority || 1}
                  onChange={(e) => setNewFallback({ ...newFallback, priority: parseInt(e.target.value) || 1 })}
                  className="form-input"
                />
                <span className="form-hint">Lower number = higher priority</span>
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="secondary" onClick={() => setShowAddFallbackModal(false)}>
                {t('settings.cancel')}
              </Button>
              <Button variant="primary" onClick={handleAddFallback} disabled={!newFallback.name || isSaving}>
                {t('settings.addFallbackProvider')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(null)}>
          <div className="modal-content delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('settings.deleteProvider')}</h3>
              <button className="close-button" onClick={() => setShowDeleteConfirm(null)}>
                <XIcon size={14} />
              </button>
            </div>
            <div className="modal-body">
              <p>{t('settings.deleteProviderConfirm')}</p>
              <p className="task-name-display">
                {showDeleteConfirm.type === 'custom'
                  ? customProviders[showDeleteConfirm.index]?.name
                  : fallbackProviders[showDeleteConfirm.index]?.name}
              </p>
            </div>
            <div className="modal-footer">
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="error" onClick={handleDelete}>
                {t('common.delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 更新配置
const UpdateSection: React.FC<{ t: (key: string) => string }> = ({ t }) => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showRestartPrompt, setShowRestartPrompt] = useState(false);

  const handleCheck = async () => {
    setIsChecking(true);
    setUpdateInfo(null);
    try {
      setUpdateInfo(prev => prev ? { ...prev, status: 'checking' } : null);
      const info = await checkForUpdates();
      setUpdateInfo(info);
    } finally {
      setIsChecking(false);
    }
  };

  const handleInstall = async () => {
    setUpdateInfo(prev => prev ? { ...prev, status: 'downloading' } : null);
    try {
      await installPendingUpdate((progress) => {
        setUpdateInfo(progress);
      });
      // Download complete, show restart prompt
      setShowRestartPrompt(true);
    } catch (err) {
      setUpdateInfo(prev =>
        prev ? { ...prev, status: 'error', error: err instanceof Error ? err.message : 'Install failed' } : null
      );
    }
  };

  const handleRestart = async () => {
    try {
      await relaunch();
    } catch (err) {
      logger.error('[Settings] Failed to restart app:', err);
      // Fallback to page reload if restart fails
      window.location.reload();
    }
  };

  useEffect(() => {
    checkForUpdates().then(info => {
      setUpdateInfo(info);
    });
  }, []);

  // Format bytes to human readable
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="update-section">
      {/* Restart Prompt Modal */}
      {showRestartPrompt && (
        <div className="restart-prompt-overlay">
          <div className="restart-prompt-modal">
            <div className="restart-prompt-icon"><RefreshIcon size={24} /></div>
            <h3>{t('settings.updateReady')}</h3>
            <p>{t('settings.updateReadyDesc')}</p>
            <div className="restart-prompt-actions">
              <Button variant="secondary" onClick={() => setShowRestartPrompt(false)}>
                {t('common.later')}
              </Button>
              <Button variant="primary" onClick={handleRestart}>
                {t('settings.restartNow')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="update-info">
        <div className="update-info-row">
          <span className="update-label">{t('settings.currentVersion')}</span>
          <span className="update-value">{updateInfo?.currentVersion || '...'}</span>
        </div>

        {updateInfo?.status === 'checking' && (
          <div className="update-status checking">
            <div className="update-spinner" />
            <span>{t('settings.checkingUpdates')}</span>
          </div>
        )}

        {updateInfo?.status === 'uptodate' && (
          <div className="update-status uptodate">
            <span className="update-status-icon"><CheckIcon size={14} /></span>
            <span>{t('settings.appUptodate')}</span>
          </div>
        )}

        {updateInfo?.available && (
          <div className="update-available">
            <div className="update-available-header">
              <span className="update-status-icon update-icon-new"><RefreshIcon size={14} /></span>
              <span>{t('settings.updateAvailable')}</span>
            </div>
            <div className="update-info-row">
              <span className="update-label">{t('settings.newVersion')}</span>
              <span className="update-value">{updateInfo.newVersion}</span>
            </div>
            {updateInfo.releaseDate && (
              <div className="update-info-row">
                <span className="update-label">{t('settings.releaseDate')}</span>
                <span className="update-value">{updateInfo.releaseDate}</span>
              </div>
            )}
            {updateInfo.releaseNotes && (
              <div className="update-release-notes">
                <span className="update-label">{t('settings.releaseNotes')}</span>
                <pre className="update-notes-text">{updateInfo.releaseNotes}</pre>
              </div>
            )}
          </div>
        )}

        {updateInfo?.status === 'downloading' && (
          <div className="update-status downloading">
            <div className="update-spinner" />
            <span>{t('settings.downloadingUpdate')}</span>
            {updateInfo.downloadProgress !== undefined && (
              <div className="download-progress">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${updateInfo.downloadProgress}%` }}
                  />
                </div>
                <span className="progress-text">
                  {updateInfo.downloadProgress}%
                  {updateInfo.downloadedBytes && ` (${formatBytes(updateInfo.downloadedBytes)})`}
                </span>
              </div>
            )}
          </div>
        )}

        {updateInfo?.status === 'ready' && (
          <div className="update-status ready">
            <span className="update-status-icon"><CheckIcon size={14} /></span>
            <span>{t('settings.updateDownloaded')}</span>
          </div>
        )}

        {updateInfo?.status === 'error' && (
          <div className="update-status error">
            <span className="update-status-icon"><AlertIcon size={14} /></span>
            <span>{updateInfo.error || t('settings.updateCheckFailed')}</span>
          </div>
        )}
      </div>

      <div className="update-actions">
        <Button
          variant="secondary"
          onClick={handleCheck}
          disabled={isChecking || updateInfo?.status === 'downloading'}
        >
          {isChecking ? t('settings.checking') : t('settings.checkForUpdates')}
        </Button>
        {updateInfo?.available && updateInfo.status !== 'ready' && (
          <Button
            variant="primary"
            onClick={handleInstall}
            disabled={updateInfo.status === 'downloading'}
          >
            {updateInfo.status === 'downloading' ? t('settings.downloading') : t('settings.installUpdate')}
          </Button>
        )}
        {updateInfo?.status === 'ready' && (
          <Button variant="primary" onClick={handleRestart}>
            {t('settings.restartNow')}
          </Button>
        )}
      </div>
    </div>
  );
};

// Display 配置表单
const DisplayConfigForm: React.FC<{
  config: DisplayConfig | null;
  onSave: (data: Partial<DisplayConfig>) => void;
  isSaving: boolean;
  t: (key: string) => string;
}> = ({ config, onSave, isSaving, t }) => {
  const [formData, setFormData] = useState<Partial<DisplayConfig>>({
    compact: false,
    skin: 'default',
    streaming: true,
    show_reasoning: false,
    tool_preview: true,
    personality: 'default',
    resume_display: 'full',
    busy_input_mode: 'interrupt',
    bell_on_complete: false,
    final_response_markdown: 'render',
    inline_diffs: true,
    show_cost: false,
    tool_progress: 'all',
  });

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="config-form">
      {/* 基础显示设置 */}
      <div className="form-section-title">{t('prefs.appearance')}</div>

      <div className="form-group">
        <label className="form-label">{t('settings.displayCompact')}</label>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={formData.compact || false}
            onChange={(e) => setFormData({ ...formData, compact: e.target.checked })}
          />
          <span className="toggle-slider"></span>
        </label>
        <span className="form-hint">{t('settings.displayCompactHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.displaySkin')}</label>
        <select
          value={formData.skin || 'default'}
          onChange={(e) => setFormData({ ...formData, skin: e.target.value })}
          className="form-select"
        >
          <option value="default">{t('display.skinDefault')}</option>
          <option value="dark">{t('display.skinDark')}</option>
          <option value="light">{t('display.skinLight')}</option>
          <option value="minimal">{t('display.skinMinimal')}</option>
          <option value="compact">{t('display.skinCompact')}</option>
        </select>
        <span className="form-hint">{t('settings.displaySkinHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.displayPersonality')}</label>
        <select
          value={formData.personality || 'default'}
          onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
          className="form-select"
        >
          <option value="default">{t('display.personalityDefault')}</option>
          <option value="kawaii">{t('display.personalityKawaii')}</option>
          <option value="professional">{t('display.personalityProfessional')}</option>
          <option value="friendly">{t('display.personalityFriendly')}</option>
          <option value="concise">{t('display.personalityConcise')}</option>
        </select>
        <span className="form-hint">{t('settings.displayPersonalityHint')}</span>
      </div>

      {/* 响应显示设置 */}
      <div className="form-section-title">{t('chat.title')}</div>

      <div className="form-group">
        <label className="form-label">{t('settings.displayStreaming')}</label>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={formData.streaming ?? true}
            onChange={(e) => setFormData({ ...formData, streaming: e.target.checked })}
          />
          <span className="toggle-slider"></span>
        </label>
        <span className="form-hint">{t('settings.displayStreamingHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.displayShowReasoning')}</label>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={formData.show_reasoning || false}
            onChange={(e) => setFormData({ ...formData, show_reasoning: e.target.checked })}
          />
          <span className="toggle-slider"></span>
        </label>
        <span className="form-hint">{t('settings.displayShowReasoningHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.displayToolPreview')}</label>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={formData.tool_preview ?? true}
            onChange={(e) => setFormData({ ...formData, tool_preview: e.target.checked })}
          />
          <span className="toggle-slider"></span>
        </label>
        <span className="form-hint">{t('settings.displayToolPreviewHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.displayToolProgress')}</label>
        <select
          value={formData.tool_progress || 'all'}
          onChange={(e) => setFormData({ ...formData, tool_progress: e.target.value as 'all' | 'minimal' | 'none' })}
          className="form-select"
        >
          <option value="all">{t('display.progressAll')}</option>
          <option value="minimal">{t('display.progressMinimal')}</option>
          <option value="none">{t('display.progressNone')}</option>
        </select>
        <span className="form-hint">{t('settings.displayToolProgressHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.displayFinalResponseMarkdown')}</label>
        <select
          value={formData.final_response_markdown || 'render'}
          onChange={(e) => setFormData({ ...formData, final_response_markdown: e.target.value as 'render' | 'strip' | 'raw' })}
          className="form-select"
        >
          <option value="render">{t('display.markdownRender')}</option>
          <option value="strip">{t('display.markdownStrip')}</option>
          <option value="raw">{t('display.markdownRaw')}</option>
        </select>
        <span className="form-hint">{t('settings.displayFinalResponseMarkdownHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.displayInlineDiffs')}</label>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={formData.inline_diffs ?? true}
            onChange={(e) => setFormData({ ...formData, inline_diffs: e.target.checked })}
          />
          <span className="toggle-slider"></span>
        </label>
        <span className="form-hint">{t('settings.displayInlineDiffsHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.displayShowCost')}</label>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={formData.show_cost || false}
            onChange={(e) => setFormData({ ...formData, show_cost: e.target.checked })}
          />
          <span className="toggle-slider"></span>
        </label>
        <span className="form-hint">{t('settings.displayShowCostHint')}</span>
      </div>

      {/* 高级设置 */}
      <div className="form-section-title">{t('settings.advancedSettings')}</div>

      <div className="form-group">
        <label className="form-label">{t('settings.displayResumeDisplay')}</label>
        <select
          value={formData.resume_display || 'full'}
          onChange={(e) => setFormData({ ...formData, resume_display: e.target.value as 'full' | 'summary' | 'none' })}
          className="form-select"
        >
          <option value="full">{t('display.resumeFull')}</option>
          <option value="summary">{t('display.resumeSummary')}</option>
          <option value="none">{t('display.resumeNone')}</option>
        </select>
        <span className="form-hint">{t('settings.displayResumeDisplayHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.displayBusyInputMode')}</label>
        <select
          value={formData.busy_input_mode || 'interrupt'}
          onChange={(e) => setFormData({ ...formData, busy_input_mode: e.target.value as 'interrupt' | 'queue' | 'block' })}
          className="form-select"
        >
          <option value="interrupt">{t('display.busyInterrupt')}</option>
          <option value="queue">{t('display.busyQueue')}</option>
          <option value="block">{t('display.busyBlock')}</option>
        </select>
        <span className="form-hint">{t('settings.displayBusyInputModeHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.displayBellOnComplete')}</label>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={formData.bell_on_complete || false}
            onChange={(e) => setFormData({ ...formData, bell_on_complete: e.target.checked })}
          />
          <span className="toggle-slider"></span>
        </label>
        <span className="form-hint">{t('settings.displayBellOnCompleteHint')}</span>
      </div>

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={isSaving}>
          {isSaving ? t('settings.saving') : t('settings.saveConfig')}
        </Button>
      </div>
    </form>
  );
};

// Memory 配置表单
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

// Approval 配置表单
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

const YamlEditor: React.FC<{
  yaml: string;
  onChange: (yaml: string) => void;
  onSave: (yaml: string) => void;
  isSaving: boolean;
  t: (key: string) => string;
}> = ({ yaml, onChange, onSave, isSaving, t }) => {
  const handleSave = () => {
    onSave(yaml);
  };

  return (
    <div className="yaml-editor-container">
      <textarea
        className="yaml-editor"
        value={yaml}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      <div className="yaml-actions">
        <Button variant="primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? t('settings.saving') : t('settings.saveYaml')}
        </Button>
      </div>
    </div>
  );
};

export const Settings: React.FC = () => {
  const { t } = useTranslation();
  const sectionTitles = getSectionTitles(t);
  const {
    modelConfig,
    agentConfig,
    terminalConfig,
    compressionConfig,
    checkpointConfig,
    memoryConfig,
    rawYaml,
    isLoadingModel,
    isLoadingAgent,
    isLoadingTerminal,
    isLoadingCompression,
    isLoadingCheckpoint,
    isLoadingMemory,
    isLoadingRaw,
    editMode,
    error,
    successMessage,
    isSaving,
    fetchAllConfigs,
    fetchRawYaml,
    updateModelConfig,
    updateAgentConfig,
    updateTerminalConfig,
    updateCompressionConfig,
    updateCheckpointConfig,
    updateMemoryConfig,
    updateAuxiliaryTaskConfig,
    deleteAuxiliaryTaskConfig,
    updateRawYaml,
    setEditMode,
    setRawYaml,
    clearError,
    clearSuccessMessage,
    exportConfig,
    importConfig,
    auxiliaryConfig,
    isLoadingAuxiliary,
    // Providers config
    providersConfig,
    isLoadingProviders,
    addCustomProvider,
    updateCustomProvider,
    deleteCustomProvider,
    addFallbackProvider,
    deleteFallbackProvider,
    updateCredentialPoolStrategy,
    // Display config
    displayConfig,
    isLoadingDisplay,
    updateDisplayConfig,
    // Approval config
    approvalConfig,
    isLoadingApproval,
    updateApprovalConfig,
  } = useSettingsStore();

  const [activeSection, setActiveSection] = useState<ConfigSection>('model');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const originalYamlRef = useRef<string>('');

  useEffect(() => {
    fetchAllConfigs();
  }, [fetchAllConfigs]);

  // Debug: log when modelConfig changes
  useEffect(() => {
    logger.debug('[Settings] modelConfig from store:', modelConfig);
  }, [modelConfig]);

  useEffect(() => {
    if (editMode === 'yaml') {
      fetchRawYaml().then(() => {
        // Store original YAML for comparison
        originalYamlRef.current = useSettingsStore.getState().rawYaml;
      });
    }
  }, [editMode, fetchRawYaml]);

  // Track YAML changes
  useEffect(() => {
    if (editMode === 'yaml' && originalYamlRef.current) {
      setHasUnsavedChanges(rawYaml !== originalYamlRef.current);
    }
  }, [rawYaml, editMode]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // 导出配置
  const handleExport = async () => {
    const jsonStr = await exportConfig();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hermes-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 导入配置
  const handleImport = async () => {
    await importConfig(importText);
    setShowImportModal(false);
    setImportText('');
  };

  // 从文件导入
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setImportText(content);
      };
      reader.readAsText(file);
    }
  };

  // Handle YAML save with dirty state reset
  const handleYamlSave = async (yaml: string) => {
    await updateRawYaml(yaml);
    originalYamlRef.current = yaml;
    setHasUnsavedChanges(false);
    toast.success(t('settings.saved.config'));
  };

  // 渲染表单内容
  const renderFormContent = () => {
    switch (activeSection) {
      case 'model':
        return (
          <ModelConfigForm
            config={modelConfig}
            onSave={updateModelConfig}
            isSaving={isSaving}
            t={t}
          />
        );
      case 'agent':
        return (
          <AgentConfigForm
            config={agentConfig}
            onSave={updateAgentConfig}
            isSaving={isSaving}
            t={t}
          />
        );
      case 'terminal':
        return (
          <TerminalConfigForm
            config={terminalConfig}
            onSave={updateTerminalConfig}
            isSaving={isSaving}
            t={t}
          />
        );
      case 'compression':
        return (
          <CompressionConfigForm
            config={compressionConfig}
            onSave={updateCompressionConfig}
            isSaving={isSaving}
            t={t}
          />
        );
      case 'checkpoint':
        return (
          <CheckpointConfigForm
            config={checkpointConfig}
            onSave={updateCheckpointConfig}
            isSaving={isSaving}
            t={t}
          />
        );
      case 'auxiliary':
        return (
          <AuxiliaryConfigForm
            config={auxiliaryConfig}
            onSave={updateAuxiliaryTaskConfig}
            onDelete={deleteAuxiliaryTaskConfig}
            isSaving={isSaving}
            t={t}
          />
        );
      case 'display':
        return (
          <DisplayConfigForm
            config={displayConfig}
            onSave={updateDisplayConfig}
            isSaving={isSaving}
            t={t}
          />
        );
      case 'providers':
        return (
          <ProvidersConfigForm
            customProviders={providersConfig?.custom_providers || []}
            fallbackProviders={providersConfig?.fallback_providers || []}
            credentialPoolStrategies={providersConfig?.credential_pool_strategies || {}}
            onAddCustomProvider={addCustomProvider}
            onUpdateCustomProvider={updateCustomProvider}
            onDeleteCustomProvider={deleteCustomProvider}
            onAddFallbackProvider={addFallbackProvider}
            onDeleteFallbackProvider={deleteFallbackProvider}
            onUpdateStrategy={updateCredentialPoolStrategy}
            isSaving={isSaving}
            t={t}
          />
        );
      case 'memory':
        return (
          <MemoryConfigForm
            config={memoryConfig}
            onSave={updateMemoryConfig}
            isSaving={isSaving}
            t={t}
          />
        );
      case 'approval':
        return (
          <ApprovalConfigForm
            config={approvalConfig}
            onSave={updateApprovalConfig}
            isSaving={isSaving}
            t={t}
          />
        );
      case 'update':
        return <UpdateSection t={t} />;
      default:
        return null;
    }
  };

  // 检查是否正在加载
  const isLoading =
    isLoadingModel ||
    isLoadingAgent ||
    isLoadingTerminal ||
    isLoadingCompression ||
    isLoadingCheckpoint ||
    isLoadingMemory ||
    isLoadingAuxiliary ||
    isLoadingProviders ||
    isLoadingDisplay ||
    isLoadingApproval ||
    isLoadingRaw;

  return (
    <div className="settings-page">
      {/* Header Actions */}
        <div className="settings-header">
          {/* Edit Mode Toggle */}
          <div className="mode-toggle">
            <Button
              variant={editMode === 'form' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setEditMode('form')}
            >
              {t('settings.formMode')}
            </Button>
            <Button
              variant={editMode === 'yaml' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setEditMode('yaml')}
            >
              {t('settings.yamlMode')}
            </Button>
          </div>

          {/* Import/Export */}
          <div className="import-export-actions">
            <Button variant="secondary" size="sm" onClick={handleExport}>
              {t('settings.exportConfig')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowImportModal(true)}>
              {t('settings.importConfig')}
            </Button>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="success-message">
            <span><CheckIcon size={14} /></span>
            <span>{successMessage}</span>
            <button onClick={clearSuccessMessage} className="dismiss-btn">×</button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <span><AlertIcon size={16} /></span>
            <span>{error}</span>
            <button onClick={clearError} className="dismiss-btn">×</button>
          </div>
        )}

        {/* Main Content */}
        <div className="settings-content">
          {editMode === 'form' ? (
            <>
              {/* Section Navigation */}
              <div className="section-nav">
                {(Object.entries(sectionTitles) as [ConfigSection, { title: string; description: string }][]).map(([key, { title }]) => (
                  <button
                    key={key}
                    className={`section-nav-item ${activeSection === key ? 'active' : ''}`}
                    onClick={() => setActiveSection(key)}
                  >
                    <span className="section-nav-icon"><SectionIcon section={key} size={16} /></span>
                    <span className="section-title">{title}</span>
                  </button>
                ))}
              </div>

              {/* Form Section */}
              <Card className="config-card">
                {isLoading ? (
                  <div className="loading-container">
                    <div className="loading-spinner" />
                  </div>
                ) : (
                  <>
                    <div className="config-header">
                      <div className="config-title-group">
                        <span className="config-icon"><SectionIcon section={activeSection} size={20} /></span>
                        <div>
                          <h2 className="config-title">{sectionTitles[activeSection]?.title}</h2>
                          <p className="config-description">
                            {sectionTitles[activeSection]?.description}
                          </p>
                        </div>
                      </div>
                    </div>
                    {renderFormContent()}
                  </>
                )}
              </Card>
            </>
          ) : (
            /* YAML Editor */
            <Card className="yaml-card">
              <div className="config-header">
                <div className="config-title-group">
                  <span className="config-icon"><FileTextIcon size={20} /></span>
                  <div>
                    <h2 className="config-title">{t('settings.yamlEditor')}</h2>
                    <p className="config-description">{t('settings.yamlEditorDesc')}</p>
                  </div>
                </div>
              </div>
              {isLoadingRaw ? (
                <div className="loading-container">
                  <div className="loading-spinner" />
                </div>
              ) : (
                <YamlEditor
                  yaml={rawYaml}
                  onChange={setRawYaml}
                  onSave={handleYamlSave}
                  isSaving={isSaving}
                  t={t}
                />
              )}
            </Card>
          )}
        </div>

        {/* Import Modal */}
        {showImportModal && (
          <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{t('settings.importConfig')}</h3>
                <button className="close-button" onClick={() => setShowImportModal(false)}>
                  <XIcon size={14} />
                </button>
              </div>
              <div className="modal-body">
                <div className="file-import">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json"
                    onChange={handleFileImport}
                    style={{ display: 'none' }}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t('settings.selectFile')}
                  </Button>
                </div>
                <div className="import-textarea-container">
                  <label>{t('settings.pasteJson')}</label>
                  <textarea
                    className="import-textarea"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder='{"model": {...}, "agent": {...}, ...}'
                  />
                </div>
              </div>
              <div className="modal-footer">
                <Button variant="secondary" onClick={() => setShowImportModal(false)}>
                  {t('common.cancel')}
                </Button>
                <Button variant="primary" onClick={handleImport} disabled={!importText}>
                  {t('settings.import')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
};
