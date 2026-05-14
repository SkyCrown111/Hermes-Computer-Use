import React, { useState } from 'react';
import { Button, Input, XIcon } from '../../../components';
import type { CustomProvider, FallbackProvider, CredentialPoolStrategy } from '../../../types/config';

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
    if (!key) return '';
    // If already masked by backend (__MASKED__ format), show a friendly display
    if (key.startsWith('__MASKED__')) {
      const suffix = key.replace('__MASKED__', '');
      return `****${suffix}`;
    }
    if (key.length < 8) return key;
    return key.slice(0, 4) + '*'.repeat(Math.min(key.length - 8, 20)) + key.slice(-4);
  };

  // Check if a key value is a masked placeholder from the backend
  const isMaskedKey = (key: string | undefined): boolean => {
    if (!key) return false;
    return key.startsWith('__MASKED__') || key.startsWith('•') || (key.includes('****') && key.length > 8);
  };

  const handleAddProvider = () => {
    if (newProvider.name && newProvider.base_url) {
      // Don't save masked API keys — only save real keys
      const providerToSave = { ...newProvider };
      if (isMaskedKey(providerToSave.api_key)) {
        delete providerToSave.api_key;
      }
      onAddCustomProvider(providerToSave);
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
      // Don't save masked API keys — only save real keys
      const providerToSave = { ...newProvider };
      if (isMaskedKey(providerToSave.api_key)) {
        delete providerToSave.api_key;
      }
      onUpdateCustomProvider(showEditModal, providerToSave);
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

export default ProvidersConfigForm;
