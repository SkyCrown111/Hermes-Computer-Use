import React, { useEffect, useState } from 'react';
import { Card, Button, BrainIcon, UserIcon, BookIcon, SearchIcon, EmptyIcon, AlertIcon } from '../../components';
import { useMemoryStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import type { MemoryFileType, MemorySection, MemoryFile } from '../../types/memory';
import './Memory.css';

// 格式化字符数
const formatCharCount = (count: number): string => {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
};

// 获取字符使用率
const getCharUsage = (count: number, limit: number): number => {
  return Math.min((count / limit) * 100, 100);
};

// 获取字符进度条样式类
const getCharProgressClass = (usage: number): string => {
  if (usage < 80) return '';
  if (usage < 95) return 'char-progress-warning';
  return 'char-progress-danger';
};

// 获取字符计数样式类
const getCharCountClass = (usage: number): string => {
  if (usage < 80) return '';
  if (usage < 95) return 'char-count-warning';
  return 'char-count-danger';
};

interface MemoryFileViewProps {
  type: MemoryFileType;
  file: MemoryFile;
  isEditing: boolean;
  editingContent: string;
  expandedSections: Record<string, boolean>;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => Promise<boolean>;
  onUpdateContent: (content: string) => void;
  onToggleSection: (sectionId: string) => void;
  t: (key: string) => string;
}

// Memory File View Component
const MemoryFileView: React.FC<MemoryFileViewProps> = ({
  type,
  file,
  isEditing,
  editingContent,
  expandedSections,
  onStartEdit,
  onCancelEdit,
  onSave,
  onUpdateContent,
  onToggleSection,
  t,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const usage = getCharUsage(file.char_count, file.char_limit);
  const progressClass = getCharProgressClass(usage);
  const countClass = getCharCountClass(usage);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave();
    setIsSaving(false);
  };

  return (
    <Card className="memory-file">
      {/* Header */}
      <div className="memory-file-header">
        <div className="memory-file-title">
          <span className="memory-file-icon">{type === 'memory' ? <BrainIcon size={18} /> : <UserIcon size={18} />}</span>
          <span className="memory-file-name">{file.file}</span>
        </div>
        <div className="memory-file-stats">
          <div className={`char-count ${countClass}`}>
            <span>{formatCharCount(file.char_count)}</span>
            <span>/</span>
            <span>{formatCharCount(file.char_limit)}</span>
          </div>
          <div className="char-progress">
            <div
              className={`char-progress-fill ${progressClass}`}
              style={{ width: `${usage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="memory-content">
        {isEditing ? (
          <div className="edit-container">
            <textarea
              className="edit-textarea"
              value={editingContent}
              onChange={(e) => onUpdateContent(e.target.value)}
              placeholder={t('memory.enterMemory')}
            />
            <div className="edit-footer">
              <div className="edit-status">
                {editingContent.length !== file.char_count && (
                  <span className="edit-dirty">● {t('memory.unsaved')}</span>
                )}
                <span>{formatCharCount(editingContent.length)} {t('memory.chars')}</span>
              </div>
              <div className="edit-buttons">
                <Button variant="ghost" size="sm" onClick={onCancelEdit}>
                  {t('memory.cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? t('memory.saving') : t('memory.save')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Tips */}
            <div className="memory-tips">
              <div className="memory-tips-title">
                <span>💡</span>
                <span>{t('memory.formatTip')}</span>
              </div>
              <div className="memory-tips-content">
                {t('memory.formatTipDesc')}
              </div>
            </div>

            {/* Sections */}
            {file.sections.length > 0 ? (
              <div className="section-list">
                {file.sections.map((section) => (
                  <SectionItem
                    key={section.id}
                    section={section}
                    isExpanded={expandedSections[section.id] !== false}
                    onToggle={() => onToggleSection(section.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="no-sections">
                {t('memory.noContent')}
              </div>
            )}

            {/* Edit Button */}
            <div style={{ marginTop: 'var(--space-4)', textAlign: 'right' }}>
              <Button variant="secondary" onClick={onStartEdit}>
                {t('memory.edit')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
};

// Section Item Component
interface SectionItemProps {
  section: MemorySection;
  isExpanded: boolean;
  onToggle: () => void;
}

const SectionItem: React.FC<SectionItemProps> = ({ section, isExpanded, onToggle }) => {
  return (
    <div className="section-item">
      <div className="section-header" onClick={onToggle}>
        <div className="section-title-area">
          <span className={`section-toggle ${isExpanded ? 'section-toggle-expanded' : ''}`}>
            ▶
          </span>
          <span className="section-title">
            {section.title || `段落 ${section.id.split('-')[1]}`}
          </span>
        </div>
        <div className="section-meta">
          <span className="section-char-count">
            {formatCharCount(section.charCount)} 字符
          </span>
          <span className="section-line-range">
            行 {section.startLine + 1}-{section.endLine + 1}
          </span>
        </div>
      </div>
      <div className={`section-content ${!isExpanded ? 'section-content-collapsed' : ''}`}>
        {section.content}
      </div>
    </div>
  );
};

// Main Memory Page Component
export const Memory: React.FC = () => {
  const { t } = useTranslation();
  const {
    memoryData,
    isLoading,
    editingType,
    editingContent,
    isEditing,
    searchQuery,
    searchResults,
    isSearching,
    expandedSections,
    error,
    saveError,
    fetchMemory,
    startEdit,
    cancelEdit,
    updateContent,
    saveMemory,
    searchMemory,
    toggleSection,
    expandAllSections,
    collapseAllSections,
    clearError,
  } = useMemoryStore();

  const [activeTab, setActiveTab] = useState<MemoryFileType | 'both'>('both');

  // 初始化数据
  useEffect(() => {
    fetchMemory();
  }, [fetchMemory]);

  // 搜索处理
  const handleSearch = (query: string) => {
    searchMemory(query);
  };

  // 开始编辑
  const handleStartEdit = (type: MemoryFileType) => {
    startEdit(type);
  };

  // 保存记忆
  const handleSaveMemory = async (): Promise<boolean> => {
    return saveMemory();
  };

  if (isLoading) {
    return (
      <div className="memory">
        <div className="loading-container">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="memory">
      {/* Header */}
        <div className="memory-header">
          <div className="memory-tabs">
            <button
              className={`memory-tab ${activeTab === 'both' ? 'memory-tab-active' : ''}`}
              onClick={() => setActiveTab('both')}
            >
              <span className="memory-tab-icon"><BookIcon size={16} /></span>
              <span>{t('memory.all')}</span>
            </button>
            <button
              className={`memory-tab ${activeTab === 'memory' ? 'memory-tab-active' : ''}`}
              onClick={() => setActiveTab('memory')}
            >
              <span className="memory-tab-icon"><BrainIcon size={16} /></span>
              <div className="memory-tab-info">
                <span className="memory-tab-label">{t('memory.systemMemory')}</span>
                {memoryData && (
                  <span className="memory-tab-count">
                    {formatCharCount(memoryData.memory.char_count)} {t('memory.chars')}
                  </span>
                )}
              </div>
            </button>
            <button
              className={`memory-tab ${activeTab === 'user_profile' ? 'memory-tab-active' : ''}`}
              onClick={() => setActiveTab('user_profile')}
            >
              <span className="memory-tab-icon"><UserIcon size={16} /></span>
              <div className="memory-tab-info">
                <span className="memory-tab-label">{t('memory.userMemory')}</span>
                {memoryData && (
                  <span className="memory-tab-count">
                    {formatCharCount(memoryData.user_profile.char_count)} {t('memory.chars')}
                  </span>
                )}
              </div>
            </button>
          </div>

          <div className="memory-actions">
            {/* Search */}
            <div className="memory-search">
              <span className="search-icon"><SearchIcon size={16} /></span>
              <input
                type="text"
                className="memory-search-input"
                placeholder={t('memory.searchMemory')}
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
              />
              {isSearching && <span className="loading-spinner" style={{ width: 16, height: 16 }} />}
            </div>

            {/* Expand/Collapse Controls */}
            <div className="expand-controls">
              <button className="expand-btn" onClick={expandAllSections}>
                {t('memory.expandAll')}
              </button>
              <button className="expand-btn" onClick={collapseAllSections}>
                {t('memory.collapseAll')}
              </button>
            </div>
          </div>
        </div>

        {/* Error Messages */}
        {error && (
          <div className="error-message">
            <AlertIcon size={16} />
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={clearError}>{t('memory.close')}</Button>
          </div>
        )}

        {saveError && (
          <div className="error-message">
            <AlertIcon size={16} />
            <span>{t('memory.saveFailed')}: {saveError}</span>
          </div>
        )}

        {/* Search Results */}
        {searchQuery && searchResults.length > 0 && (
          <Card className="search-results">
            <div className="search-results-header">
              <span className="search-results-title">{t('memory.searchResults')}</span>
              <span className="search-results-count">{searchResults.length} {t('memory.matches')}</span>
            </div>
            <div className="search-result-list">
              {searchResults.map((result, index) => (
                <div key={index} className="search-result-item">
                  <div className="search-result-header">
                    <span className="search-result-file">
                      {result.type === 'memory' ? <BrainIcon size={14} /> : <UserIcon size={14} />} {result.fileName}
                    </span>
                    <span className="search-result-line">{t('memory.line')} {result.lineNumber}</span>
                  </div>
                  <div className="search-result-context">
                    {result.context.split(searchQuery).map((part, i, arr) => (
                      <React.Fragment key={i}>
                        {part}
                        {i < arr.length - 1 && (
                          <span className="search-highlight">{searchQuery}</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Memory Files Grid */}
        {memoryData && (
          <div className="memory-grid">
            {/* System Memory */}
            {(activeTab === 'both' || activeTab === 'memory') && (
              <MemoryFileView
                type="memory"
                file={memoryData.memory}
                isEditing={isEditing && editingType === 'memory'}
                editingContent={editingContent}
                expandedSections={expandedSections}
                onStartEdit={() => handleStartEdit('memory')}
                onCancelEdit={cancelEdit}
                onSave={handleSaveMemory}
                onUpdateContent={updateContent}
                onToggleSection={toggleSection}
                t={t}
              />
            )}

            {/* User Profile */}
            {(activeTab === 'both' || activeTab === 'user_profile') && (
              <MemoryFileView
                type="user_profile"
                file={memoryData.user_profile}
                isEditing={isEditing && editingType === 'user_profile'}
                editingContent={editingContent}
                expandedSections={expandedSections}
                onStartEdit={() => handleStartEdit('user_profile')}
                onCancelEdit={cancelEdit}
                onSave={handleSaveMemory}
                onUpdateContent={updateContent}
                onToggleSection={toggleSection}
                t={t}
              />
            )}
          </div>
        )}

        {/* Empty State */}
        {!memoryData && !isLoading && (
          <div className="empty-state">
            <span className="empty-icon"><EmptyIcon size={32} /></span>
            <span>{t('memory.noMemoryData')}</span>
          </div>
        )}
      </div>
  );
};
