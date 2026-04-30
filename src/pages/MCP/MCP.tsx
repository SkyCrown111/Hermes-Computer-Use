import { useEffect, useState, useCallback } from 'react';
import { ConfirmModal, AlertIcon, CheckIcon, WarningIcon } from '../../components';
import { useMcpStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../stores/toastStore';
import type { McpServer, McpServerConfig, AddMcpServerRequest } from '../../types/mcp';
import './MCP.css';

// Status Badge Component
const StatusBadge = ({ status, t }: { status: string; t: (key: string) => string }) => {
  const statusConfig: Record<string, { label: string; className: string }> = {
    connected: { label: t('mcp.connected'), className: 'status-connected' },
    disconnected: { label: t('mcp.disconnected'), className: 'status-disconnected' },
    error: { label: t('mcp.error'), className: 'status-error' },
    starting: { label: t('mcp.starting'), className: 'status-starting' },
  };

  const config = statusConfig[status] || statusConfig.disconnected;
  return <span className={`status-badge ${config.className}`}>{config.label}</span>;
};

// Server Icon Component
function ServerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

// Tool Icon Component
function ToolIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

// Resource Icon Component
function ResourceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
}

export function MCP() {
  const { t } = useTranslation();

  // Individual Zustand selectors to avoid unnecessary re-renders
  const servers = useMcpStore(s => s.servers);
  const stats = useMcpStore(s => s.stats);
  const selectedServer = useMcpStore(s => s.selectedServer);
  const tools = useMcpStore(s => s.tools);
  const resources = useMcpStore(s => s.resources);
  const isLoading = useMcpStore(s => s.isLoading);
  const error = useMcpStore(s => s.error);
  const isAddModalOpen = useMcpStore(s => s.isAddModalOpen);
  const isEditModalOpen = useMcpStore(s => s.isEditModalOpen);
  const isToolsModalOpen = useMcpStore(s => s.isToolsModalOpen);
  const isResourcesModalOpen = useMcpStore(s => s.isResourcesModalOpen);
  const fetchServers = useMcpStore(s => s.fetchServers);
  const fetchStats = useMcpStore(s => s.fetchStats);
  const addServer = useMcpStore(s => s.addServer);
  const updateServer = useMcpStore(s => s.updateServer);
  const removeServer = useMcpStore(s => s.removeServer);
  const startServer = useMcpStore(s => s.startServer);
  const stopServer = useMcpStore(s => s.stopServer);
  const testConnection = useMcpStore(s => s.testConnection);
  const openAddModal = useMcpStore(s => s.openAddModal);
  const closeAddModal = useMcpStore(s => s.closeAddModal);
  const openEditModal = useMcpStore(s => s.openEditModal);
  const closeEditModal = useMcpStore(s => s.closeEditModal);
  const openToolsModal = useMcpStore(s => s.openToolsModal);
  const closeToolsModal = useMcpStore(s => s.closeToolsModal);
  const openResourcesModal = useMcpStore(s => s.openResourcesModal);
  const closeResourcesModal = useMcpStore(s => s.closeResourcesModal);
  const clearError = useMcpStore(s => s.clearError);

  // Form state for add/edit
  const [formData, setFormData] = useState<AddMcpServerRequest>({
    name: '',
    command: '',
    args: [],
    env: {},
    auto_start: false,
  });
  const [argsText, setArgsText] = useState('');
  const [envText, setEnvText] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<McpServer | null>(null);

  useEffect(() => {
    fetchServers();
    fetchStats();
  }, [fetchServers, fetchStats]);

  // Reset form when opening add modal
  useEffect(() => {
    if (isAddModalOpen) {
      setFormData({ name: '', command: '', args: [], env: {}, auto_start: false });
      setArgsText('');
      setEnvText('');
      setTestResult(null);
    }
  }, [isAddModalOpen]);

  // Populate form when opening edit modal
  useEffect(() => {
    if (isEditModalOpen && selectedServer) {
      const config = selectedServer.config;
      setFormData({
        name: config.name,
        command: config.command,
        args: config.args || [],
        env: config.env || {},
        auto_start: config.auto_start || false,
      });
      setArgsText((config.args || []).join(' '));
      setEnvText(Object.entries(config.env || {}).map(([k, v]) => `${k}=${v}`).join('\n'));
      setTestResult(null);
    }
  }, [isEditModalOpen, selectedServer]);

  // Handle form submit
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.command) {
      toast.error(t('mcp.nameRequired'));
      return;
    }

    // Parse args
    const args = argsText.trim() ? argsText.trim().split(/\s+/) : undefined;

    // Parse env
    const env: Record<string, string> = {};
    if (envText.trim()) {
      envText.trim().split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      });
    }

    const request = {
      ...formData,
      args,
      env: Object.keys(env).length > 0 ? env : undefined,
    };

    if (isEditModalOpen && selectedServer) {
      const config: McpServerConfig = {
        name: formData.name,
        command: formData.command,
        args,
        env: Object.keys(env).length > 0 ? env : undefined,
        auto_start: formData.auto_start,
      };
      const success = await updateServer(selectedServer.name, config);
      if (success) {
        toast.success(t('mcp.serverUpdated'));
      }
    } else {
      const success = await addServer(request);
      if (success) {
        toast.success(t('mcp.serverAdded'));
      }
    }
  }, [formData, argsText, envText, isEditModalOpen, selectedServer, addServer, updateServer, t]);

  // Handle test connection
  const handleTestConnection = useCallback(async () => {
    if (!formData.command) {
      toast.error(t('mcp.commandRequired'));
      return;
    }

    // Parse args
    const args = argsText.trim() ? argsText.trim().split(/\s+/) : undefined;

    // Parse env
    const env: Record<string, string> = {};
    if (envText.trim()) {
      envText.trim().split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      });
    }

    const config: McpServerConfig = {
      name: formData.name || 'test',
      command: formData.command,
      args,
      env: Object.keys(env).length > 0 ? env : undefined,
    };

    const result = await testConnection(config);
    setTestResult(result);
    if (result.success) {
      toast.success(t('mcp.testSuccess'));
    } else {
      toast.error(t('mcp.testFailed'));
    }
  }, [formData, argsText, envText, testConnection, t]);

  // Handle delete server
  const handleDeleteServer = useCallback(async () => {
    if (deleteConfirm) {
      const success = await removeServer(deleteConfirm.name);
      if (success) {
        toast.success(t('mcp.serverRemoved'));
      }
      setDeleteConfirm(null);
    }
  }, [deleteConfirm, removeServer, t]);

  return (
    <div className="mcp-page">
      <div className="page-header">
        <h1>{t('mcp.title')}</h1>
        <p>{t('mcp.subtitle')}</p>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="mcp-stats">
          <div className="stat-card glass-card">
            <span className="stat-value">{stats.total_servers}</span>
            <span className="stat-label">{t('mcp.totalServers')}</span>
          </div>
          <div className="stat-card glass-card">
            <span className="stat-value stat-connected">{stats.connected}</span>
            <span className="stat-label">{t('mcp.connected')}</span>
          </div>
          <div className="stat-card glass-card">
            <span className="stat-value stat-disconnected">{stats.disconnected}</span>
            <span className="stat-label">{t('mcp.disconnected')}</span>
          </div>
          <div className="stat-card glass-card">
            <span className="stat-value">{stats.total_tools}</span>
            <span className="stat-label">{t('mcp.totalTools')}</span>
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="mcp-actions">
        <button className="btn btn-primary" onClick={openAddModal}>
          + {t('mcp.addServer')}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mcp-error glass-card">
          <AlertIcon size={16} />
          <span>{error}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => { fetchServers(); fetchStats(); }}>
            {t('common.refresh')}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={clearError}>
            {t('common.close')}
          </button>
        </div>
      )}

      {/* Servers List */}
      <div className="mcp-servers">
        {isLoading ? (
          <div className="mcp-loading">
            <div className="loading-spinner" />
            <span>{t('common.loading')}</span>
          </div>
        ) : servers.length === 0 ? (
          <div className="mcp-empty glass-card">
            <ServerIcon />
            <p>{t('mcp.noServers')}</p>
            <button className="btn btn-primary" onClick={openAddModal}>
              {t('mcp.addFirstServer')}
            </button>
          </div>
        ) : (
          <div className="servers-grid">
            {servers.map((server) => (
              <div key={server.name} className="server-card glass-card">
                <div className="server-header">
                  <div className="server-icon">
                    <ServerIcon />
                  </div>
                  <div className="server-info">
                    <h3>{server.name}</h3>
                    <p className="server-command">{server.config.command}</p>
                  </div>
                  <StatusBadge status={server.status} t={t} />
                </div>

                <div className="server-meta">
                  {server.tools_count !== undefined && (
                    <span className="meta-item">
                      <ToolIcon /> {server.tools_count} {t('mcp.tools')}
                    </span>
                  )}
                  {server.resources_count !== undefined && (
                    <span className="meta-item">
                      <ResourceIcon /> {server.resources_count} {t('mcp.resources')}
                    </span>
                  )}
                </div>

                <div className="server-actions">
                  {server.status === 'connected' ? (
                    <button
                      className="btn btn-secondary"
                      onClick={() => stopServer(server.name)}
                    >
                      {t('mcp.stopServer')}
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={() => startServer(server.name)}
                    >
                      {t('mcp.startServer')}
                    </button>
                  )}
                  <button
                    className="btn btn-secondary"
                    onClick={() => openToolsModal(server.name)}
                  >
                    {t('mcp.tools')}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => openResourcesModal(server.name)}
                  >
                    {t('mcp.resources')}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => openEditModal(server)}
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => setDeleteConfirm(server)}
                  >
                    {t('common.delete')}
                  </button>
                </div>

                {server.last_error && (
                  <div className="server-error">
                    <AlertIcon size={14} /> {server.last_error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Server Modal */}
      {(isAddModalOpen || isEditModalOpen) && (
        <div className="modal-overlay" onClick={() => isAddModalOpen ? closeAddModal() : closeEditModal()}>
          <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{isEditModalOpen ? t('mcp.editServer') : t('mcp.addServer')}</h2>
              <button className="modal-close" onClick={() => isAddModalOpen ? closeAddModal() : closeEditModal()}>
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="name">{t('mcp.serverName')}</label>
                  <input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t('mcp.serverNamePlaceholder')}
                    disabled={isEditModalOpen}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="command">{t('mcp.command')}</label>
                  <input
                    id="command"
                    type="text"
                    value={formData.command}
                    onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                    placeholder={t('mcp.commandPlaceholder')}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="args">{t('mcp.arguments')}</label>
                  <input
                    id="args"
                    type="text"
                    value={argsText}
                    onChange={(e) => setArgsText(e.target.value)}
                    placeholder={t('mcp.argumentsPlaceholder')}
                  />
                  <span className="field-hint">{t('mcp.argumentsHint')}</span>
                </div>
                <div className="form-group">
                  <label htmlFor="env">{t('mcp.environmentVars')}</label>
                  <textarea
                    id="env"
                    value={envText}
                    onChange={(e) => setEnvText(e.target.value)}
                    placeholder={t('mcp.environmentVarsPlaceholder')}
                    rows={4}
                  />
                  <span className="field-hint">{t('mcp.environmentVarsHint')}</span>
                </div>
                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.auto_start}
                      onChange={(e) => setFormData({ ...formData, auto_start: e.target.checked })}
                    />
                    <span>{t('mcp.autoStart')}</span>
                  </label>
                </div>

                {/* Test Connection Result */}
                {testResult && (
                  <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                    {testResult.success ? (
                      <><CheckIcon size={16} /> {testResult.message}</>
                    ) : (
                      <><WarningIcon size={16} /> {testResult.message}</>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleTestConnection}>
                  {t('mcp.testConnection')}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => isAddModalOpen ? closeAddModal() : closeEditModal()}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {isEditModalOpen ? t('common.save') : t('mcp.addServer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tools Modal */}
      {isToolsModalOpen && (
        <div className="modal-overlay" onClick={closeToolsModal}>
          <div className="modal-content glass-card modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('mcp.tools')}</h2>
              <button className="modal-close" onClick={closeToolsModal}>×</button>
            </div>
            <div className="modal-body">
              {tools.length === 0 ? (
                <div className="modal-empty">
                  <p>{t('mcp.noTools')}</p>
                </div>
              ) : (
                <div className="tools-list">
                  {tools.map((tool) => (
                    <div key={tool.name} className="tool-item glass-card">
                      <h4>{tool.name}</h4>
                      <p>{tool.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeToolsModal}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resources Modal */}
      {isResourcesModalOpen && (
        <div className="modal-overlay" onClick={closeResourcesModal}>
          <div className="modal-content glass-card modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('mcp.resources')}</h2>
              <button className="modal-close" onClick={closeResourcesModal}>×</button>
            </div>
            <div className="modal-body">
              {resources.length === 0 ? (
                <div className="modal-empty">
                  <p>{t('mcp.noResources')}</p>
                </div>
              ) : (
                <div className="resources-list">
                  {resources.map((resource) => (
                    <div key={resource.uri} className="resource-item glass-card">
                      <h4>{resource.name}</h4>
                      <p className="resource-uri">{resource.uri}</p>
                      {resource.description && <p>{resource.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeResourcesModal}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm !== null}
        title={t('mcp.removeServer')}
        message={t('mcp.removeConfirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
        onConfirm={handleDeleteServer}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
