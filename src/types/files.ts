// Files 文件管理类型定义

// 文件类型
export type FileType = 'file' | 'directory' | 'symlink';

// 文件权限
export interface FilePermissions {
  read: boolean;
  write: boolean;
  execute: boolean;
}

// 文件信息
export interface FileInfo {
  name: string;
  path: string;
  type: FileType;
  size: number;
  modified: string;
  created: string;
  permissions?: FilePermissions;
  isHidden: boolean;
  extension?: string;
  mimeType?: string;
}

// 目录内容
export interface DirectoryContent {
  path: string;
  files: FileInfo[];
  totalFiles: number;
  totalDirectories: number;
}

// 文件内容
export interface FileContent {
  path: string;
  content: string;
  encoding: string;
  size: number;
  lines: number;
  language?: string;
}

// 文件搜索结果
export interface FileSearchResult {
  path: string;
  fileName: string;
  matchedLine?: number;
  matchedContent?: string;
  context?: string;
  type: FileType;
}

// 文件操作结果
export interface FileOperationResult {
  success: boolean;
  message: string;
  path?: string;
}

// 文件创建请求
export interface CreateFileRequest {
  path: string;
  content?: string;
  type: FileType;
}

// 文件更新请求
export interface UpdateFileRequest {
  path: string;
  content: string;
}

// 文件移动/复制请求
export interface MoveFileRequest {
  source: string;
  destination: string;
}

// 文件搜索请求
export interface FileSearchRequest {
  path: string;
  query: string;
  recursive?: boolean;
  includeHidden?: boolean;
  filePattern?: string;
}

// 文件列表请求
export interface FileListRequest {
  path: string;
  recursive?: boolean;
  includeHidden?: boolean;
  sortBy?: 'name' | 'size' | 'modified' | 'type';
  sortOrder?: 'asc' | 'desc';
}

// 文件树节点 (用于树形展示)
export interface FileTreeNode {
  name: string;
  path: string;
  type: FileType;
  children?: FileTreeNode[];
  isExpanded?: boolean;
  isLoading?: boolean;
}

// 文件编辑状态
export interface FileEditState {
  path: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  isSaving: boolean;
  language?: string;
}

// 文件上传信息
export interface FileUpload {
  file: File;
  path: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

// 文件下载信息
export interface FileDownload {
  path: string;
  fileName: string;
  size: number;
  mimeType: string;
}

// 缓存项
export interface CacheItem {
  key: string;
  size: number;
  lastAccessed: string;
  hits: number;
  type: 'file' | 'search' | 'metadata';
}

// 常用文件扩展名映射
export const FILE_EXTENSION_MAP: Record<string, string> = {
  // 文本文件
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.xml': 'text/xml',
  '.csv': 'text/csv',
  
  // 编程语言
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  
  // 配置文件
  '.toml': 'toml',
  '.ini': 'ini',
  '.env': 'dotenv',
  '.gitignore': 'gitignore',
  '.dockerignore': 'dockerignore',
  
  // Shell
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.ps1': 'powershell',
  '.bat': 'batch',
  
  // 样式
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  
  // HTML/模板
  '.html': 'html',
  '.htm': 'html',
  '.vue': 'vue',
  '.svelte': 'svelte',
  
  // 数据库
  '.sql': 'sql',
  
  // 文档
  '.rst': 'rst',
  '.adoc': 'asciidoc',
};

// 获取文件语言
export function getFileLanguage(fileName: string): string | undefined {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase();
  return FILE_EXTENSION_MAP[ext];
}

// 判断是否为文本文件
export function isTextFile(fileName: string): boolean {
  const language = getFileLanguage(fileName);
  return language !== undefined;
}
