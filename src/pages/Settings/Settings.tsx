import React, { useEffect, useState, useRef } from 'react';
import { Card, Button, Input } from '../../components';
import { useSettingsStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import type {
  ModelConfig,
  AgentConfig,
  TerminalConfig,
  CompressionConfig,
  CheckpointConfig,
} from '../../types/config';
import './Settings.css';

// 配置节类型
type ConfigSection = 'model' | 'agent' | 'terminal' | 'compression' | 'checkpoint';

// 配置节标题
const getSectionTitles = (t: (key: string) => string): Record<ConfigSection, { title: string; icon: string; description: string }> => ({
  model: { title: t('settings.modelConfig'), icon: '🤖', description: t('settings.modelConfigDesc') },
  agent: { title: t('settings.agentConfig'), icon: '⚡', description: t('settings.agentConfigDesc') },
  terminal: { title: t('settings.terminalConfig'), icon: '💻', description: t('settings.terminalConfigDesc') },
  compression: { title: t('settings.compressionConfig'), icon: '📦', description: t('settings.compressionConfigDesc') },
  checkpoint: { title: t('settings.checkpointConfig'), icon: '💾', description: t('settings.checkpointConfigDesc') },
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
    console.log('[ModelConfigForm] Config changed:', config);
    if (config) {
      console.log('[ModelConfigForm] Setting formData to:', config);
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

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
          onChange={(e) => setFormData({ ...formData, max_turns: parseInt(e.target.value) })}
          placeholder="100"
          className="form-input"
        />
        <span className="form-hint">{t('settings.maxTurnsHint')}</span>
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.timeout')}</label>
        <Input
          type="number"
          value={formData.timeout || ''}
          onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) })}
          placeholder="300"
          className="form-input"
        />
        <span className="form-hint">{t('settings.timeoutHint')}</span>
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

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
          onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) })}
          placeholder="180"
          className="form-input"
        />
      </div>

      <div className="form-group">
        <label className="form-label">{t('settings.workDir')}</label>
        <Input
          value={formData.cwd || ''}
          onChange={(e) => setFormData({ ...formData, cwd: e.target.value })}
          placeholder="/home/user/projects"
          className="form-input"
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

// YAML 编辑器
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

  useEffect(() => {
    fetchAllConfigs();
  }, [fetchAllConfigs]);

  // Debug: log when modelConfig changes
  useEffect(() => {
    console.log('[Settings] modelConfig from store:', modelConfig);
  }, [modelConfig]);

  useEffect(() => {
    if (editMode === 'yaml') {
      fetchRawYaml();
    }
  }, [editMode, fetchRawYaml]);

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
                  onSave={updateRawYaml}
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
