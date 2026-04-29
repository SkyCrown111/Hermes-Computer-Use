import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import type { MemoryData, MemorySaveRequest, MemorySaveResponse, MemorySearchResult, MemoryFile, MemoryFileType } from '../types/memory';

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
  getMemory: async (): Promise<MemoryData> => {
    try {
      return await apiClient.invoke<MemoryData>('get_memories');
    } catch (error) {
      logger.error('[Memory] Failed to get memories:', getErrorDetail(error));
      return {
        memory: emptyMemoryFile('memory'),
        user_profile: emptyMemoryFile('user_profile'),
      };
    }
  },

  getMemoryFile: async (type: MemoryFileType): Promise<MemoryFile> => {
    try {
      const data = await apiClient.invoke<MemoryData>('get_memories');
      return type === 'user_profile' ? data.user_profile : data.memory;
    } catch {
      return emptyMemoryFile(type);
    }
  },

  saveMemory: async (data: MemorySaveRequest): Promise<MemorySaveResponse> => {
    try {
      return await apiClient.invoke<MemorySaveResponse>('save_memory', { file_type: data.type, content: data.content });
    } catch (error) {
      logger.error('[Memory] Failed to save memory:', getErrorDetail(error));
      return { ok: false, char_count: 0, char_limit: 100000 };
    }
  },

  searchMemory: async (query: string): Promise<MemorySearchResult[]> => {
    try {
      const data = await apiClient.invoke<MemoryData>('get_memories');
      const results: MemorySearchResult[] = [];
      const lowerQuery = query.toLowerCase();

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

  getSections: async (type: MemoryFileType): Promise<{ sections: { id: string; title?: string; content: string; charCount: number }[] }> => {
    try {
      const data = await apiClient.invoke<MemoryData>('get_memories');
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

  appendMemory: async (type: MemoryFileType, content: string): Promise<MemorySaveResponse> => {
    try {
      const data = await apiClient.invoke<MemoryData>('get_memories');
      const file = type === 'user_profile' ? data.user_profile : data.memory;
      const newContent = file.content + '\n\n' + content;
      return await apiClient.invoke<MemorySaveResponse>('save_memory', { file_type: type, content: newContent });
    } catch {
      return { ok: false, char_count: 0, char_limit: 100000 };
    }
  },

  clearMemory: async (type: MemoryFileType): Promise<{ ok: boolean }> => {
    try {
      await apiClient.invoke<MemorySaveResponse>('save_memory', { file_type: type, content: '' });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  },

  getMemoriesPath: async (): Promise<string> => {
    try {
      return await apiClient.invoke<string>('get_memories_path');
    } catch {
      return '~/.hermes/memories';
    }
  },

  // New API methods for enhanced memory operations
  searchMemoriesDirect: async (query: string, caseSensitive: boolean = false): Promise<{
    file: string;
    line_number: number;
    line_content: string;
    context_before: string[];
    context_after: string[];
  }[]> => {
    try {
      return await apiClient.invoke('search_memories', { query, caseSensitive });
    } catch (error) {
      logger.error('[Memory] Failed to search memories:', getErrorDetail(error));
      return [];
    }
  },

  deleteMemorySection: async (type: MemoryFileType, sectionId: string): Promise<{ ok: boolean; deleted_section: string; remaining_chars: number }> => {
    try {
      return await apiClient.invoke('delete_memory_section', { file_type: type, section_id: sectionId });
    } catch (error) {
      logger.error('[Memory] Failed to delete section:', getErrorDetail(error));
      return { ok: false, deleted_section: sectionId, remaining_chars: 0 };
    }
  },

  appendMemoryDirect: async (type: MemoryFileType, content: string, sectionTitle?: string): Promise<{ ok: boolean; char_count: number }> => {
    try {
      return await apiClient.invoke('append_memory', { file_type: type, content, section_title: sectionTitle });
    } catch (error) {
      logger.error('[Memory] Failed to append memory:', getErrorDetail(error));
      return { ok: false, char_count: 0 };
    }
  },
};
