import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, Button, Input, ConfirmModal } from '../../components';
import { PlusIcon, XIcon, EditIcon, TrashIcon, SearchIcon, WarningIcon, FolderIcon, TargetIcon, PlayIcon, ClockIcon, CopyIcon, CheckIcon, RefreshIcon } from '../../components';
import { useSkillsStore, useNavigationStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { logger } from '../../lib/logger';
import { toast } from '../../stores/toastStore';
import { SKILL_CATEGORY_DEFINITIONS } from '../../types/skill';
import './Skills.css';

// Format category name with icon
const formatCategoryName = (name: string, lang: 'zh' | 'en'): string => {
  const definition = SKILL_CATEGORY_DEFINITIONS[name];
  if (definition) {
    return `${definition.icon} ${lang === 'zh' ? definition.label : definition.labelEn}`;
  }
  // Fallback: capitalize and format
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Format duration in milliseconds to readable string
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
};

// Format date to relative time
const formatRelativeTime = (dateStr: string, lang: 'zh' | 'en'): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return lang === 'zh' ? '刚刚' : 'Just now';
  if (diffMins < 60) return lang === 'zh' ? `${diffMins}分钟前` : `${diffMins} min ago`;
  if (diffHours < 24) return lang === 'zh' ? `${diffHours}小时前` : `${diffHours}h ago`;
  return lang === 'zh' ? `${diffDays}天前` : `${diffDays}d ago`;
};

export const Skills: React.FC = () => {
  const { t, lang } = useTranslation();
  // Individual Zustand selectors to avoid unnecessary re-renders
  const openTab = useNavigationStore(s => s.openTab);
  const setActiveItem = useNavigationStore(s => s.setActiveItem);

  const skills = useSkillsStore(s => s.skills);
  const isLoadingSkills = useSkillsStore(s => s.isLoadingSkills);
  const categories = useSkillsStore(s => s.categories);
  const isLoadingCategories = useSkillsStore(s => s.isLoadingCategories);
  const selectedCategory = useSkillsStore(s => s.selectedCategory);
  const searchQuery = useSkillsStore(s => s.searchQuery);
  const selectedSkill = useSkillsStore(s => s.selectedSkill);
  const isLoadingDetail = useSkillsStore(s => s.isLoadingDetail);
  const executionHistory = useSkillsStore(s => s.executionHistory);
  const isLoadingHistory = useSkillsStore(s => s.isLoadingHistory);
  const error = useSkillsStore(s => s.error);
  const fetchSkills = useSkillsStore(s => s.fetchSkills);
  const fetchCategories = useSkillsStore(s => s.fetchCategories);
  const fetchSkillDetail = useSkillsStore(s => s.fetchSkillDetail);
  const fetchExecutionHistory = useSkillsStore(s => s.fetchExecutionHistory);
  const toggleSkill = useSkillsStore(s => s.toggleSkill);
  const createSkill = useSkillsStore(s => s.createSkill);
  const updateSkill = useSkillsStore(s => s.updateSkill);
  const deleteSkill = useSkillsStore(s => s.deleteSkill);
  const executeSkill = useSkillsStore(s => s.executeSkill);
  const setSearchQuery = useSkillsStore(s => s.setSearchQuery);
  const setSelectedCategory = useSkillsStore(s => s.setSelectedCategory);
  const clearSelectedSkill = useSkillsStore(s => s.clearSelectedSkill);

  // Add Skill modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSkill, setNewSkill] = useState({
    name: '',
    category: '',
    description: '',
    content: '',
  });

  // Edit Skill modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSkill, setEditingSkill] = useState<{
    originalName: string;
    originalCategory: string;
    name: string;
    category: string;
    description: string;
    content: string;
  }>({
    originalName: '',
    originalCategory: '',
    name: '',
    category: '',
    description: '',
    content: '',
  });

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ category: string; name: string } | null>(null);

  // Execution modal state
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [executionInput, setExecutionInput] = useState('');
  const [executionParams, setExecutionParams] = useState<{ key: string; value: string }[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  // Active tab in detail panel
  const [detailTab, setDetailTab] = useState<'content' | 'history' | 'params'>('content');

  // Copy state
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchSkills();
    fetchCategories();
  }, [fetchSkills, fetchCategories]);

  // Load execution history when skill is selected
  useEffect(() => {
    if (selectedSkill) {
      fetchExecutionHistory(selectedSkill.name);
    }
  }, [selectedSkill, fetchExecutionHistory]);

  // Execute skill - starts a new chat session with skill context
  const handleExecuteSkill = useCallback(async (skill: typeof selectedSkill) => {
    if (!skill) return;

    // Create a new session
    const sessionId = `skill_${skill.name}_${Date.now()}`;

    // Open a new chat tab
    openTab(sessionId, skill.name, 'new');

    // Navigate to chat
    setActiveItem('chat');

    // Close the detail panel
    clearSelectedSkill();
  }, [openTab, setActiveItem, clearSelectedSkill]);

  // Open execution modal
  const openExecutionModal = useCallback(() => {
    setExecutionInput('');
    setExecutionParams([]);
    setShowExecutionModal(true);
  }, []);

  // Handle execution with parameters
  const handleExecuteWithParams = useCallback(async () => {
    if (!selectedSkill) return;

    setIsExecuting(true);
    try {
      const params: Record<string, string> = {};
      executionParams.forEach(p => {
        if (p.key.trim()) {
          params[p.key.trim()] = p.value;
        }
      });

      const sessionId = await executeSkill({
        skill_name: selectedSkill.name,
        skill_category: selectedSkill.category,
        input_text: executionInput,
        parameters: params,
      });

      if (sessionId) {
        // Open a new chat tab
        openTab(sessionId, selectedSkill.name, 'new');
        setActiveItem('chat');
        setShowExecutionModal(false);
        clearSelectedSkill();
        toast.success(t('skills.execution.success'));
      }
    } catch {
      toast.error(t('skills.execution.failed'));
    } finally {
      setIsExecuting(false);
    }
  }, [selectedSkill, executionInput, executionParams, executeSkill, openTab, setActiveItem, clearSelectedSkill, t]);

  // Handle edit skill
  const handleEditSkill = useCallback((skill: typeof selectedSkill) => {
    if (!skill) return;
    setEditingSkill({
      originalName: skill.name,
      originalCategory: skill.category,
      name: skill.name,
      category: skill.category,
      description: skill.metadata.description,
      content: skill.content,
    });
    setShowEditModal(true);
  }, []);

  // Handle delete skill
  const handleDeleteSkill = useCallback(async () => {
    if (!deleteConfirm) return;
    const success = await deleteSkill(deleteConfirm.category, deleteConfirm.name);
    if (success) {
      toast.success(`Skill "${deleteConfirm.name}" ${t('skills.deleted')}`);
    } else {
      toast.error(t('skills.deleteFailed'));
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, deleteSkill, t]);

  // Save edited skill
  const handleSaveEdit = useCallback(async () => {
    const success = await updateSkill(
      editingSkill.originalCategory,
      editingSkill.originalName,
      {
        name: editingSkill.name,
        category: editingSkill.category,
        description: editingSkill.description,
        content: editingSkill.content,
      }
    );
    if (success) {
      toast.success(`Skill "${editingSkill.name}" ${t('skills.updated')}`);
      setShowEditModal(false);
    } else {
      toast.error(t('skills.updateFailed'));
    }
  }, [editingSkill, updateSkill, t]);

  // Copy skill content to clipboard
  const handleCopyContent = useCallback(async () => {
    if (!selectedSkill) return;
    try {
      await navigator.clipboard.writeText(selectedSkill.content);
      setCopied(true);
      toast.success(t('skills.detail.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('[Skills] Failed to copy:', err);
    }
  }, [selectedSkill, t]);

  // Filtered skills with improved search
  const filteredSkills = useMemo(() => {
    let result = skills;

    // Filter by category
    if (selectedCategory) {
      result = result.filter((skill) => skill.category === selectedCategory);
    }

    // Filter by search query (name, description, category, tags)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (skill) =>
          skill.name.toLowerCase().includes(query) ||
          (skill.description?.toLowerCase().includes(query)) ||
          (skill.category?.toLowerCase().includes(query)) ||
          (skill.tags?.some((tag) => tag.toLowerCase().includes(query)))
      );
    }

    return result;
  }, [skills, selectedCategory, searchQuery]);

  // Group skills by category
  const groupedSkills = useMemo(() => {
    const groups: Record<string, typeof skills> = {};
    filteredSkills.forEach((skill) => {
      const cat = skill.category || 'uncategorized';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(skill);
    });
    return groups;
  }, [filteredSkills]);

  // Stats
  const stats = useMemo(() => ({
    total: skills.length,
    enabled: skills.filter(s => s.enabled).length,
    disabled: skills.filter(s => !s.enabled).length,
  }), [skills]);

  return (
    <div className="skills-page">
      {/* Header Actions */}
      <div className="skills-header">
        {/* Stats Bar */}
        <div className="skills-stats">
          <div className="stat-item">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">{t('skills.stats.total')}</span>
          </div>
          <div className="stat-item">
            <span className="stat-value stat-enabled">{stats.enabled}</span>
            <span className="stat-label">{t('skills.stats.enabled')}</span>
          </div>
          <div className="stat-item">
            <span className="stat-value stat-disabled">{stats.disabled}</span>
            <span className="stat-label">{t('skills.stats.disabled')}</span>
          </div>
        </div>

        {/* Search */}
        <div className="skills-search">
          <Input
            placeholder={t('skills.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<SearchIcon size={16} />}
            className="search-input"
          />
        </div>

        {/* Category Filter */}
        <div className="category-filter">
          <Button
            variant={selectedCategory === null ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setSelectedCategory(null)}
          >
            {t('skills.categories.all')}
          </Button>
          {isLoadingCategories ? (
            <span className="category-loading">{t('common.loading')}</span>
          ) : (
            categories.map((category) => (
              <Button
                key={category.name}
                variant={selectedCategory === category.name ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setSelectedCategory(category.name)}
              >
                {formatCategoryName(category.name, lang)} ({category.skill_count})
              </Button>
            ))
          )}
        </div>

        {/* Add Skill Button */}
        <Button
          variant="primary"
          size="sm"
          className="add-skill-btn"
          onClick={() => setShowAddModal(true)}
        >
          <PlusIcon size={16} />
          <span>{t('skills.add')}</span>
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <span><WarningIcon size={16} /></span>
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => fetchSkills()}>
            <RefreshIcon size={14} /> {t('common.refresh')}
          </Button>
        </div>
      )}

      {/* Main Content */}
      <div className="skills-content">
        {/* Skills Grid */}
        <div className="skills-grid-section">
          {isLoadingSkills ? (
            <div className="loading-container">
              <div className="loading-spinner" />
            </div>
          ) : Object.keys(groupedSkills).length > 0 ? (
            Object.entries(groupedSkills).map(([category, categorySkills]) => (
              <div key={category} className="skill-category-group">
                <h3 className="category-title">
                  <FolderIcon size={16} /> {formatCategoryName(category, lang)}
                  <span className="category-count">({categorySkills.length})</span>
                </h3>
                <div className="skills-grid">
                  {categorySkills.map((skill) => (
                    <Card
                      key={skill.path}
                      className={`skill-card ${!skill.enabled ? 'skill-card-disabled' : ''}`}
                    >
                      <div className="skill-card-header">
                        <div className="skill-icon">
                          {SKILL_CATEGORY_DEFINITIONS[skill.category || '']?.icon || <TargetIcon size={20} />}
                        </div>
                        <div className="skill-info">
                          <h4 className="skill-name">{skill.name}</h4>
                          <div className="skill-meta-inline">
                            {skill.version && <span className="skill-version">v{skill.version}</span>}
                            <span className="skill-category-badge">{skill.category}</span>
                          </div>
                        </div>
                        <label className="skill-toggle">
                          <input
                            type="checkbox"
                            checked={skill.enabled}
                            onChange={(e) => toggleSkill(skill.name, e.target.checked)}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </div>
                      <p className="skill-description">{skill.description || t('skills.noDescription')}</p>
                      <div className="skill-meta">
                        <span className="skill-author">{skill.author || (lang === 'zh' ? '未知' : 'Unknown')}</span>
                        <div className="skill-tags">
                          {(skill.tags || []).slice(0, 3).map((tag) => (
                            <span key={tag} className="skill-tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="skill-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            fetchSkillDetail(skill.category || '', skill.name);
                            setDetailTab('content');
                          }}
                        >
                          {t('skills.viewDetail')}
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={!skill.enabled}
                          onClick={() => {
                            const sessionId = `skill_${skill.name}_${Date.now()}`;
                            openTab(sessionId, skill.name, 'new');
                            setActiveItem('chat');
                          }}
                        >
                          <PlayIcon size={14} />
                          {t('skills.execute')}
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <span className="empty-icon">🔧</span>
              <p>{t('skills.noSkills')}</p>
            </div>
          )}
        </div>

        {/* Skill Detail Panel */}
        {selectedSkill && (
          <div className="skill-detail-overlay" onClick={clearSelectedSkill}>
            <div className="skill-detail-panel" onClick={(e) => e.stopPropagation()}>
              <div className="detail-header">
                <div className="detail-title-group">
                  <span className="detail-icon">
                    {SKILL_CATEGORY_DEFINITIONS[selectedSkill.category]?.icon || '🎯'}
                  </span>
                  <div>
                    <h2 className="detail-title">{selectedSkill.name}</h2>
                    <span className="detail-category">
                      {formatCategoryName(selectedSkill.category, lang)}
                    </span>
                  </div>
                </div>
                <button className="close-button" onClick={clearSelectedSkill}>
                  <XIcon size={14} />
                </button>
              </div>

              {isLoadingDetail ? (
                <div className="loading-container">
                  <div className="loading-spinner" />
                </div>
              ) : (
                <>
                  {/* Tab Navigation */}
                  <div className="detail-tabs">
                    <button
                      className={`detail-tab ${detailTab === 'content' ? 'active' : ''}`}
                      onClick={() => setDetailTab('content')}
                    >
                      {t('skills.content')}
                    </button>
                    <button
                      className={`detail-tab ${detailTab === 'history' ? 'active' : ''}`}
                      onClick={() => setDetailTab('history')}
                    >
                      {t('skills.execution.history')}
                    </button>
                    <button
                      className={`detail-tab ${detailTab === 'params' ? 'active' : ''}`}
                      onClick={() => setDetailTab('params')}
                    >
                      {t('skills.detail.information')}
                    </button>
                  </div>

                  {/* Content Tab */}
                  {detailTab === 'content' && (
                    <div className="detail-content-section">
                      <div className="content-header">
                        <h3 className="content-title">{t('skills.content')}</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyContent}
                        >
                          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                          {copied ? (lang === 'zh' ? '已复制' : 'Copied') : t('skills.detail.copyContent')}
                        </Button>
                      </div>
                      <pre className="content-code">{selectedSkill.content}</pre>
                    </div>
                  )}

                  {/* History Tab */}
                  {detailTab === 'history' && (
                    <div className="detail-history-section">
                      <h3 className="content-title">{t('skills.execution.history')}</h3>
                      {isLoadingHistory ? (
                        <div className="loading-container">
                          <div className="loading-spinner" />
                        </div>
                      ) : executionHistory.length > 0 ? (
                        <div className="execution-history-list">
                          {executionHistory.slice(0, 10).map((record) => (
                            <div key={record.id} className="execution-record">
                              <div className="record-header">
                                <span className={`record-status status-${record.status}`}>
                                  {record.status === 'success' ? '✓' : record.status === 'failed' ? '✗' : '○'}
                                </span>
                                <span className="record-time">
                                  {formatRelativeTime(record.executed_at, lang)}
                                </span>
                                {record.duration_ms && (
                                  <span className="record-duration">
                                    <ClockIcon size={12} />
                                    {formatDuration(record.duration_ms)}
                                  </span>
                                )}
                              </div>
                              {record.input_text && (
                                <div className="record-input">
                                  <span className="record-label">{t('skills.execution.input')}:</span>
                                  <span className="record-value">{record.input_text.slice(0, 100)}{record.input_text.length > 100 ? '...' : ''}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="empty-history">
                          <span className="empty-icon">📋</span>
                          <p>{t('skills.execution.noHistory')}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Info Tab */}
                  {detailTab === 'params' && (
                    <div className="detail-info-section">
                      <div className="detail-meta">
                        <div className="meta-item">
                          <span className="meta-label">{t('skills.version')}</span>
                          <span className="meta-value">
                            v{selectedSkill.metadata.version}
                          </span>
                        </div>
                        <div className="meta-item">
                          <span className="meta-label">{t('skills.author')}</span>
                          <span className="meta-value">
                            {selectedSkill.metadata.author}
                          </span>
                        </div>
                        {selectedSkill.metadata.license && (
                          <div className="meta-item">
                            <span className="meta-label">{t('skills.license')}</span>
                            <span className="meta-value">
                              {selectedSkill.metadata.license}
                            </span>
                          </div>
                        )}
                        <div className="meta-item">
                          <span className="meta-label">{t('skills.detail.path')}</span>
                          <span className="meta-value meta-path">
                            {selectedSkill.path}
                          </span>
                        </div>
                      </div>

                      <div className="detail-tags">
                        <h4 className="tags-title">{t('skills.detail.tags')}</h4>
                        <div className="tags-list">
                          {selectedSkill.metadata.metadata?.hermes?.tags?.map((tag) => (
                            <span key={tag} className="detail-tag">
                              {tag}
                            </span>
                          )) || <span className="no-tags">{t('skills.noTags')}</span>}
                        </div>
                      </div>

                      {selectedSkill.metadata.metadata?.hermes?.related_skills && (
                        <div className="related-skills">
                          <h4 className="related-title">{t('skills.detail.relatedSkills')}</h4>
                          <div className="related-list">
                            {selectedSkill.metadata.metadata.hermes.related_skills.map((skill) => (
                              <Button
                                key={skill}
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  // Try to find and open related skill
                                  const relatedSkill = skills.find(s => s.name === skill);
                                  if (relatedSkill) {
                                    fetchSkillDetail(relatedSkill.category || '', relatedSkill.name);
                                  }
                                }}
                              >
                                {skill}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="detail-actions">
                    <Button variant="ghost" onClick={() => {
                      setDeleteConfirm({ category: selectedSkill.category, name: selectedSkill.name });
                    }}>
                      <TrashIcon size={14} /> {t('common.delete')}
                    </Button>
                    <Button variant="secondary" onClick={() => handleEditSkill(selectedSkill)}>
                      <EditIcon size={14} /> {t('common.edit')}
                    </Button>
                    <Button variant="secondary" onClick={openExecutionModal}>
                      <PlayIcon size={14} /> {t('skills.runWithParams')}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => handleExecuteSkill(selectedSkill)}
                    >
                      <PlayIcon size={14} /> {t('skills.executeSkill')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Skill Modal */}
      {showAddModal && (
        <div className="add-skill-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="add-skill-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('skills.addModal.title')}</h2>
              <button className="close-button" onClick={() => setShowAddModal(false)}>
                <XIcon size={18} />
              </button>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label>{t('skills.addModal.name')}</label>
                <Input
                  placeholder={t('skills.addModal.name') + '...'}
                  value={newSkill.name}
                  onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>{t('skills.addModal.category')}</label>
                <div className="category-select-wrapper">
                  <Input
                    placeholder={t('skills.addModal.category') + '...'}
                    value={newSkill.category}
                    onChange={(e) => setNewSkill({ ...newSkill, category: e.target.value })}
                  />
                  <div className="category-suggestions">
                    {Object.keys(SKILL_CATEGORY_DEFINITIONS).slice(0, 5).map(cat => (
                      <button
                        key={cat}
                        className="category-suggestion"
                        onClick={() => setNewSkill({ ...newSkill, category: cat })}
                      >
                        {SKILL_CATEGORY_DEFINITIONS[cat].icon} {lang === 'zh' ? SKILL_CATEGORY_DEFINITIONS[cat].label : SKILL_CATEGORY_DEFINITIONS[cat].labelEn}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label>{t('skills.addModal.description')}</label>
                <Input
                  placeholder={t('skills.addModal.description') + '...'}
                  value={newSkill.description}
                  onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>{t('skills.addModal.content')}</label>
                <textarea
                  className="skill-content-textarea"
                  placeholder={t('skills.addModal.placeholder')}
                  value={newSkill.content}
                  onChange={(e) => setNewSkill({ ...newSkill, content: e.target.value })}
                  rows={10}
                />
              </div>
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setShowAddModal(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                disabled={!newSkill.name || !newSkill.category}
                onClick={async () => {
                  const success = await createSkill(newSkill);
                  if (success) {
                    toast.success(`Skill "${newSkill.name}" ${lang === 'zh' ? '已创建' : 'created'}`);
                    setShowAddModal(false);
                    setNewSkill({ name: '', category: '', description: '', content: '' });
                  }
                }}
              >
                {t('skills.addModal.add')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Skill Modal */}
      {showEditModal && (
        <div className="add-skill-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="add-skill-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('skills.editSkill') || '编辑 Skill'}</h2>
              <button className="close-button" onClick={() => setShowEditModal(false)}>
                <XIcon size={18} />
              </button>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label>{t('skills.addModal.name')}</label>
                <Input
                  placeholder={t('skills.addModal.name') + '...'}
                  value={editingSkill.name}
                  onChange={(e) => setEditingSkill({ ...editingSkill, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>{t('skills.addModal.category')}</label>
                <Input
                  placeholder={t('skills.addModal.category') + '...'}
                  value={editingSkill.category}
                  onChange={(e) => setEditingSkill({ ...editingSkill, category: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>{t('skills.addModal.description')}</label>
                <Input
                  placeholder={t('skills.addModal.description') + '...'}
                  value={editingSkill.description}
                  onChange={(e) => setEditingSkill({ ...editingSkill, description: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>{t('skills.addModal.content')}</label>
                <textarea
                  className="skill-content-textarea"
                  placeholder={t('skills.addModal.placeholder')}
                  value={editingSkill.content}
                  onChange={(e) => setEditingSkill({ ...editingSkill, content: e.target.value })}
                  rows={10}
                />
              </div>
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setShowEditModal(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                disabled={!editingSkill.name || !editingSkill.category}
                onClick={handleSaveEdit}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Execution Modal */}
      {showExecutionModal && selectedSkill && (
        <div className="add-skill-modal-overlay" onClick={() => setShowExecutionModal(false)}>
          <div className="add-skill-modal execution-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('skills.execution.title')}: {selectedSkill.name}</h2>
              <button className="close-button" onClick={() => setShowExecutionModal(false)}>
                <XIcon size={18} />
              </button>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label>{lang === 'zh' ? '输入上下文' : 'Input Context'}</label>
                <textarea
                  className="skill-content-textarea"
                  placeholder={t('skills.execution.inputPlaceholder')}
                  value={executionInput}
                  onChange={(e) => setExecutionInput(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="form-group">
                <label>{t('skills.execution.parameters')}</label>
                <div className="execution-params">
                  {executionParams.map((param, index) => (
                    <div key={index} className="param-row">
                      <Input
                        placeholder={t('skills.execution.parameterKey')}
                        value={param.key}
                        onChange={(e) => {
                          const newParams = [...executionParams];
                          newParams[index] = { ...newParams[index], key: e.target.value };
                          setExecutionParams(newParams);
                        }}
                      />
                      <Input
                        placeholder={t('skills.execution.parameterValue')}
                        value={param.value}
                        onChange={(e) => {
                          const newParams = [...executionParams];
                          newParams[index] = { ...newParams[index], value: e.target.value };
                          setExecutionParams(newParams);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setExecutionParams(executionParams.filter((_, i) => i !== index));
                        }}
                      >
                        <XIcon size={14} />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setExecutionParams([...executionParams, { key: '', value: '' }])}
                  >
                    <PlusIcon size={14} /> {t('skills.execution.addParameter')}
                  </Button>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setShowExecutionModal(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                disabled={isExecuting}
                onClick={handleExecuteWithParams}
              >
                {isExecuting ? t('skills.execution.running') : t('skills.execution.run')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm !== null}
        title={t('skills.delete') || '删除 Skill'}
        message={t('skills.deleteConfirm') || `确定要删除这个 Skill 吗？此操作无法撤销。`}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
        onConfirm={handleDeleteSkill}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
};
