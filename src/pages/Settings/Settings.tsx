import React, { useEffect, useState, useRef } from 'react';
import { Card, Button, Input } from '../../components';
import { useSettingsStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../stores/toastStore';
import { validateNumber, validatePath } from '../../utils/validation';
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
} from '../../types/config';
import './Settings.css';

// 配置节类型
type ConfigSection = 'model' | 'agent' | 'terminal' | 'compression' | 'checkpoint' | 'update';

// 配置节标题
const getSectionTitles = (t: (key: string) => string): Record<ConfigSection, { title: string; icon: string; description: string }> => ({
  model: { title: t('settings.modelConfig'), icon: '🤖', description: t('settings.modelConfigDesc') },
  agent: { title: t('settings.agentConfig'), icon: '⚡', description: t('settings.agentConfigDesc') },
  terminal: { title: t('settings.terminalConfig'), icon: '💻', description: t('settings.terminalConfigDesc') },
  compression: { title: t('settings.compressionConfig'), icon: '📦', description: t('settings.compressionConfigDesc') },
  checkpoint: { title: t('settings.checkpointConfig'), icon: '💾', description: t('settings.checkpointConfigDesc') },
  update: { title: t('settings.update'), icon: '🔄', description: t('settings.updateDesc') },
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
            {showApiKey ? '🙈' : '👁️'}
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
      toast.error('Please fix the validation errors');
      return;
    }

    onSave({
      ...formData,
      max_turns: Number(formData.max_turns),
      timeout: Number(formData.timeout),
    });
    toast.success('Agent config saved');
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
      toast.error('Please fix the validation errors');
      return;
    }

    onSave({
      ...formData,
      timeout: Number(formData.timeout),
    });
    toast.success('Terminal config saved');
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
      max_snapshots: Number(formData.max_snapshots),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="config-form">
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
          onChange={(e) => setFormData({ ...formData, max_snapshots: parseInt(e.target.value) })}
          placeholder="10"
          className="form-input"
        />
        <span className="form-hint">{t('settings.maxSnapshotsHint')}</span>
      </div>

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={isSaving}>
          {isSaving ? t('settings.saving') : t('settings.saveConfig')}
        </Button>
      </div>
    </form>
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

  const handleRestart = () => {
    // Restart the app - for now use window reload
    // TODO: Add @tauri-apps/plugin-process for proper app restart
    window.location.reload();
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
            <div className="restart-prompt-icon">🔄</div>
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
            <span className="update-status-icon">✓</span>
            <span>{t('settings.appUptodate')}</span>
          </div>
        )}

        {updateInfo?.available && (
          <div className="update-available">
            <div className="update-available-header">
              <span className="update-status-icon update-icon-new">🔄</span>
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
            <span className="update-status-icon">✓</span>
            <span>{t('settings.updateDownloaded')}</span>
          </div>
        )}

        {updateInfo?.status === 'error' && (
          <div className="update-status error">
            <span className="update-status-icon">⚠</span>
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
    rawYaml,
    isLoadingModel,
    isLoadingAgent,
    isLoadingTerminal,
    isLoadingCompression,
    isLoadingCheckpoint,
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
    updateRawYaml,
    setEditMode,
    setRawYaml,
    clearError,
    clearSuccessMessage,
    exportConfig,
    importConfig,
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
    toast.success('Configuration saved');
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
    isLoadingCheckpoint;

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
            <span>✓</span>
            <span>{successMessage}</span>
            <button onClick={clearSuccessMessage} className="dismiss-btn">×</button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <span>⚠️</span>
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
                {(Object.entries(sectionTitles) as [ConfigSection, { title: string; icon: string; description: string }][]).map(([key, { title, icon }]) => (
                  <button
                    key={key}
                    className={`section-nav-item ${activeSection === key ? 'active' : ''}`}
                    onClick={() => setActiveSection(key)}
                  >
                    <span className="section-icon">{icon}</span>
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
                        <span className="config-icon">{sectionTitles[activeSection]?.icon}</span>
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
                  <span className="config-icon">📝</span>
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
                  ✕
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
