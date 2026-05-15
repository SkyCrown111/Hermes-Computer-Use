import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import { getErrorMessage } from '../lib/errorUtils';
import type {
  FileInfo,
  DirectoryContent,
  FileContent,
  FileSearchResult,
  FileOperationResult,
  CreateFileRequest,
  UpdateFileRequest,
  MoveFileRequest,
  FileSearchRequest,
  FileListRequest,
  FileTreeNode,
  CacheItem,
} from '../types/files';

interface BackendFileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  modified: string;
  created: string;
  permissions?: { read: boolean; write: boolean; execute: boolean };
  is_hidden: boolean;
  extension?: string;
  mime_type?: string;
}

interface BackendDirectoryContent {
  path: string;
  files: BackendFileInfo[];
  total_files: number;
  total_directories: number;
}

interface BackendFileContent {
  path: string;
  content: string;
  encoding: string;
  size: number;
  lines: number;
  language?: string;
}

interface BackendFileSearchResult {
  path: string;
  file_name: string;
  matched_line?: number;
  matched_content?: string;
  context?: string;
  type: 'file' | 'directory' | 'symlink';
}

function convertFileInfo(backend: BackendFileInfo): FileInfo {
  return {
    name: backend.name,
    path: backend.path,
    type: backend.type,
    size: backend.size,
    modified: backend.modified,
    created: backend.created,
    permissions: backend.permissions,
    isHidden: backend.is_hidden,
    extension: backend.extension,
    mimeType: backend.mime_type,
  };
}

function convertSearchResult(backend: BackendFileSearchResult): FileSearchResult {
  return {
    path: backend.path,
    fileName: backend.file_name,
    matchedLine: backend.matched_line,
    matchedContent: backend.matched_content,
    context: backend.context,
    type: backend.type,
  };
}

export const filesApi = {
  getDirectory: async (request: FileListRequest): Promise<DirectoryContent> => {
    try {
      const response = await apiClient.invoke<BackendDirectoryContent>('list_directory', {
        path: request.path,
        recursive: request.recursive,
        include_hidden: request.includeHidden,
        sort_by: request.sortBy,
        sort_order: request.sortOrder,
      });
      return {
        path: response.path,
        files: response.files.map(convertFileInfo),
        totalFiles: response.total_files,
        totalDirectories: response.total_directories,
      };
    } catch (err) {
      logger.error('[FilesApi] getDirectory failed:', getErrorDetail(err));
      throw err;
    }
  },

  getFileInfo: async (path: string): Promise<FileInfo> => {
    const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
    const fileName = path.substring(path.lastIndexOf('/') + 1);
    const dir = await filesApi.getDirectory({ path: parentPath });
    const file = dir.files.find(f => f.name === fileName);
    if (!file) throw new Error(`File not found: ${path}`);
    return file;
  },

  readFile: async (path: string): Promise<FileContent> => {
    try {
      const response = await apiClient.invoke<BackendFileContent>('read_file', { path });
      return {
        path: response.path,
        content: response.content,
        encoding: response.encoding,
        size: response.size,
        lines: response.lines,
        language: response.language,
      };
    } catch (err) {
      logger.error('[FilesApi] readFile failed:', getErrorDetail(err));
      throw err;
    }
  },

  createFile: async (request: CreateFileRequest): Promise<FileOperationResult> => {
    try {
      if (request.type === 'directory') {
        return await apiClient.invoke<FileOperationResult>('create_directory', { path: request.path });
      }
      return await apiClient.invoke<FileOperationResult>('write_file', { path: request.path, content: request.content || '' });
    } catch (err) {
      logger.error('[FilesApi] createFile failed:', getErrorDetail(err));
      throw err;
    }
  },

  updateFile: async (request: UpdateFileRequest): Promise<FileOperationResult> => {
    try {
      return await apiClient.invoke<FileOperationResult>('write_file', { path: request.path, content: request.content });
    } catch (err) {
      logger.error('[FilesApi] updateFile failed:', getErrorDetail(err));
      throw err;
    }
  },

  deleteFile: async (path: string): Promise<FileOperationResult> => {
    try {
      return await apiClient.invoke<FileOperationResult>('delete_file', { path });
    } catch (err) {
      logger.error('[FilesApi] deleteFile failed:', getErrorDetail(err));
      throw err;
    }
  },

  moveFile: async (request: MoveFileRequest): Promise<FileOperationResult> => {
    try {
      return await apiClient.invoke<FileOperationResult>('move_file', { source: request.source, destination: request.destination });
    } catch (err) {
      logger.error('[FilesApi] moveFile failed:', getErrorDetail(err));
      throw err;
    }
  },

  copyFile: async (request: MoveFileRequest): Promise<FileOperationResult> => {
    try {
      return await apiClient.invoke<FileOperationResult>('copy_file', { source: request.source, destination: request.destination });
    } catch (err) {
      logger.error('[FilesApi] copyFile failed:', getErrorDetail(err));
      throw err;
    }
  },

  renameFile: async (path: string, newName: string): Promise<FileOperationResult> => {
    const parentPath = path.substring(0, path.lastIndexOf('/'));
    const destination = `${parentPath}/${newName}`;
    return filesApi.moveFile({ source: path, destination });
  },

  searchFiles: async (_request: FileSearchRequest): Promise<FileSearchResult[]> => {
    try {
      const response = await apiClient.invoke<BackendFileSearchResult[]>('search_files', {
        path: _request.path,
        query: _request.query,
        recursive: _request.recursive,
        include_hidden: _request.includeHidden,
        file_pattern: _request.filePattern,
      });
      return response.map(convertSearchResult);
    } catch (err) {
      logger.error('[FilesApi] searchFiles failed:', getErrorDetail(err));
      throw err;
    }
  },

  searchInFiles: async (_request: FileSearchRequest): Promise<FileSearchResult[]> => {
    return filesApi.searchFiles(_request);
  },

  getFileTree: async (path: string, depth?: number): Promise<FileTreeNode> => {
    try {
      const response = await apiClient.invoke<{ name: string; path: string; type: string; children?: Array<{ name: string; path: string; type: string }> }>('get_file_tree', { path, depth });
      return {
        name: response.name,
        path: response.path,
        type: response.type as 'file' | 'directory' | 'symlink',
        children: response.children?.map(c => ({ name: c.name, path: c.path, type: c.type as 'file' | 'directory' | 'symlink' })),
      };
    } catch (err) {
      logger.error('[FilesApi] getFileTree failed:', getErrorDetail(err));
      throw err;
    }
  },

  fileExists: async (path: string): Promise<{ exists: boolean; type?: string }> => {
    try {
      return await apiClient.invoke<{ exists: boolean; type?: string }>('file_exists', { path });
    } catch (err) {
      logger.error('[FilesApi] fileExists failed:', getErrorDetail(err));
      return { exists: false };
    }
  },

  getFileStats: async (path: string): Promise<{ size: number; lines: number; words: number; characters: number }> => {
    try {
      const content = await filesApi.readFile(path);
      const words = content.content.split(/\s+/).filter(w => w.length > 0).length;
      return { size: content.size, lines: content.lines, words, characters: content.content.length };
    } catch (err) {
      logger.error('[FilesApi] getFileStats failed:', getErrorDetail(err));
      return { size: 0, lines: 0, words: 0, characters: 0 };
    }
  },

  createDirectory: async (path: string): Promise<FileOperationResult> => {
    try {
      return await apiClient.invoke<FileOperationResult>('create_directory', { path });
    } catch (err) {
      logger.error('[FilesApi] createDirectory failed:', getErrorDetail(err));
      throw err;
    }
  },

  batchDelete: async (paths: string[]): Promise<FileOperationResult[]> => {
    const results: FileOperationResult[] = [];
    for (const path of paths) {
      try {
        results.push(await filesApi.deleteFile(path));
      } catch (err) {
        results.push({ success: false, message: getErrorMessage(err), path });
      }
    }
    return results;
  },

  batchMove: async (items: MoveFileRequest[]): Promise<FileOperationResult[]> => {
    const results: FileOperationResult[] = [];
    for (const item of items) {
      try {
        results.push(await filesApi.moveFile(item));
      } catch (err) {
        results.push({ success: false, message: getErrorMessage(err), path: item.source });
      }
    }
    return results;
  },

  batchCopy: async (items: MoveFileRequest[]): Promise<FileOperationResult[]> => {
    const results: FileOperationResult[] = [];
    for (const item of items) {
      try {
        results.push(await filesApi.copyFile(item));
      } catch (err) {
        results.push({ success: false, message: getErrorMessage(err), path: item.source });
      }
    }
    return results;
  },

  FAVORITES_STORAGE_KEY: 'hermes-file-favorites',
  RECENT_FILES_STORAGE_KEY: 'hermes-file-recent',
  WORKSPACES_STORAGE_KEY: 'hermes-file-workspaces',

  getFavoriteFiles: async (): Promise<FileInfo[]> => {
    try {
      const raw = localStorage.getItem('hermes-file-favorites');
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      logger.error('[FilesApi] getFavoriteFiles failed:', getErrorDetail(err));
      return [];
    }
  },

  addFavorite: async (path: string): Promise<FileOperationResult> => {
    try {
      const favorites = await filesApi.getFavoriteFiles();
      if (!favorites.some(f => f.path === path)) {
        const fileName = path.split('/').pop() || path;
        const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : undefined;
        favorites.push({ name: fileName, path, type: 'file', size: 0, modified: new Date().toISOString(), created: new Date().toISOString(), isHidden: false, extension: ext });
        localStorage.setItem('hermes-file-favorites', JSON.stringify(favorites));
      }
      return { success: true, message: 'Favorite added' };
    } catch (err) {
      return { success: false, message: getErrorMessage(err) };
    }
  },

  removeFavorite: async (path: string): Promise<FileOperationResult> => {
    try {
      const favorites = await filesApi.getFavoriteFiles();
      localStorage.setItem('hermes-file-favorites', JSON.stringify(favorites.filter(f => f.path !== path)));
      return { success: true, message: 'Favorite removed' };
    } catch (err) {
      return { success: false, message: getErrorMessage(err) };
    }
  },

  isFavorite: async (path: string): Promise<boolean> => {
    const favorites = await filesApi.getFavoriteFiles();
    return favorites.some(f => f.path === path);
  },

  getRecentFiles: async (limit: number = 10): Promise<FileInfo[]> => {
    try {
      const raw = localStorage.getItem('hermes-file-recent');
      return raw ? JSON.parse(raw).slice(0, limit) : [];
    } catch {
      return [];
    }
  },

  addRecentFile: async (path: string): Promise<void> => {
    try {
      const raw = localStorage.getItem('hermes-file-recent');
      let recent: FileInfo[] = raw ? JSON.parse(raw) : [];
      recent = recent.filter(f => f.path !== path);
      const fileName = path.split('/').pop() || path;
      const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : undefined;
      recent.unshift({ name: fileName, path, type: 'file', size: 0, modified: new Date().toISOString(), created: new Date().toISOString(), isHidden: false, extension: ext });
      recent = recent.slice(0, 20);
      localStorage.setItem('hermes-file-recent', JSON.stringify(recent));
    } catch (err) {
      logger.error('[FilesApi] addRecentFile failed:', getErrorDetail(err));
    }
  },

  clearRecentFiles: async (): Promise<void> => {
    localStorage.removeItem('hermes-file-recent');
  },

  getWorkspaces: async (): Promise<Array<{ id: string; name: string; path: string }>> => {
    try {
      const raw = localStorage.getItem('hermes-file-workspaces');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  addWorkspace: async (name: string, path: string): Promise<FileOperationResult> => {
    try {
      const workspaces = await filesApi.getWorkspaces();
      if (workspaces.some(w => w.path === path)) return { success: false, message: 'Workspace path already exists' };
      workspaces.push({ id: `ws-${Date.now()}`, name, path });
      localStorage.setItem('hermes-file-workspaces', JSON.stringify(workspaces));
      return { success: true, message: 'Workspace added', path };
    } catch (err) {
      return { success: false, message: getErrorMessage(err) };
    }
  },

  removeWorkspace: async (id: string): Promise<FileOperationResult> => {
    try {
      const workspaces = await filesApi.getWorkspaces();
      localStorage.setItem('hermes-file-workspaces', JSON.stringify(workspaces.filter(w => w.id !== id)));
      return { success: true, message: 'Workspace removed' };
    } catch (err) {
      return { success: false, message: getErrorMessage(err) };
    }
  },

  updateWorkspace: async (id: string, name: string, path: string): Promise<FileOperationResult> => {
    try {
      const workspaces = await filesApi.getWorkspaces();
      const index = workspaces.findIndex(w => w.id === id);
      if (index === -1) return { success: false, message: 'Workspace not found' };
      workspaces[index] = { id, name, path };
      localStorage.setItem('hermes-file-workspaces', JSON.stringify(workspaces));
      return { success: true, message: 'Workspace updated' };
    } catch (err) {
      return { success: false, message: getErrorMessage(err) };
    }
  },

  CACHE_STORAGE_KEY: 'hermes-file-cache',

  getCacheItems: async (): Promise<CacheItem[]> => {
    try {
      const raw = localStorage.getItem('hermes-file-cache');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  addCacheItem: async (item: Omit<CacheItem, 'lastAccessed' | 'hits'>): Promise<void> => {
    try {
      const items = await filesApi.getCacheItems();
      const existing = items.find(i => i.key === item.key);
      if (existing) {
        existing.hits++;
        existing.lastAccessed = new Date().toISOString();
        existing.size = item.size;
      } else {
        items.push({ ...item, hits: 1, lastAccessed: new Date().toISOString() });
      }
      localStorage.setItem('hermes-file-cache', JSON.stringify(items));
    } catch (err) {
      logger.error('[FilesApi] addCacheItem failed:', getErrorDetail(err));
    }
  },

  clearCache: async (type?: 'file' | 'search' | 'metadata'): Promise<void> => {
    try {
      if (type) {
        const items = await filesApi.getCacheItems();
        localStorage.setItem('hermes-file-cache', JSON.stringify(items.filter(i => i.type !== type)));
      } else {
        localStorage.removeItem('hermes-file-cache');
      }
    } catch (err) {
      logger.error('[FilesApi] clearCache failed:', getErrorDetail(err));
    }
  },

  deleteCacheItem: async (key: string): Promise<void> => {
    try {
      const items = await filesApi.getCacheItems();
      localStorage.setItem('hermes-file-cache', JSON.stringify(items.filter(i => i.key !== key)));
    } catch (err) {
      logger.error('[FilesApi] deleteCacheItem failed:', getErrorDetail(err));
    }
  },

  getCacheStats: async (): Promise<{ totalSize: number; totalHits: number; fileCount: number; searchCount: number; metadataCount: number }> => {
    const items = await filesApi.getCacheItems();
    return {
      totalSize: items.reduce((s, i) => s + i.size, 0),
      totalHits: items.reduce((s, i) => s + i.hits, 0),
      fileCount: items.filter(i => i.type === 'file').length,
      searchCount: items.filter(i => i.type === 'search').length,
      metadataCount: items.filter(i => i.type === 'metadata').length,
    };
  },

  downloadFile: async (path: string): Promise<{ content: string; mimeType: string; filename: string }> => {
    try {
      const response = await apiClient.invoke<{ path: string; content: string; size: number; mime_type?: string }>('read_file_binary', { path });
      return { content: response.content, mimeType: response.mime_type || 'application/octet-stream', filename: path.split('/').pop() || 'download' };
    } catch (err) {
      logger.error('[FilesApi] downloadFile failed:', getErrorDetail(err));
      throw err;
    }
  },

  uploadFile: async (path: string, content: string): Promise<FileOperationResult> => {
    try {
      return await apiClient.invoke<FileOperationResult>('write_file_binary', { path, content });
    } catch (err) {
      logger.error('[FilesApi] uploadFile failed:', getErrorDetail(err));
      throw err;
    }
  },
};
