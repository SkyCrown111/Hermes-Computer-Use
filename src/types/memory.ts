// Memory 记忆管理类型定义

// 记忆文件类型
export type MemoryFileType = 'memory' | 'user_profile';

// 记忆段落
export interface MemorySection {
  id: string;
  title?: string;
  content: string;
  startLine: number;
  endLine: number;
  charCount: number;
}

// 记忆文件
export interface MemoryFile {
  file: string;
  content: string;
  char_count: number;
  char_limit: number;
  sections: MemorySection[];
  last_modified?: string;
}

// 记忆数据
export interface MemoryData {
  memory: MemoryFile;
  user_profile: MemoryFile;
}

// 记忆编辑状态
export interface MemoryEditState {
  type: MemoryFileType;
  content: string;
  isEditing: boolean;
  isDirty: boolean;
}

// 记忆搜索结果
export interface MemorySearchResult {
  type: MemoryFileType;
  fileName: string;
  sectionId?: string;
  sectionTitle?: string;
  matchedContent: string;
  lineNumber: number;
  context: string;
}

// 记忆保存请求
export interface MemorySaveRequest {
  type: MemoryFileType;
  content: string;
}

// 记忆保存响应
export interface MemorySaveResponse {
  ok: boolean;
  char_count: number;
  char_limit: number;
}
