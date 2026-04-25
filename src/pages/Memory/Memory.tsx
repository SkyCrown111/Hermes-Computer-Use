import React, { useEffect, useState, useRef } from 'react';
import { Card, Button, BrainIcon, UserIcon, BookIcon, SearchIcon, EmptyIcon, AlertIcon } from '../../components';
import { useMemoryStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../stores/toastStore';
import type { MemoryFileType, MemorySection, MemoryFile, MemorySearchResult } from '../../types/memory';
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
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef<string>(editingContent);

  const usage = getCharUsage(file.char_count, file.char_limit);
  const progressClass = getCharProgressClass(usage);
  const countClass = getCharCountClass(usage);

  // Auto-save with debounce (2 seconds)
  useEffect(() => {
    if (!isEditing) return;

    // Clear previous timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Check if content changed
    if (editingContent === lastSavedContentRef.current) {
      setAutoSaveStatus('idle');
      return;
    }

    // Set saving indicator
    setAutoSaveStatus('saving');

    // Debounce auto-save
    autoSaveTimerRef.current = setTimeout(async () => {
      if (editingContent !== lastSavedContentRef.current) {
        setIsSaving(true);
        const success = await onSave();
        setIsSaving(false);

        if (success) {
          lastSavedContentRef.current = editingContent;
          setAutoSaveStatus('saved');
          toast.success(t('memory.saved') || 'Memory saved');

          // Clear "saved" indicator after 2 seconds
          setTimeout(() => setAutoSaveStatus('idle'), 2000);
        }
      }
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [editingContent, isEditing, onSave, t]);

  // Update lastSavedContent when entering edit mode
  useEffect(() => {
    if (isEditing) {
      lastSavedContentRef.current = editingContent;
      setAutoSaveStatus('idle');
    }
  }, [isEditing]);

  const handleSave = async () => {
    setIsSaving(true);
    const success = await onSave();
    setIsSaving(false);

    if (success) {
      lastSavedContentRef.current = editingContent;
      setAutoSaveStatus('saved');
    }
  };

  // Show auto-save status
  const getAutoSaveIndicator = () => {
    if (autoSaveStatus === 'saving') {
      return <span className="auto-save-indicator saving">⏳ Saving...</span>;
    }
    if (autoSaveStatus === 'saved') {
      return <span className="auto-save-indicator saved">✓ Saved</span>;
    }
    return null;
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
                {getAutoSaveIndicator()}
                {editingContent.length !== file.char_count && autoSaveStatus === 'idle' && (
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

  // Advanced search options
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchRegex, setSearchRegex] = useState(false);
  const [localSearchResults, setLocalSearchResults] = useState<MemorySearchResult[]>([]);

  // 初始化数据
  useEffect(() => {
    fetchMemory();
  }, [fetchMemory]);

  // 搜索处理 - supports case sensitivity and regex
  const handleSearch = (query: string) => {
    if (!query.trim()) {
      searchMemory('');
      setLocalSearchResults([]);
      return;
    }

    // Use advanced search with case sensitivity or regex
    if (searchCaseSensitive || searchRegex) {
      performAdvancedSearch(query);
    } else {
      // Use API search for simple queries
      searchMemory(query);
      setLocalSearchResults([]);
    }
  };

  // Advanced search implementation
  const performAdvancedSearch = (query: string) => {
    if (!memoryData) return;

    const results: MemorySearchResult[] = [];

    const searchInContent = (content: string, type: MemoryFileType, fileName: string) => {
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        let isMatch = false;

        try {
          if (searchRegex) {
            const regex = new RegExp(query, searchCaseSensitive ? 'g' : 'gi');
            isMatch = regex.test(line);
          } else {
            isMatch = searchCaseSensitive
              ? line.includes(query)
              : line.toLowerCase().includes(query.toLowerCase());
          }
        } catch {
          // Invalid regex, treat as literal
          isMatch = searchCaseSensitive
            ? line.includes(query)
            : line.toLowerCase().includes(query.toLowerCase());
        }

        if (isMatch) {
          results.push({
            type,
            fileName,
            lineNumber: index + 1,
            matchedContent: query, // The matched search term
            context: line,
          });
        }
      });
    };

    // Search in both files or filtered by activeTab
    if (activeTab === 'both' || activeTab === 'memory') {
      searchInContent(memoryData.memory.content, 'memory', memoryData.memory.file);
    }
    if (activeTab === 'both' || activeTab === 'user_profile') {
      searchInContent(memoryData.user_profile.content, 'user_profile', memoryData.user_profile.file);
    }

    setLocalSearchResults(results);
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
            <div className="memory-search-wrapper">
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
              {/* Advanced Search Options */}
              <div className="search-options">
                <label className="search-option" title="Case sensitive">
                  <input
                    type="checkbox"
                    checked={searchCaseSensitive}
                    onChange={(e) => {
                      setSearchCaseSensitive(e.target.checked);
                      if (searchQuery) handleSearch(searchQuery);
                    }}
                  />
                  <span>Aa</span>
                </label>
                <label className="search-option" title="Regular expression">
                  <input
                    type="checkbox"
                    checked={searchRegex}
                    onChange={(e) => {
                      setSearchRegex(e.target.checked);
                      if (searchQuery) handleSearch(searchQuery);
                    }}
                  />
                  <span>.*</span>
                </label>
              </div>
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
        {searchQuery && ((searchCaseSensitive || searchRegex) ? localSearchResults.length > 0 : searchResults.length > 0) && (
          <Card className="search-results">
            <div className="search-results-header">
              <span className="search-results-title">
                {t('memory.searchResults')}
                {(searchCaseSensitive || searchRegex) && (
                  <span className="search-mode-badge">
                    {searchRegex ? 'Regex' : searchCaseSensitive ? 'Case-sensitive' : ''}
                  </span>
                )}
              </span>
              <span className="search-results-count">
                {(searchCaseSensitive || searchRegex ? localSearchResults.length : searchResults.length)} {t('memory.matches')}
              </span>
            </div>
            <div className="search-result-list">
              {(searchCaseSensitive || searchRegex ? localSearchResults : searchResults).map((result, index) => (
                <div key={index} className="search-result-item">
                  <div className="search-result-header">
                    <span className="search-result-file">
                      {result.type === 'memory' ? <BrainIcon size={14} /> : <UserIcon size={14} />} {result.fileName}
                    </span>
                    <span className="search-result-line">{t('memory.line')} {result.lineNumber}</span>
                  </div>
                  <div className="search-result-context">
                    {!searchRegex ? (
                      result.context.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, searchCaseSensitive ? '' : 'i')).map((part, i, arr) => (
                        <React.Fragment key={i}>
                          {part}
                          {i < arr.length - 1 && i % 2 === 0 && (
                            <span className="search-highlight">{arr[i + 1]}</span>
                          )}
                        </React.Fragment>
                      ))
                    ) : (
                      result.context
                    )}
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
