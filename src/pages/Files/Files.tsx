import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, Button, FolderIcon, FileIcon, SearchIcon, AlertIcon, EmptyIcon, ChartIcon, FileTextIcon, SaveIcon, HourglassIcon, SparklesIcon, XIcon, RefreshIcon, EditIcon, TrashIcon, DownloadIcon, UploadIcon, ConfirmModal, InputModal } from '../../components';
import { useFilesStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { filesApi } from '../../services/filesApi';
import { logger } from '../../lib/logger';
import type { FileInfo, CacheItem } from '../../types/files';
import { formatBytes } from '../../utils/format';
import { toast } from '../../stores/toastStore';
import './Files.css';

// 工作区类型
interface Workspace {
  id: string;
  name: string;
  path: string;
  isActive: boolean;
}

// 获取文件图标
const getFileIcon = (item: FileInfo): string => {
  if (item.type === 'directory') return '>';

  const ext = item.extension?.toLowerCase();
  switch (ext) {
    case '.js':
    case '.jsx':
    case '.ts':
    case '.tsx':
      return '<>';
    case '.py':
      return '>>';
    case '.json':
      return '[]';
    case '.md':
      return '##';
    case '.css':
    case '.scss':
      return '{}';
    case '.html':
      return '<>';
    case '.png':
    case '.jpg':
    case '.gif':
    case '.svg':
      return '**';
    case '.pdf':
      return '()';
    case '.zip':
    case '.tar':
    case '.gz':
      return '(*)';
    case '.env':
      return '..';
    default:
      return '::';
  }
};

// Files Page Component
export const Files: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'browser' | 'cache'>('browser');
  // Workspaces loaded from store/config, defaults to home directory
  const [workspaces, setWorkspaces] = useState<Workspace[]>([
    { id: '1', name: 'Home', path: '~', isActive: true },
  ]);
  // Cache items loaded from API
  const [cacheItems, setCacheItems] = useState<CacheItem[]>([]);
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modal states
  const [deleteConfirm, setDeleteConfirm] = useState<{ path: string } | null>(null);
  const [newFileModal, setNewFileModal] = useState(false);
  const [newFolderModal, setNewFolderModal] = useState(false);

  // Upload/Download states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  // Virtual list ref for file browser
  const fileListRef = useRef<HTMLDivElement>(null);

  // 使用 filesStore
  const {
    // 状态
    currentPath,
    directoryContent,
    isLoadingDirectory,
    currentFile,
    editState,
    searchQuery,
    searchResults,
    selectedFiles,
    error,
    favoriteFiles,
    recentFiles,
    
    // Actions
    navigateTo,
    refreshDirectory,
    goUp,
    openFile,
    closeFile,
    startEdit,
    cancelEdit,
    updateEditContent,
    saveFile,
    createFile,
    deleteFile,
    selectFile,
    selectAll,
    deselectAll,
    searchFiles,
    clearSearch,
    loadFavorites,
    loadRecentFiles,
    addFavorite,
    clearError,
  } = useFilesStore();

  // 初始化加载
  useEffect(() => {
    navigateTo(currentPath);
    loadFavorites();
    loadRecentFiles();
  }, []);

  // 切换到缓存 tab 时加载缓存数据
  useEffect(() => {
    if (activeTab === 'cache') {
      filesApi.getCacheItems().then(items => {
        setCacheItems(items);
      });
    }
  }, [activeTab]);

  // 处理错误
  useEffect(() => {
    if (error) {
      logger.error('[Files] Error:', error);
      // 可以添加 toast 通知
    }
  }, [error]);

  // 过滤和排序文件
  const filteredFiles = useMemo(() => {
    const files = directoryContent?.files || [];
    let result = [...files];
    
    // 搜索过滤 - 使用 store 的搜索结果或本地过滤
    if (searchQuery && searchResults.length > 0) {
      // 从搜索结果构建 FileInfo 数组
      result = searchResults.map(r => ({
        name: r.fileName,
        path: r.path,
        type: r.type,
        size: 0,
        modified: '',
        created: '',
        isHidden: false,
        extension: r.fileName.includes('.') ? '.' + r.fileName.split('.').pop() : undefined,
      }));
    } else if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(file => 
        file.name.toLowerCase().includes(query) ||
        file.path.toLowerCase().includes(query)
      );
    }
    
    // 排序
    result.sort((a, b) => {
      // 目录优先
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case 'modified':
          comparison = new Date(a.modified || 0).getTime() - new Date(b.modified || 0).getTime();
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return result;
  }, [directoryContent, searchQuery, searchResults, sortBy, sortOrder]);

  // Virtual list for files (only enable for large lists > 100 items)
  const rowVirtualizer = useVirtualizer({
    count: filteredFiles.length,
    getScrollElement: () => fileListRef.current,
    estimateSize: () => 48, // Approximate row height
    overscan: 10,
  });

  // 缓存统计
  const cacheStats = useMemo(() => {
    const totalSize = cacheItems.reduce((sum, item) => sum + item.size, 0);
    const totalHits = cacheItems.reduce((sum, item) => sum + item.hits, 0);
    const fileCache = cacheItems.filter(item => item.type === 'file');
    const searchCache = cacheItems.filter(item => item.type === 'search');
    const metadataCache = cacheItems.filter(item => item.type === 'metadata');
    
    return {
      totalSize,
      totalHits,
      count: cacheItems.length,
      fileCount: fileCache.length,
      searchCount: searchCache.length,
      metadataCount: metadataCache.length,
    };
  }, [cacheItems]);

  // 切换工作区
  const handleWorkspaceChange = (workspaceId: string) => {
    const workspace = workspaces.find(ws => ws.id === workspaceId);
    if (workspace) {
      setWorkspaces(prev => prev.map(ws => ({
        ...ws,
        isActive: ws.id === workspaceId,
      })));
      navigateTo(workspace.path);
    }
  };

  // 切换文件选择
  const handleToggleFileSelection = (path: string, multi: boolean = false) => {
    selectFile(path, multi);
  };

  // 全选/取消全选
  const handleToggleSelectAll = () => {
    if (selectedFiles.size === filteredFiles.length && filteredFiles.length > 0) {
      deselectAll();
    } else {
      selectAll();
    }
  };

  // 切换排序
  const handleSort = (field: 'name' | 'size' | 'modified') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // 清除缓存
  const handleClearCache = async (type?: 'file' | 'search' | 'metadata') => {
    await filesApi.clearCache(type);
    if (type) {
      setCacheItems(prev => prev.filter(item => item.type !== type));
    } else {
      setCacheItems([]);
    }
  };

  // 删除缓存项
  const handleDeleteCacheItem = async (key: string) => {
    await filesApi.deleteCacheItem(key);
    setCacheItems(prev => prev.filter(item => item.key !== key));
  };

  // 处理搜索
  const handleSearch = useCallback((query: string) => {
    if (query.trim()) {
      searchFiles(query);
    } else {
      clearSearch();
    }
  }, [searchFiles, clearSearch]);

  // 处理文件操作
  const handleViewFile = async (path: string) => {
    await openFile(path);
    // Track in cache
    filesApi.addCacheItem({
      key: `file://${path}`,
      size: 0,
      type: 'file',
    });
  };

  const handleEditFile = async (path: string) => {
    await openFile(path);
    startEdit();
    // Track in cache
    filesApi.addCacheItem({
      key: `file://${path}`,
      size: 0,
      type: 'file',
    });
  };

  const handleDeleteFile = async (path: string) => {
    setDeleteConfirm({ path });
  };

  const confirmDelete = async () => {
    if (deleteConfirm) {
      await deleteFile(deleteConfirm.path);
      setDeleteConfirm(null);
    }
  };

  // 处理新建文件
  const handleCreateFile = async (name: string) => {
    const isDirectory = name.endsWith('/');
    await createFile(name, isDirectory ? 'directory' : 'file');
    setNewFileModal(false);
  };

  // 处理新建文件夹
  const handleCreateFolder = async (name: string) => {
    await createFile(name, 'directory');
    setNewFolderModal(false);
  };

  // 处理文件上传
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64 = event.target?.result as string;
          // Remove data URL prefix to get pure base64
          const base64Content = base64.split(',')[1];
          const targetPath = `${currentPath}/${file.name}`.replace('//', '/');

          await filesApi.uploadFile(targetPath, base64Content);
          toast.success(`文件 ${file.name} 上传成功`);
          refreshDirectory();
        } catch (err) {
          logger.error('[Files] Upload failed:', err);
          toast.error(`上传失败: ${(err as Error).message}`);
        } finally {
          setIsUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      logger.error('[Files] Upload failed:', err);
      toast.error(`上传失败: ${(err as Error).message}`);
      setIsUploading(false);
    }

    // Reset file input
    e.target.value = '';
  };

  // 处理文件下载
  const handleDownload = async (path: string) => {
    setIsDownloading(path);
    try {
      const result = await filesApi.downloadFile(path);

      // Create blob from base64
      const binaryString = atob(result.content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: result.mimeType });
      const url = URL.createObjectURL(blob);

      // Create download link
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`文件 ${result.filename} 下载成功`);
    } catch (err) {
      logger.error('[Files] Download failed:', err);
      toast.error(`下载失败: ${(err as Error).message}`);
    } finally {
      setIsDownloading(null);
    }
  };

  // 获取排序图标
  const getSortIcon = (field: 'name' | 'size' | 'modified') => {
    if (sortBy !== field) return '↕';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  // 渲染路径面包屑
  const renderBreadcrumbs = () => {
    const parts = currentPath.split('/').filter(Boolean);
    const breadcrumbs = [{ name: t('files.root'), path: '/' }];

    let accPath = '';
    parts.forEach(part => {
      accPath += '/' + part;
      breadcrumbs.push({ name: part, path: accPath });
    });

    return (
      <div className="toolbar-path">
        <span className="path-label">{t('files.path')}:</span>
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.path}>
            <span
              className="path-segment"
              onClick={() => navigateTo(crumb.path)}
            >
              {crumb.name}
            </span>
            {index < breadcrumbs.length - 1 && <span className="path-separator">/</span>}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="files">
      {/* Header */}
        <div className="files-header">
          {/* Tabs */}
          <div className="files-tabs">
            <button
              className={`files-tab ${activeTab === 'browser' ? 'files-tab-active' : ''}`}
              onClick={() => setActiveTab('browser')}
            >
              <span className="files-tab-icon"><FolderIcon size={16} /></span>
              <span>{t('files.fileBrowser')}</span>
            </button>
            <button
              className={`files-tab ${activeTab === 'cache' ? 'files-tab-active' : ''}`}
              onClick={() => setActiveTab('cache')}
            >
              <span className="files-tab-icon"><SaveIcon size={16} /></span>
              <span>{t('files.cacheManagement')}</span>
            </button>
          </div>

          {/* Search */}
          <div className="files-search">
            <span className="search-icon"><SearchIcon size={16} /></span>
            <input
              type="text"
              className="files-search-input"
              placeholder={activeTab === 'browser' ? t('files.searchFiles') : t('files.searchCache')}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => clearSearch()}>
                <XIcon size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="files-error">
            <span className="error-icon"><AlertIcon size={16} /></span>
            <span className="error-message">{error}</span>
            <button className="error-dismiss" onClick={clearError}><XIcon size={14} /></button>
          </div>
        )}

        {/* Content */}
        {activeTab === 'browser' ? (
          <div className="files-browser">
            {/* Sidebar - Workspaces */}
            <div className="files-sidebar">
              <div className="sidebar-header">
                <span className="sidebar-title">{t('files.workspace')}</span>
                <Button variant="ghost" size="sm">+ {t('files.add')}</Button>
              </div>
              <div className="workspace-list">
                {workspaces.map(workspace => (
                  <div
                    key={workspace.id}
                    className={`workspace-item ${workspace.isActive ? 'workspace-active' : ''}`}
                    onClick={() => handleWorkspaceChange(workspace.id)}
                  >
                    <span className="workspace-icon"><FolderIcon size={16} /></span>
                    <div className="workspace-info">
                      <span className="workspace-name">{workspace.name}</span>
                      <span className="workspace-path">{workspace.path}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Favorites Section */}
              {favoriteFiles.length > 0 && (
                <div className="sidebar-section">
                  <div className="sidebar-header">
                    <span className="sidebar-title">{t('files.favorites')}</span>
                  </div>
                  <div className="favorite-list">
                    {favoriteFiles.slice(0, 5).map(file => (
                      <div
                        key={file.path}
                        className="favorite-item"
                        onClick={() => openFile(file.path)}
                      >
                        <span className="favorite-icon">{getFileIcon(file)}</span>
                        <span className="favorite-name">{file.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Files Section */}
              {recentFiles.length > 0 && (
                <div className="sidebar-section">
                  <div className="sidebar-header">
                    <span className="sidebar-title">{t('files.recentFiles')}</span>
                  </div>
                  <div className="recent-list">
                    {recentFiles.slice(0, 5).map(file => (
                      <div
                        key={file.path}
                        className="recent-item"
                        onClick={() => openFile(file.path)}
                      >
                        <span className="recent-icon">{getFileIcon(file)}</span>
                        <span className="recent-name">{file.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Main Content - File List */}
            <div className="files-main">
              {/* Toolbar */}
              <div className="files-toolbar">
                {renderBreadcrumbs()}
                <div className="toolbar-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refreshDirectory()}
                    disabled={isLoadingDirectory}
                  >
                    <RefreshIcon size={14} /> {t('files.refresh')}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleUploadClick}
                    disabled={isUploading}
                  >
                    {isUploading ? <><HourglassIcon size={14} /> {'上传中...'}</> : <><UploadIcon size={14} /> {'上传'}</>}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewFolderModal(true)}
                  >
                    <FolderIcon size={14} /> {t('files.newFolder')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewFileModal(true)}
                  >
                    <FileIcon size={14} /> {t('files.newFile')}
                  </Button>
                  {currentPath !== '/' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => goUp()}
                    >
                    <FolderIcon size={14} /> {' '}
                    {t('files.parentDir')}
                    </Button>
                  )}
                </div>
              </div>

              {/* File List */}
              <Card className="files-list-card">
                {/* List Header */}
                <div className="files-list-header">
                  <div className="file-col-check">
                    <input
                      type="checkbox"
                      checked={selectedFiles.size === filteredFiles.length && filteredFiles.length > 0}
                      onChange={handleToggleSelectAll}
                    />
                  </div>
                  <div
                    className="file-col-name sortable"
                    onClick={() => handleSort('name')}
                  >
                    {t('files.name')} {getSortIcon('name')}
                  </div>
                  <div
                    className="file-col-size sortable"
                    onClick={() => handleSort('size')}
                  >
                    {t('files.size')} {getSortIcon('size')}
                  </div>
                  <div
                    className="file-col-modified sortable"
                    onClick={() => handleSort('modified')}
                  >
                    {t('files.modified')} {getSortIcon('modified')}
                  </div>
                  <div className="file-col-actions">{t('files.actions')}</div>
                </div>

                {/* List Body */}
                <div className="files-list-body" ref={fileListRef}>
                  {isLoadingDirectory ? (
                    <div className="files-loading">
                      <span className="loading-icon"><HourglassIcon size={16} /></span>
                      <span>{t('files.loading')}</span>
                    </div>
                  ) : filteredFiles.length > 100 ? (
                    // Virtualized list for large directories
                    <div
                      style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                      }}
                    >
                      {rowVirtualizer.getVirtualItems().map(virtualRow => {
                        const file = filteredFiles[virtualRow.index];
                        return (
                          <div
                            key={file.path}
                            className={`file-item ${selectedFiles.has(file.path) ? 'file-selected' : ''}`}
                            onClick={() => file.type === 'directory' && navigateTo(file.path)}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: `${virtualRow.size}px`,
                              transform: `translateY(${virtualRow.start}px)`,
                            }}
                          >
                            <div className="file-col-check">
                              <input
                                type="checkbox"
                                checked={selectedFiles.has(file.path)}
                                onChange={() => handleToggleFileSelection(file.path)}
                              />
                            </div>
                            <div className="file-col-name">
                              <span className="file-icon">{getFileIcon(file)}</span>
                              <span className="file-name">{file.name}</span>
                              {file.extension && (
                                <span className="file-ext">{file.extension}</span>
                              )}
                            </div>
                            <div className="file-col-size">
                              {file.size !== undefined ? formatBytes(file.size) : '-'}
                            </div>
                            <div className="file-col-modified">
                              {file.modified || '-'}
                            </div>
                            <div className="file-col-actions">
                              {file.type === 'file' && (
                                <>
                                  <button
                                    className="file-action-btn"
                                    title={t('files.view')}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewFile(file.path);
                                    }}
                                  >
                                    View
                                  </button>
                                  <button
                                    className="file-action-btn"
                                    title={t('files.edit')}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditFile(file.path);
                                    }}
                                  >
                                  <EditIcon size={14} />
                                  </button>
                                  <button
                                    className="file-action-btn"
                                    title={t('files.download') || '下载'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownload(file.path);
                                    }}
                                    disabled={isDownloading === file.path}
                                  >
                                    {isDownloading === file.path ? <HourglassIcon size={14} /> : <DownloadIcon size={14} />}
                                  </button>
                                </>
                              )}
                              <button
                                className="file-action-btn"
                                title={t('files.favorite')}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addFavorite(file.path);
                                }}
                              >
                                ★
                              </button>
                              <button
                                className="file-action-btn"
                                title={t('files.delete')}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFile(file.path);
                                }}
                              >
                                <TrashIcon size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : filteredFiles.length > 0 ? (
                    // Normal rendering for small lists
                    filteredFiles.map(file => (
                      <div
                        key={file.path}
                        className={`file-item ${selectedFiles.has(file.path) ? 'file-selected' : ''}`}
                        onClick={() => file.type === 'directory' && navigateTo(file.path)}
                      >
                        <div className="file-col-check">
                          <input
                            type="checkbox"
                            checked={selectedFiles.has(file.path)}
                            onChange={() => handleToggleFileSelection(file.path)}
                          />
                        </div>
                        <div className="file-col-name">
                          <span className="file-icon">{getFileIcon(file)}</span>
                          <span className="file-name">{file.name}</span>
                          {file.extension && (
                            <span className="file-ext">{file.extension}</span>
                          )}
                        </div>
                        <div className="file-col-size">
                          {file.size !== undefined ? formatBytes(file.size) : '-'}
                        </div>
                        <div className="file-col-modified">
                          {file.modified || '-'}
                        </div>
                        <div className="file-col-actions">
                          {file.type === 'file' && (
                            <>
                              <button
                                className="file-action-btn"
                                title={t('files.view')}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewFile(file.path);
                                }}
                              >
                                View
                              </button>
                              <button
                                className="file-action-btn"
                                title={t('files.edit')}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditFile(file.path);
                                }}
                              >
                                <EditIcon size={14} />
                              </button>
                              <button
                                className="file-action-btn"
                                title={t('files.download') || '下载'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(file.path);
                                }}
                                disabled={isDownloading === file.path}
                              >
                                {isDownloading === file.path ? <HourglassIcon size={14} /> : <DownloadIcon size={14} />}
                              </button>
                            </>
                          )}
                          <button
                            className="file-action-btn"
                            title={t('files.favorite')}
                            onClick={(e) => {
                              e.stopPropagation();
                              addFavorite(file.path);
                            }}
                          >
                            ★
                          </button>
                          <button
                            className="file-action-btn"
                            title={t('files.delete')}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFile(file.path);
                            }}
                          >
                            <TrashIcon size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="files-empty">
                      <span className="empty-icon"><EmptyIcon size={32} /></span>
                      <span>{searchQuery ? t('files.noMatchingFiles') : t('files.emptyDirectory')}</span>
                    </div>
                  )}
                </div>

                {/* List Footer */}
                {filteredFiles.length > 0 && (
                  <div className="files-list-footer">
                    <span className="file-count">
                      {filteredFiles.length} {t('files.totalItems')}
                      {selectedFiles.size > 0 && ` · ${t('files.selected')} ${selectedFiles.size}`}
                    </span>
                    {selectedFiles.size > 0 && (
                      <div className="batch-actions">
                        <Button variant="ghost" size="sm" onClick={() => deselectAll()}>
                          {t('files.deselectAll')}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* File Editor Modal */}
              {currentFile && (
                <div className="file-editor-overlay">
                  <div className="file-editor">
                    <div className="file-editor-header">
                      <span className="file-editor-title">{currentFile.path.split('/').pop()}</span>
                      <button className="file-editor-close" onClick={closeFile}><XIcon size={14} /></button>
                    </div>
                    <div className="file-editor-info">
                      <span>{t('files.path')}: {currentFile.path}</span>
                      <span>{t('files.size')}: {formatBytes(currentFile.size)}</span>
                      <span>{t('files.language')}: {currentFile.language}</span>
                    </div>
                    <div className="file-editor-content">
                      {editState ? (
                        <textarea
                          className="file-editor-textarea"
                          value={editState.content}
                          onChange={(e) => updateEditContent(e.target.value)}
                        />
                      ) : (
                        <pre className="file-editor-preview">
                          {currentFile.content}
                        </pre>
                      )}
                    </div>
                    <div className="file-editor-actions">
                      {editState ? (
                        <>
                          <Button
                            variant="primary"
                            onClick={() => saveFile()}
                            disabled={!editState.isDirty || editState.isSaving}
                          >
                            {editState.isSaving ? t('files.saving') : t('files.save')}
                          </Button>
                          <Button variant="secondary" onClick={cancelEdit}>
                            {t('files.cancel')}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="primary" onClick={startEdit}>
                            {t('files.edit')}
                          </Button>
                          <Button variant="secondary" onClick={closeFile}>
                            {t('files.close')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="files-cache">
            {/* Cache Stats */}
            <div className="cache-stats">
              <Card className="cache-stat-card">
                <div className="cache-stat-icon"><SaveIcon size={24} /></div>
                <div className="cache-stat-info">
                  <div className="cache-stat-value">{formatBytes(cacheStats.totalSize)}</div>
                  <div className="cache-stat-label">{t('files.totalCacheSize')}</div>
                </div>
              </Card>
              <Card className="cache-stat-card">
                <div className="cache-stat-icon"><ChartIcon size={24} /></div>
                <div className="cache-stat-info">
                  <div className="cache-stat-value">{cacheStats.totalHits}</div>
                  <div className="cache-stat-label">{t('files.totalHits')}</div>
                </div>
              </Card>
              <Card className="cache-stat-card">
                <div className="cache-stat-icon"><FileTextIcon size={24} /></div>
                <div className="cache-stat-info">
                  <div className="cache-stat-value">{cacheStats.fileCount}</div>
                  <div className="cache-stat-label">{t('files.fileCache')}</div>
                </div>
              </Card>
              <Card className="cache-stat-card">
                <div className="cache-stat-icon"><SearchIcon size={24} /></div>
                <div className="cache-stat-info">
                  <div className="cache-stat-value">{cacheStats.searchCount}</div>
                  <div className="cache-stat-label">{t('files.searchCache')}</div>
                </div>
              </Card>
            </div>

            {/* Cache Actions */}
            <div className="cache-actions">
              <span className="cache-actions-label">{t('files.clearCache')}</span>
              <Button variant="ghost" size="sm" onClick={() => handleClearCache('file')}>
                {t('files.clearFileCache')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleClearCache('search')}>
                {t('files.clearSearchCache')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleClearCache('metadata')}>
                {t('files.clearMetadataCache')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleClearCache()}>
                {t('files.clearAll')}
              </Button>
            </div>

            {/* Cache List */}
            <Card className="cache-list-card">
              <div className="cache-list-header">
                <div className="cache-col-key">{t('files.cacheKey')}</div>
                <div className="cache-col-type">{t('files.type')}</div>
                <div className="cache-col-size">{t('files.size')}</div>
                <div className="cache-col-hits">{t('files.hits')}</div>
                <div className="cache-col-accessed">{t('files.lastAccessed')}</div>
                <div className="cache-col-actions">{t('files.actions')}</div>
              </div>

              <div className="cache-list-body">
                {cacheItems
                  .filter(item => !searchQuery || item.key.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(item => (
                    <div key={item.key} className="cache-item">
                      <div className="cache-col-key">
                        <span className="cache-key">{item.key}</span>
                      </div>
                      <div className="cache-col-type">
                        <span className={`cache-type cache-type-${item.type}`}>
                          {item.type === 'file' ? 'File' : item.type === 'search' ? 'Search' : 'Meta'}
                          {item.type}
                        </span>
                      </div>
                      <div className="cache-col-size">
                        {formatBytes(item.size)}
                      </div>
                      <div className="cache-col-hits">
                        {item.hits}
                      </div>
                      <div className="cache-col-accessed">
                        {item.lastAccessed || '-'}
                      </div>
                      <div className="cache-col-actions">
                        <button
                          className="cache-action-btn"
                          onClick={() => handleDeleteCacheItem(item.key)}
                          title={t('files.delete')}
                        >
                          <TrashIcon size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

              {cacheItems.length === 0 && (
                <div className="cache-empty">
                  <span className="empty-icon"><SparklesIcon size={32} /></span>
                  <span>{t('files.cacheCleared')}</span>
                </div>
              )}
            </Card>
          </div>
        )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm !== null}
        title={t('files.delete')}
        message={t('files.confirmDelete')}
        confirmText={t('files.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* New File Modal */}
      <InputModal
        isOpen={newFileModal}
        title={t('files.newFile')}
        placeholder={t('files.enterFileName')}
        confirmText={t('common.create')}
        cancelText={t('common.cancel')}
        onConfirm={handleCreateFile}
        onCancel={() => setNewFileModal(false)}
      />

      {/* New Folder Modal */}
      <InputModal
        isOpen={newFolderModal}
        title={t('files.newFolder')}
        placeholder={t('files.enterFolderName')}
        confirmText={t('common.create')}
        cancelText={t('common.cancel')}
        onConfirm={handleCreateFolder}
        onCancel={() => setNewFolderModal(false)}
      />
    </div>
  );
};
