// Files API - 文件管理接口
// 使用 Tauri invoke 调用后端 commands

import { safeInvoke } from '../lib/tauri';
import { logger } from '../lib/logger';
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

// Backend response types
interface BackendFileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  modified: string;
  created: string;
  permissions?: {
    read: boolean;
    write: boolean;
    execute: boolean;
  };
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

// Convert backend response to frontend type
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

export const filesApi = {
  // 获取目录内容
  getDirectory: async (request: FileListRequest): Promise<DirectoryContent> => {
    try {
      logger.debug('[FilesAPI] Getting directory:', request.path);
      const response = await safeInvoke<BackendDirectoryContent>('list_directory', {
        path: request.path,
        recursive: request.recursive,
        includeHidden: request.includeHidden,
        sortBy: request.sortBy,
        sortOrder: request.sortOrder,
      });

      return {
        path: response.path,
        files: response.files.map(convertFileInfo),
        totalFiles: response.total_files,
        totalDirectories: response.total_directories,
      };
    } catch (err) {
      logger.error('[FilesAPI] Failed to get directory:', err);
      throw err;
    }
  },

  // 获取文件信息
  getFileInfo: async (path: string): Promise<FileInfo> => {
    // Use list_directory with the parent path
    const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
    const fileName = path.substring(path.lastIndexOf('/') + 1);
    const dir = await filesApi.getDirectory({ path: parentPath });
    const file = dir.files.find(f => f.name === fileName);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }
    return file;
  },

  // 读取文件内容
  readFile: async (path: string): Promise<FileContent> => {
    try {
      logger.debug('[FilesAPI] Reading file:', path);
      const response = await safeInvoke<BackendFileContent>('read_file', { path });
      return {
        path: response.path,
        content: response.content,
        encoding: response.encoding,
        size: response.size,
        lines: response.lines,
        language: response.language,
      };
    } catch (err) {
      logger.error('[FilesAPI] Failed to read file:', err);
      throw err;
    }
  },

  // 创建文件/目录
  createFile: async (request: CreateFileRequest): Promise<FileOperationResult> => {
    try {
      logger.debug('[FilesAPI] Creating:', request.path, request.type);
      if (request.type === 'directory') {
        return await safeInvoke<FileOperationResult>('create_directory', { path: request.path });
      } else {
        return await safeInvoke<FileOperationResult>('write_file', {
          path: request.path,
          content: request.content || '',
        });
      }
    } catch (err) {
      logger.error('[FilesAPI] Failed to create:', err);
      throw err;
    }
  },

  // 更新文件内容
  updateFile: async (request: UpdateFileRequest): Promise<FileOperationResult> => {
    try {
      logger.debug('[FilesAPI] Updating file:', request.path);
      return await safeInvoke<FileOperationResult>('write_file', {
        path: request.path,
        content: request.content,
      });
    } catch (err) {
      logger.error('[FilesAPI] Failed to update file:', err);
      throw err;
    }
  },

  // 删除文件/目录
  deleteFile: async (path: string): Promise<FileOperationResult> => {
    try {
      logger.debug('[FilesAPI] Deleting:', path);
      return await safeInvoke<FileOperationResult>('delete_file', { path });
    } catch (err) {
      logger.error('[FilesAPI] Failed to delete:', err);
      throw err;
    }
  },

  // 移动文件/目录
  moveFile: async (request: MoveFileRequest): Promise<FileOperationResult> => {
    try {
      logger.debug('[FilesAPI] Moving:', request.source, 'to', request.destination);
      return await safeInvoke<FileOperationResult>('move_file', {
        source: request.source,
        destination: request.destination,
      });
    } catch (err) {
      logger.error('[FilesAPI] Failed to move:', err);
      throw err;
    }
  },

  // 复制文件/目录
  copyFile: async (request: MoveFileRequest): Promise<FileOperationResult> => {
    try {
      logger.debug('[FilesAPI] Copying:', request.source, 'to', request.destination);
      return await safeInvoke<FileOperationResult>('copy_file', {
        source: request.source,
        destination: request.destination,
      });
    } catch (err) {
      logger.error('[FilesAPI] Failed to copy:', err);
      throw err;
    }
  },

  // 重命名文件/目录
  renameFile: async (path: string, newName: string): Promise<FileOperationResult> => {
    const parentPath = path.substring(0, path.lastIndexOf('/'));
    const destination = `${parentPath}/${newName}`;
    return filesApi.moveFile({ source: path, destination });
  },

  // 搜索文件 (simplified - uses find command)
  searchFiles: async (request: FileSearchRequest): Promise<FileSearchResult[]> => {
    // For now, return empty array as we don't have a dedicated search command
    logger.debug('[FilesAPI] Search not implemented:', request);
    return [];
  },

  // 在文件内容中搜索
  searchInFiles: async (request: FileSearchRequest): Promise<FileSearchResult[]> => {
    logger.debug('[FilesAPI] Search in files not implemented:', request);
    return [];
  },

  // 获取文件树
  getFileTree: async (path: string, depth?: number): Promise<FileTreeNode> => {
    try {
      logger.debug('[FilesAPI] Getting file tree:', path);
      const response = await safeInvoke<{
        name: string;
        path: string;
        type: string;
        children?: Array<{ name: string; path: string; type: string }>;
      }>('get_file_tree', { path, depth });

      return {
        name: response.name,
        path: response.path,
        type: response.type as 'file' | 'directory' | 'symlink',
        children: response.children?.map(c => ({
          name: c.name,
          path: c.path,
          type: c.type as 'file' | 'directory' | 'symlink',
        })),
      };
    } catch (err) {
      logger.error('[FilesAPI] Failed to get file tree:', err);
      throw err;
    }
  },

  // 检查文件是否存在
  fileExists: async (path: string): Promise<{ exists: boolean; type?: string }> => {
    try {
      logger.debug('[FilesAPI] Checking if exists:', path);
      return await safeInvoke<{ exists: boolean; type?: string }>('file_exists', { path });
    } catch (err) {
      logger.error('[FilesAPI] Failed to check file:', err);
      return { exists: false };
    }
  },

  // 获取文件统计信息
  getFileStats: async (path: string): Promise<{
    size: number;
    lines: number;
    words: number;
    characters: number;
  }> => {
    try {
      const content = await filesApi.readFile(path);
      const words = content.content.split(/\s+/).filter(w => w.length > 0).length;
      return {
        size: content.size,
        lines: content.lines,
        words,
        characters: content.content.length,
      };
    } catch (err) {
      logger.error('[FilesAPI] Failed to get stats:', err);
      return { size: 0, lines: 0, words: 0, characters: 0 };
    }
  },

  // 创建目录
  createDirectory: async (path: string): Promise<FileOperationResult> => {
    try {
      logger.debug('[FilesAPI] Creating directory:', path);
      return await safeInvoke<FileOperationResult>('create_directory', { path });
    } catch (err) {
      logger.error('[FilesAPI] Failed to create directory:', err);
      throw err;
    }
  },

  // 批量删除
  batchDelete: async (paths: string[]): Promise<FileOperationResult[]> => {
    const results: FileOperationResult[] = [];
    for (const path of paths) {
      try {
        const result = await filesApi.deleteFile(path);
        results.push(result);
      } catch (err) {
        results.push({
          success: false,
          message: (err as Error).message,
          path,
        });
      }
    }
    return results;
  },

  // 批量移动
  batchMove: async (items: MoveFileRequest[]): Promise<FileOperationResult[]> => {
    const results: FileOperationResult[] = [];
    for (const item of items) {
      try {
        const result = await filesApi.moveFile(item);
        results.push(result);
      } catch (err) {
        results.push({
          success: false,
          message: (err as Error).message,
          path: item.source,
        });
      }
    }
    return results;
  },

  // 批量复制
  batchCopy: async (items: MoveFileRequest[]): Promise<FileOperationResult[]> => {
    const results: FileOperationResult[] = [];
    for (const item of items) {
      try {
        const result = await filesApi.copyFile(item);
        results.push(result);
      } catch (err) {
        results.push({
          success: false,
          message: (err as Error).message,
          path: item.source,
        });
      }
    }
    return results;
  },

  // 获取最近文件
  getRecentFiles: async (_limit?: number): Promise<FileInfo[]> => {
    // Not implemented - would need to track recent files
    logger.debug('[FilesAPI] getRecentFiles not implemented');
    return [];
  },

  // 获取收藏文件
  getFavoriteFiles: async (): Promise<FileInfo[]> => {
    // Not implemented - would need to track favorites
    logger.debug('[FilesAPI] getFavoriteFiles not implemented');
    return [];
  },

  // 添加收藏
  addFavorite: async (path: string): Promise<FileOperationResult> => {
    logger.debug('[FilesAPI] addFavorite not implemented:', path);
    return { success: true, message: 'Favorite added' };
  },

  // 移除收藏
  removeFavorite: async (path: string): Promise<FileOperationResult> => {
    logger.debug('[FilesAPI] removeFavorite not implemented:', path);
    return { success: true, message: 'Favorite removed' };
  },

  // ---- Cache Management ----

  CACHE_STORAGE_KEY: 'hermes-file-cache',

  // 获取所有缓存项
  getCacheItems: async (): Promise<CacheItem[]> => {
    try {
      const raw = localStorage.getItem('hermes-file-cache');
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      logger.error('[FilesAPI] Failed to get cache items:', err);
      return [];
    }
  },

  // 添加或更新缓存项
  addCacheItem: async (item: Omit<CacheItem, 'lastAccessed' | 'hits'>): Promise<void> => {
    try {
      const items = await filesApi.getCacheItems();
      const existing = items.find(i => i.key === item.key);
      if (existing) {
        existing.hits++;
        existing.lastAccessed = new Date().toISOString();
        existing.size = item.size;
      } else {
        items.push({
          ...item,
          hits: 1,
          lastAccessed: new Date().toISOString(),
        });
      }
      localStorage.setItem('hermes-file-cache', JSON.stringify(items));
    } catch (err) {
      logger.error('[FilesAPI] Failed to add cache item:', err);
    }
  },

  // 清除缓存（按类型或全部）
  clearCache: async (type?: 'file' | 'search' | 'metadata'): Promise<void> => {
    try {
      if (type) {
        const items = await filesApi.getCacheItems();
        localStorage.setItem('hermes-file-cache', JSON.stringify(items.filter(i => i.type !== type)));
      } else {
        localStorage.removeItem('hermes-file-cache');
      }
    } catch (err) {
      logger.error('[FilesAPI] Failed to clear cache:', err);
    }
  },

  // 删除单个缓存项
  deleteCacheItem: async (key: string): Promise<void> => {
    try {
      const items = await filesApi.getCacheItems();
      localStorage.setItem('hermes-file-cache', JSON.stringify(items.filter(i => i.key !== key)));
    } catch (err) {
      logger.error('[FilesAPI] Failed to delete cache item:', err);
    }
  },

  // 获取缓存统计
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
};
