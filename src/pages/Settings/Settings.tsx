import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Card, Button, SettingsIcon, ZapIcon, TerminalIcon, SaveIcon, RefreshIcon, AlertIcon, FileTextIcon, CheckIcon, XIcon } from '../../components';
import { useSettingsStore, useHermesReadinessStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../stores/toastStore';
import { buildHermesReadinessChecks, evaluateHermesReadiness } from '../../lib/hermesReadiness';

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

interface SettingsSetupState {
  ready: boolean;
  title: string;
  description: string;
  missingHome: boolean;
  missingRuntime: boolean;
  missingModel: boolean;
  missingCredentials: boolean;
  gatewayOffline: boolean;
  checks: Array<{ label: string; ok: boolean; detail: string }>;
}

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
  const sectionTitles = useMemo(() => getSectionTitles(t), [t]);
  const modelConfig = useSettingsStore(s => s.modelConfig);
  const agentConfig = useSettingsStore(s => s.agentConfig);
  const terminalConfig = useSettingsStore(s => s.terminalConfig);
  const compressionConfig = useSettingsStore(s => s.compressionConfig);
  const checkpointConfig = useSettingsStore(s => s.checkpointConfig);
  const memoryConfig = useSettingsStore(s => s.memoryConfig);
  const rawYaml = useSettingsStore(s => s.rawYaml);
  const isLoadingModel = useSettingsStore(s => s.isLoadingModel);
  const isLoadingAgent = useSettingsStore(s => s.isLoadingAgent);
  const isLoadingTerminal = useSettingsStore(s => s.isLoadingTerminal);
  const isLoadingCompression = useSettingsStore(s => s.isLoadingCompression);
  const isLoadingCheckpoint = useSettingsStore(s => s.isLoadingCheckpoint);
  const isLoadingMemory = useSettingsStore(s => s.isLoadingMemory);
  const isLoadingRaw = useSettingsStore(s => s.isLoadingRaw);
  const editMode = useSettingsStore(s => s.editMode);
  const error = useSettingsStore(s => s.error);
  const successMessage = useSettingsStore(s => s.successMessage);
  const isSaving = useSettingsStore(s => s.isSaving);
  const fetchAllConfigs = useSettingsStore(s => s.fetchAllConfigs);
  const fetchRawYaml = useSettingsStore(s => s.fetchRawYaml);
  const updateModelConfig = useSettingsStore(s => s.updateModelConfig);
  const updateAgentConfig = useSettingsStore(s => s.updateAgentConfig);
  const updateTerminalConfig = useSettingsStore(s => s.updateTerminalConfig);
  const updateCompressionConfig = useSettingsStore(s => s.updateCompressionConfig);
  const updateCheckpointConfig = useSettingsStore(s => s.updateCheckpointConfig);
  const updateMemoryConfig = useSettingsStore(s => s.updateMemoryConfig);
  const updateAuxiliaryTaskConfig = useSettingsStore(s => s.updateAuxiliaryTaskConfig);
  const deleteAuxiliaryTaskConfig = useSettingsStore(s => s.deleteAuxiliaryTaskConfig);
  const updateRawYaml = useSettingsStore(s => s.updateRawYaml);
  const setEditMode = useSettingsStore(s => s.setEditMode);
  const setRawYaml = useSettingsStore(s => s.setRawYaml);
  const clearError = useSettingsStore(s => s.clearError);
  const clearSuccessMessage = useSettingsStore(s => s.clearSuccessMessage);
  const exportConfig = useSettingsStore(s => s.exportConfig);
  const importConfig = useSettingsStore(s => s.importConfig);
  const auxiliaryConfig = useSettingsStore(s => s.auxiliaryConfig);
  const isLoadingAuxiliary = useSettingsStore(s => s.isLoadingAuxiliary);
  const providersConfig = useSettingsStore(s => s.providersConfig);
  const isLoadingProviders = useSettingsStore(s => s.isLoadingProviders);
  const addCustomProvider = useSettingsStore(s => s.addCustomProvider);
  const updateCustomProvider = useSettingsStore(s => s.updateCustomProvider);
  const deleteCustomProvider = useSettingsStore(s => s.deleteCustomProvider);
  const addFallbackProvider = useSettingsStore(s => s.addFallbackProvider);
  const deleteFallbackProvider = useSettingsStore(s => s.deleteFallbackProvider);
  const updateCredentialPoolStrategy = useSettingsStore(s => s.updateCredentialPoolStrategy);
  const isLoadingDisplay = useSettingsStore(s => s.isLoadingDisplay);
  const approvalConfig = useSettingsStore(s => s.approvalConfig);
  const isLoadingApproval = useSettingsStore(s => s.isLoadingApproval);
  const updateApprovalConfig = useSettingsStore(s => s.updateApprovalConfig);
  const readinessSnapshot = useHermesReadinessStore(s => s.snapshot);
  const readinessError = useHermesReadinessStore(s => s.error);
  const refreshReadinessSnapshot = useHermesReadinessStore(s => s.refreshSnapshot);

  const [activeSection, setActiveSection] = useState<ConfigSection>('model');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const originalYamlRef = useRef<string>('');
  const [setupState, setSetupState] = useState<SettingsSetupState | null>(null);
  const setupLabels = useMemo(() => ({
    notInitializedTitle: 'Hermes is not initialized',
    notInitializedDescription: 'Install Hermes and create the ~/.hermes workspace before configuring the app.',
    runtimeMissingTitle: 'Hermes runtime missing',
    runtimeMissingDescription: 'The app found Hermes config paths, but the CLI or Python runtime is not available yet.',
    needsConfigTitle: 'Settings need attention',
    needsConfigDescription: 'Finish model and credential setup here so Hermes can actually serve chat requests.',
    gatewayOfflineTitle: 'Gateway is offline',
    gatewayOfflineDescription: 'Configuration looks usable, but the Hermes gateway is not currently running.',
    readyTitle: 'Settings are ready',
    readyDescription: 'Model, credentials, runtime, and gateway all look usable.',
  }), []);

  useEffect(() => {
    fetchAllConfigs();
  }, [fetchAllConfigs]);

  const refreshSetupState = useCallback(async () => {
    const snapshot = await refreshReadinessSnapshot(true);
    if (!snapshot) {
      setSetupState({
        ready: false,
        title: 'Unable to verify Hermes setup',
        description: readinessError ?? 'Unknown error',
        missingHome: false,
        missingRuntime: false,
        missingModel: false,
        missingCredentials: false,
        gatewayOffline: false,
        checks: [],
      });
      return;
    }
    const readiness = evaluateHermesReadiness(
      snapshot.exists,
      snapshot.health,
      snapshot.config,
      snapshot.environment,
      snapshot.systemStatus.gateway.status,
      setupLabels,
    );
    setSetupState({
      ...readiness,
      checks: buildHermesReadinessChecks(readiness, snapshot.config, snapshot.environment, snapshot.health),
    });
  }, [readinessError, refreshReadinessSnapshot, setupLabels]);

  useEffect(() => {
    void refreshSetupState();
  }, [refreshSetupState]);

  useEffect(() => {
    if (!readinessSnapshot) return;
    const readiness = evaluateHermesReadiness(
      readinessSnapshot.exists,
      readinessSnapshot.health,
      readinessSnapshot.config,
      readinessSnapshot.environment,
      readinessSnapshot.systemStatus.gateway.status,
      setupLabels,
    );
    setSetupState({
      ...readiness,
      checks: buildHermesReadinessChecks(
        readiness,
        readinessSnapshot.config,
        readinessSnapshot.environment,
        readinessSnapshot.health,
      ),
    });
  }, [readinessSnapshot, setupLabels]);

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

  useEffect(() => {
    if (successMessage) {
      refreshSetupState();
    }
  }, [successMessage, refreshSetupState]);

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
  const handleExport = useCallback(async () => {
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
  }, [exportConfig]);

  // 导入配置
  const handleImport = useCallback(async () => {
    await importConfig(importText);
    setShowImportModal(false);
    setImportText('');
  }, [importConfig, importText]);

  // 从文件导入
  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setImportText(content);
      };
      reader.readAsText(file);
    }
  }, []);

  // Handle YAML save with dirty state reset
  const handleYamlSave = useCallback(async (yaml: string) => {
    await updateRawYaml(yaml);
    originalYamlRef.current = yaml;
    setHasUnsavedChanges(false);
    toast.success(t('settings.saved.config'));
    await refreshSetupState();
  }, [updateRawYaml, refreshSetupState, t]);

  // 渲染表单内容
  const renderFormContent = useMemo(() => () => {
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
  }, [activeSection, modelConfig, agentConfig, terminalConfig, compressionConfig, checkpointConfig, memoryConfig, auxiliaryConfig, providersConfig, approvalConfig, updateModelConfig, updateAgentConfig, updateTerminalConfig, updateCompressionConfig, updateCheckpointConfig, updateMemoryConfig, updateAuxiliaryTaskConfig, deleteAuxiliaryTaskConfig, addCustomProvider, updateCustomProvider, deleteCustomProvider, addFallbackProvider, deleteFallbackProvider, updateCredentialPoolStrategy, updateApprovalConfig, isSaving, t]);

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

  const sectionSetupHint = useMemo(() => {
    if (!setupState || setupState.ready) return null;
    if (activeSection === 'model' && setupState.missingModel) {
      return 'Pick a provider and default model here first.';
    }
    if ((activeSection === 'model' || activeSection === 'providers') && setupState.missingCredentials) {
      return 'Add an API key or provider key env here so Hermes can authenticate requests.';
    }
    if (activeSection === 'update' && setupState.gatewayOffline) {
      return 'Gateway is offline right now. Restart it after configuration is complete.';
    }
    return null;
  }, [activeSection, setupState]);

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

        {setupState && (
          <div className={`settings-setup-banner ${setupState.ready ? 'ready' : 'issue'}`}>
            <div className="settings-setup-banner-copy">
              <strong>{setupState.title}</strong>
              <span>{setupState.description}</span>
            </div>
            <div className="settings-setup-banner-actions">
              {!setupState.ready && (setupState.missingModel || setupState.missingCredentials) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveSection(setupState.missingModel ? 'model' : 'providers')}
                >
                  {setupState.missingModel ? t('settings.modelConfig') : t('settings.providersConfig')}
                </Button>
              )}
              {!setupState.ready && setupState.gatewayOffline && (
                <Button variant="secondary" size="sm" onClick={() => setActiveSection('update')}>
                  {t('settings.update')}
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={refreshSetupState}>
                {t('dashboard.recheck')}
              </Button>
            </div>
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
                    {sectionSetupHint && (
                      <div className="settings-section-hint">
                        <span className="settings-section-hint-label">Setup</span>
                        <span>{sectionSetupHint}</span>
                      </div>
                    )}
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
