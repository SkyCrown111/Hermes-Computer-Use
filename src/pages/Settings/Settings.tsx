import React, { useEffect, useState, useRef } from 'react';
import { Card, Button, SettingsIcon, ZapIcon, TerminalIcon, SaveIcon, RefreshIcon, AlertIcon, FileTextIcon, CheckIcon, XIcon } from '../../components';
import { useSettingsStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../stores/toastStore';
import { logger } from '../../lib/logger';
import {
  ModelConfigForm,
  AgentConfigForm,
  TerminalConfigForm,
  CompressionConfigForm,
  CheckpointConfigForm,
  AuxiliaryConfigForm,
  ProvidersConfigForm,
  UpdateSection,
  MemoryConfigForm,
  ApprovalConfigForm,
} from './sections';
import './Settings.css';

// 配置节类型
type ConfigSection = 'model' | 'agent' | 'terminal' | 'compression' | 'checkpoint' | 'auxiliary' | 'providers' | 'memory' | 'approval' | 'update';

// 配置节图标
const SectionIcon: React.FC<{ section: ConfigSection; size?: number }> = ({ section, size = 16 }) => {
  switch (section) {
    case 'model': return <SettingsIcon size={size} />;
    case 'agent': return <ZapIcon size={size} />;
    case 'terminal': return <TerminalIcon size={size} />;
    case 'compression': return <SaveIcon size={size} />;
    case 'checkpoint': return <SaveIcon size={size} />;
    case 'auxiliary': return <ZapIcon size={size} />;
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
  memory: { title: t('settings.memoryConfig'), description: t('settings.memoryConfigDesc') },
  approval: { title: t('settings.approvalConfig'), description: t('settings.approvalConfigDesc') },
  providers: { title: t('settings.providersConfig'), description: t('settings.providersConfigDesc') },
  update: { title: t('settings.update'), description: t('settings.updateDesc') },
});

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
    isLoadingDisplay,
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
