// Memory API - 记忆管理接口
// 使用 Tauri invoke 调用后端 commands

import { safeInvoke } from '../lib/tauri';
import { logger } from '../lib/logger';
import type { MemoryData, MemorySaveRequest, MemorySaveResponse, MemorySearchResult, MemoryFile, MemoryFileType } from '../types/memory';

// 创建空的 MemoryFile
function emptyMemoryFile(type: MemoryFileType): MemoryFile {
  return {
    file: type,
    content: '',
    char_count: 0,
    char_limit: 100000,
    sections: [],
  };
}

export const memoryApi = {
  // 获取所有记忆数据
  getMemory: async (): Promise<MemoryData> => {
    try {
      return await safeInvoke<MemoryData>('get_memories');
    } catch (error) {
      logger.error('[Memory] Failed to get memories:', error);
      return {
        memory: emptyMemoryFile('memory'),
        user_profile: emptyMemoryFile('user_profile'),
      };
    }
  },

  // 获取单个记忆文件
  getMemoryFile: async (type: MemoryFileType): Promise<MemoryFile> => {
    try {
      const data = await safeInvoke<MemoryData>('get_memories');
      return type === 'user_profile' ? data.user_profile : data.memory;
    } catch {
      return emptyMemoryFile(type);
    }
  },

  // 保存记忆
  saveMemory: async (data: MemorySaveRequest): Promise<MemorySaveResponse> => {
    try {
      return await safeInvoke<MemorySaveResponse>('save_memory', { fileType: data.type, content: data.content });
    } catch (error) {
      logger.error('[Memory] Failed to save memory:', error);
      return { ok: false, char_count: 0, char_limit: 100000 };
    }
  },

  // 搜索记忆 (本地实现)
  searchMemory: async (query: string): Promise<MemorySearchResult[]> => {
    try {
      const data = await safeInvoke<MemoryData>('get_memories');
      const results: MemorySearchResult[] = [];
      const lowerQuery = query.toLowerCase();

      // Search in memory
      for (const section of data.memory.sections) {
        if (section.content.toLowerCase().includes(lowerQuery)) {
          results.push({
            type: 'memory',
            fileName: 'MEMORY.md',
            sectionId: section.id,
            sectionTitle: section.title,
            matchedContent: section.content.substring(0, 200),
            lineNumber: section.startLine,
            context: section.content,
          });
        }
      }

      // Search in user profile
      for (const section of data.user_profile.sections) {
        if (section.content.toLowerCase().includes(lowerQuery)) {
          results.push({
            type: 'user_profile',
            fileName: 'USER.md',
            sectionId: section.id,
            sectionTitle: section.title,
            matchedContent: section.content.substring(0, 200),
            lineNumber: section.startLine,
            context: section.content,
          });
        }
      }

      return results;
    } catch {
      return [];
    }
  },

  // 获取记忆段落
  getSections: async (type: MemoryFileType): Promise<{ sections: { id: string; title?: string; content: string; charCount: number }[] }> => {
    try {
      const data = await safeInvoke<MemoryData>('get_memories');
      const file = type === 'user_profile' ? data.user_profile : data.memory;
      return {
        sections: file.sections.map(s => ({
          id: s.id,
          title: s.title,
          content: s.content,
          charCount: s.charCount,
        })),
      };
    } catch {
      return { sections: [] };
    }
  },

  // 追加记忆
  appendMemory: async (type: MemoryFileType, content: string): Promise<MemorySaveResponse> => {
    try {
      const data = await safeInvoke<MemoryData>('get_memories');
      const file = type === 'user_profile' ? data.user_profile : data.memory;
      const newContent = file.content + '\n\n' + content;
      return await safeInvoke<MemorySaveResponse>('save_memory', { fileType: type, content: newContent });
    } catch {
      return { ok: false, char_count: 0, char_limit: 100000 };
    }
  },

  // 清除记忆
  clearMemory: async (type: MemoryFileType): Promise<{ ok: boolean }> => {
    try {
      await safeInvoke<MemorySaveResponse>('save_memory', { fileType: type, content: '' });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  },
};
