// Files Store - 文件管理状态管理

import { create } from 'zustand';
import type {
  FileInfo,
  DirectoryContent,
  FileContent,
  FileSearchResult,
  FileEditState,
  FileTreeNode,
  FileUpload,
  FileType,
} from '../types/files';
import { filesApi } from '../services/filesApi';
import { logger } from '../lib/logger';

interface FilesState {
  // 当前目录
  currentPath: string;
  directoryContent: DirectoryContent | null;
  isLoadingDirectory: boolean;

  // 当前文件
  currentFile: FileContent | null;
  isLoadingFile: boolean;

  // 编辑状态
  editState: FileEditState | null;

  // 文件树
  fileTree: FileTreeNode | null;
  expandedPaths: Set<string>;

  // 搜索
  searchQuery: string;
  searchResults: FileSearchResult[];
  isSearching: boolean;

  // 收藏
  favoriteFiles: FileInfo[];
  recentFiles: FileInfo[];

  // 上传
  uploads: FileUpload[];

  // 选择
  selectedFiles: Set<string>;
  clipboardFiles: Set<string>;
  clipboardOperation: 'copy' | 'cut' | null;

  // 错误
  error: string | null;

  // Actions - 目录操作
  navigateTo: (path: string) => Promise<void>;
  refreshDirectory: () => Promise<void>;
  goUp: () => Promise<void>;

  // Actions - 文件操作
  openFile: (path: string) => Promise<void>;
  closeFile: () => void;
  startEdit: () => void;
  cancelEdit: () => void;
  updateEditContent: (content: string) => void;
  saveFile: () => Promise<boolean>;
  createFile: (name: string, type: FileType, content?: string) => Promise<boolean>;
  deleteFile: (path: string) => Promise<boolean>;
  renameFile: (path: string, newName: string) => Promise<boolean>;
  moveFile: (source: string, destination: string) => Promise<boolean>;
  copyFile: (source: string, destination: string) => Promise<boolean>;

  // Actions - 批量操作
  selectFile: (path: string, multi?: boolean) => void;
  selectAll: () => void;
  deselectAll: () => void;
  copySelected: () => void;
  cutSelected: () => void;
  paste: (destination: string) => Promise<boolean>;
  deleteSelected: () => Promise<boolean>;

  // Actions - 搜索
  searchFiles: (query: string, path?: string) => Promise<void>;
  clearSearch: () => void;

  // Actions - 文件树
  loadFileTree: (path: string, depth?: number) => Promise<void>;
  toggleTreeNode: (path: string) => void;
  expandTreeNode: (path: string) => void;
  collapseTreeNode: (path: string) => void;

  // Actions - 收藏
  loadFavorites: () => Promise<void>;
  loadRecentFiles: () => Promise<void>;
  addFavorite: (path: string) => Promise<void>;
  removeFavorite: (path: string) => Promise<void>;

  // Actions - 上传
  addUpload: (file: File, path: string) => void;
  updateUploadProgress: (fileName: string, progress: number) => void;
  completeUpload: (fileName: string, success: boolean, error?: string) => void;
  removeUpload: (fileName: string) => void;

  // Actions - 通用
  clearError: () => void;
}

// 获取父目录路径
const getParentPath = (path: string): string => {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return '/' + parts.join('/');
};

// 更新树节点展开状态
const updateTreeNodeExpanded = (
  node: FileTreeNode,
  targetPath: string,
  expanded: boolean
): FileTreeNode => {
  if (node.path === targetPath) {
    return { ...node, isExpanded: expanded };
  }
  if (node.children) {
    return {
      ...node,
      children: node.children.map(child =>
        updateTreeNodeExpanded(child, targetPath, expanded)
      ),
    };
  }
  return node;
};

export const useFilesStore = create<FilesState>((set, get) => ({
  // 初始状态
  currentPath: '/',
  directoryContent: null,
  isLoadingDirectory: false,
  currentFile: null,
  isLoadingFile: false,
  editState: null,
  fileTree: null,
  expandedPaths: new Set(),
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  favoriteFiles: [],
  recentFiles: [],
  uploads: [],
  selectedFiles: new Set(),
  clipboardFiles: new Set(),
  clipboardOperation: null,
  error: null,

  // 导航到目录
  navigateTo: async (path) => {
    set({ currentPath: path, isLoadingDirectory: true, error: null });
    try {
      const content = await filesApi.getDirectory({ path });
      set({ directoryContent: content, isLoadingDirectory: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoadingDirectory: false });
    }
  },

  // 刷新当前目录
  refreshDirectory: async () => {
    const { currentPath } = get();
    await get().navigateTo(currentPath);
  },

  // 返回上级目录
  goUp: async () => {
    const { currentPath } = get();
    if (currentPath === '/') return;
    const parentPath = getParentPath(currentPath);
    await get().navigateTo(parentPath);
  },

  // 打开文件
  openFile: async (path) => {
    set({ isLoadingFile: true, error: null });
    try {
      const content = await filesApi.readFile(path);
      set({
        currentFile: content,
        isLoadingFile: false,
        editState: null,
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoadingFile: false });
    }
  },

  // 关闭文件
  closeFile: () => {
    set({ currentFile: null, editState: null });
  },

  // 开始编辑
  startEdit: () => {
    const { currentFile } = get();
    if (!currentFile) return;
    set({
      editState: {
        path: currentFile.path,
        content: currentFile.content,
        originalContent: currentFile.content,
        isDirty: false,
        isSaving: false,
        language: currentFile.language,
      },
    });
  },

  // 取消编辑
  cancelEdit: () => {
    set({ editState: null });
  },

  // 更新编辑内容
  updateEditContent: (content) => {
    const { editState } = get();
    if (!editState) return;
    set({
      editState: {
        ...editState,
        content,
        isDirty: content !== editState.originalContent,
      },
    });
  },

  // 保存文件
  saveFile: async () => {
    const { editState } = get();
    if (!editState || !editState.isDirty) return false;

    set({ editState: { ...editState, isSaving: true } });
    try {
      const result = await filesApi.updateFile({
        path: editState.path,
        content: editState.content,
      });
      if (result.success) {
        set({
          editState: {
            ...editState,
            originalContent: editState.content,
            isDirty: false,
            isSaving: false,
          },
        });
        // 刷新目录
        get().refreshDirectory();
        return true;
      }
      set({ error: result.message, editState: { ...editState, isSaving: false } });
      return false;
    } catch (err) {
      set({ error: (err as Error).message, editState: { ...editState, isSaving: false } });
      return false;
    }
  },

  // 创建文件
  createFile: async (name, type, content) => {
    const { currentPath } = get();
    const fullPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    try {
      const result = await filesApi.createFile({
        path: fullPath,
        type,
        content,
      });
      if (result.success) {
        get().refreshDirectory();
        return true;
      }
      set({ error: result.message });
      return false;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },

  // 删除文件
  deleteFile: async (path) => {
    try {
      const result = await filesApi.deleteFile(path);
      if (result.success) {
        get().refreshDirectory();
        return true;
      }
      set({ error: result.message });
      return false;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },

  // 重命名文件
  renameFile: async (path, newName) => {
    try {
      const result = await filesApi.renameFile(path, newName);
      if (result.success) {
        get().refreshDirectory();
        return true;
      }
      set({ error: result.message });
      return false;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },

  // 移动文件
  moveFile: async (source, destination) => {
    try {
      const result = await filesApi.moveFile({ source, destination });
      if (result.success) {
        get().refreshDirectory();
        return true;
      }
      set({ error: result.message });
      return false;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },

  // 复制文件
  copyFile: async (source, destination) => {
    try {
      const result = await filesApi.copyFile({ source, destination });
      if (result.success) {
        get().refreshDirectory();
        return true;
      }
      set({ error: result.message });
      return false;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },

  // 选择文件
  selectFile: (path, multi = false) => {
    const { selectedFiles } = get();
    if (multi) {
      const newSelected = new Set(selectedFiles);
      if (newSelected.has(path)) {
        newSelected.delete(path);
      } else {
        newSelected.add(path);
      }
      set({ selectedFiles: newSelected });
    } else {
      set({ selectedFiles: new Set([path]) });
    }
  },

  // 全选
  selectAll: () => {
    const { directoryContent } = get();
    if (!directoryContent) return;
    const allPaths = directoryContent.files.map(f => f.path);
    set({ selectedFiles: new Set(allPaths) });
  },

  // 取消全选
  deselectAll: () => {
    set({ selectedFiles: new Set() });
  },

  // 复制选中
  copySelected: () => {
    const { selectedFiles } = get();
    set({
      clipboardFiles: new Set(selectedFiles),
      clipboardOperation: 'copy',
    });
  },

  // 剪切选中
  cutSelected: () => {
    const { selectedFiles } = get();
    set({
      clipboardFiles: new Set(selectedFiles),
      clipboardOperation: 'cut',
    });
  },

  // 粘贴
  paste: async (destination) => {
    const { clipboardFiles, clipboardOperation } = get();
    if (!clipboardOperation || clipboardFiles.size === 0) return false;

    try {
      const items = Array.from(clipboardFiles).map(source => ({
        source,
        destination: destination + '/' + source.split('/').pop(),
      }));

      const results = clipboardOperation === 'copy'
        ? await filesApi.batchCopy(items)
        : await filesApi.batchMove(items);

      const allSuccess = results.every(r => r.success);
      if (allSuccess) {
        set({ clipboardFiles: new Set(), clipboardOperation: null });
        get().refreshDirectory();
        return true;
      }
      set({ error: 'Some operations failed' });
      return false;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },

  // 删除选中
  deleteSelected: async () => {
    const { selectedFiles } = get();
    if (selectedFiles.size === 0) return false;

    try {
      const results = await filesApi.batchDelete(Array.from(selectedFiles));
      const allSuccess = results.every(r => r.success);
      if (allSuccess) {
        set({ selectedFiles: new Set() });
        get().refreshDirectory();
        return true;
      }
      set({ error: 'Some deletions failed' });
      return false;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },

  // 搜索文件
  searchFiles: async (query, path) => {
    const searchPath = path || get().currentPath;
    if (!query.trim()) {
      set({ searchQuery: '', searchResults: [] });
      return;
    }
    set({ searchQuery: query, isSearching: true });
    try {
      const results = await filesApi.searchFiles({
        path: searchPath,
        query,
        recursive: true,
      });
      set({ searchResults: results, isSearching: false });
    } catch (err) {
      set({ searchResults: [], isSearching: false });
      logger.error('Search failed:', err);
    }
  },

  // 清除搜索
  clearSearch: () => {
    set({ searchQuery: '', searchResults: [] });
  },

  // 加载文件树
  loadFileTree: async (path, depth = 3) => {
    try {
      const tree = await filesApi.getFileTree(path, depth);
      set({ fileTree: tree });
    } catch (err) {
      logger.error('Failed to load file tree:', err);
    }
  },

  // 切换树节点展开
  toggleTreeNode: (path) => {
    const { fileTree, expandedPaths } = get();
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    set({
      expandedPaths: newExpanded,
      fileTree: fileTree ? updateTreeNodeExpanded(fileTree, path, !expandedPaths.has(path)) : null,
    });
  },

  // 展开树节点
  expandTreeNode: (path) => {
    const { fileTree, expandedPaths } = get();
    const newExpanded = new Set(expandedPaths);
    newExpanded.add(path);
    set({
      expandedPaths: newExpanded,
      fileTree: fileTree ? updateTreeNodeExpanded(fileTree, path, true) : null,
    });
  },

  // 折叠树节点
  collapseTreeNode: (path) => {
    const { fileTree, expandedPaths } = get();
    const newExpanded = new Set(expandedPaths);
    newExpanded.delete(path);
    set({
      expandedPaths: newExpanded,
      fileTree: fileTree ? updateTreeNodeExpanded(fileTree, path, false) : null,
    });
  },

  // 加载收藏
  loadFavorites: async () => {
    try {
      const favorites = await filesApi.getFavoriteFiles();
      set({ favoriteFiles: favorites });
    } catch (err) {
      logger.error('Failed to load favorites:', err);
    }
  },

  // 加载最近文件
  loadRecentFiles: async () => {
    try {
      const recent = await filesApi.getRecentFiles();
      set({ recentFiles: recent });
    } catch (err) {
      logger.error('Failed to load recent files:', err);
    }
  },

  // 添加收藏
  addFavorite: async (path) => {
    try {
      await filesApi.addFavorite(path);
      get().loadFavorites();
    } catch (err) {
      logger.error('Failed to add favorite:', err);
    }
  },

  // 移除收藏
  removeFavorite: async (path) => {
    try {
      await filesApi.removeFavorite(path);
      get().loadFavorites();
    } catch (err) {
      logger.error('Failed to remove favorite:', err);
    }
  },

  // 添加上传
  addUpload: (file, path) => {
    const { uploads } = get();
    set({
      uploads: [
        ...uploads,
        {
          file,
          path,
          progress: 0,
          status: 'pending',
        },
      ],
    });
  },

  // 更新上传进度
  updateUploadProgress: (fileName, progress) => {
    const { uploads } = get();
    set({
      uploads: uploads.map(u =>
        u.file.name === fileName ? { ...u, progress, status: 'uploading' } : u
      ),
    });
  },

  // 完成上传
  completeUpload: (fileName, success, error) => {
    const { uploads } = get();
    set({
      uploads: uploads.map(u =>
        u.file.name === fileName
          ? { ...u, status: success ? 'success' : 'error', error }
          : u
      ),
    });
  },

  // 移除上传
  removeUpload: (fileName) => {
    const { uploads } = get();
    set({ uploads: uploads.filter(u => u.file.name !== fileName) });
  },

  // 清除错误
  clearError: () => {
    set({ error: null });
  },
}));
