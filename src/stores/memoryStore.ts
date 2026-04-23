// Memory Store - 记忆管理状态管理

import { create } from 'zustand';
import type { MemoryData, MemorySection, MemoryFileType, MemorySearchResult } from '../types/memory';
import { memoryApi } from '../services/memoryApi';
import { logger } from '../lib/logger';

// 解析记忆段落 (按 § 分隔符)
const parseSections = (content: string, prefix: string): MemorySection[] => {
  const sections: MemorySection[] = [];
  const lines = content.split('\n');

  let currentSection: MemorySection | null = null;
  let sectionContent: string[] = [];
  let sectionIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 检测段落分隔符 § 或标题行 (# 开头)
    const isSectionStart = line.includes('§') || (line.startsWith('#') && currentSection !== null);

    if (isSectionStart || i === 0) {
      // 保存上一个段落
      if (currentSection) {
        currentSection.content = sectionContent.join('\n').trim();
        currentSection.endLine = i - 1;
        currentSection.charCount = currentSection.content.length;
        sections.push(currentSection);
      }

      // 开始新段落
      const titleMatch = line.match(/^#+\s*(.+)$/);
      const sectionTitle = titleMatch ? titleMatch[1] : line.replace(/§/g, '').trim() || undefined;

      currentSection = {
        id: `${prefix}-section-${sectionIndex++}`,
        title: sectionTitle,
        content: '',
        startLine: i,
        endLine: i,
        charCount: 0,
      };
      sectionContent = [line];
    } else if (currentSection) {
      sectionContent.push(line);
    }
  }

  // 保存最后一个段落
  if (currentSection) {
    currentSection.content = sectionContent.join('\n').trim();
    currentSection.endLine = lines.length - 1;
    currentSection.charCount = currentSection.content.length;
    sections.push(currentSection);
  }

  return sections;
};

interface MemoryState {
  // 记忆数据
  memoryData: MemoryData | null;
  isLoading: boolean;
  
  // 当前编辑
  editingType: MemoryFileType | null;
  editingContent: string;
  isEditing: boolean;
  isDirty: boolean;
  
  // 搜索
  searchQuery: string;
  searchResults: MemorySearchResult[];
  isSearching: boolean;
  
  // 展开状态
  expandedSections: Record<string, boolean>;
  
  // 错误
  error: string | null;
  saveError: string | null;
  
  // Actions
  fetchMemory: () => Promise<void>;
  startEdit: (type: MemoryFileType) => void;
  cancelEdit: () => void;
  updateContent: (content: string) => void;
  saveMemory: () => Promise<boolean>;
  searchMemory: (query: string) => Promise<void>;
  toggleSection: (sectionId: string) => void;
  expandAllSections: () => void;
  collapseAllSections: () => void;
  clearError: () => void;
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  // 初始状态
  memoryData: null,
  isLoading: false,
  editingType: null,
  editingContent: '',
  isEditing: false,
  isDirty: false,
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  expandedSections: {},
  error: null,
  saveError: null,

  // 获取记忆数据
  fetchMemory: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await memoryApi.getMemory();
      
      // 解析段落
      const memoryWithSections: MemoryData = {
        memory: {
          ...data.memory,
          sections: parseSections(data.memory.content, 'memory'),
        },
        user_profile: {
          ...data.user_profile,
          sections: parseSections(data.user_profile.content, 'user'),
        },
      };
      
      // 默认展开所有段落
      const expandedSections: Record<string, boolean> = {};
      memoryWithSections.memory.sections.forEach(s => { expandedSections[s.id] = true; });
      memoryWithSections.user_profile.sections.forEach(s => { expandedSections[s.id] = true; });
      
      set({ 
        memoryData: memoryWithSections, 
        expandedSections,
        isLoading: false 
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  // 开始编辑
  startEdit: (type) => {
    const { memoryData } = get();
    if (!memoryData) return;
    
    const content = type === 'memory' 
      ? memoryData.memory.content 
      : memoryData.user_profile.content;
    
    set({
      editingType: type,
      editingContent: content,
      isEditing: true,
      isDirty: false,
    });
  },

  // 取消编辑
  cancelEdit: () => {
    set({
      editingType: null,
      editingContent: '',
      isEditing: false,
      isDirty: false,
      saveError: null,
    });
  },

  // 更新内容
  updateContent: (content) => {
    const { editingType, memoryData } = get();
    if (!editingType || !memoryData) return;
    
    const originalContent = editingType === 'memory'
      ? memoryData.memory.content
      : memoryData.user_profile.content;
    
    set({
      editingContent: content,
      isDirty: content !== originalContent,
    });
  },

  // 保存记忆
  saveMemory: async () => {
    const { editingType, editingContent } = get();
    if (!editingType) return false;
    
    set({ saveError: null });
    try {
      const response = await memoryApi.saveMemory({
        type: editingType,
        content: editingContent,
      });
      
      if (response.ok) {
        // 更新本地数据
        const { memoryData } = get();
        if (memoryData) {
          const updatedData = { ...memoryData };
          if (editingType === 'memory') {
            updatedData.memory = {
              ...updatedData.memory,
              content: editingContent,
              char_count: response.char_count,
              sections: parseSections(editingContent, 'memory'),
            };
          } else {
            updatedData.user_profile = {
              ...updatedData.user_profile,
              content: editingContent,
              char_count: response.char_count,
              sections: parseSections(editingContent, 'user'),
            };
          }
          set({ 
            memoryData: updatedData,
            isEditing: false,
            isDirty: false,
            editingType: null,
          });
        }
        return true;
      }
      return false;
    } catch (err) {
      set({ saveError: (err as Error).message });
      return false;
    }
  },

  // 搜索记忆
  searchMemory: async (query) => {
    if (!query.trim()) {
      set({ searchQuery: '', searchResults: [] });
      return;
    }
    
    set({ searchQuery: query, isSearching: true });
    try {
      const results = await memoryApi.searchMemory(query);
      set({ searchResults: results, isSearching: false });
    } catch (err) {
      set({ searchResults: [], isSearching: false });
      logger.error('Search failed:', err);
    }
  },

  // 切换段落展开
  toggleSection: (sectionId) => {
    const { expandedSections } = get();
    set({
      expandedSections: {
        ...expandedSections,
        [sectionId]: !expandedSections[sectionId],
      },
    });
  },

  // 展开所有段落
  expandAllSections: () => {
    const { memoryData } = get();
    if (!memoryData) return;
    
    const expandedSections: Record<string, boolean> = {};
    memoryData.memory.sections.forEach(s => { expandedSections[s.id] = true; });
    memoryData.user_profile.sections.forEach(s => { expandedSections[s.id] = true; });
    set({ expandedSections });
  },

  // 折叠所有段落
  collapseAllSections: () => {
    const { memoryData } = get();
    if (!memoryData) return;
    
    const expandedSections: Record<string, boolean> = {};
    memoryData.memory.sections.forEach(s => { expandedSections[s.id] = false; });
    memoryData.user_profile.sections.forEach(s => { expandedSections[s.id] = false; });
    set({ expandedSections });
  },

  // 清除错误
  clearError: () => {
    set({ error: null, saveError: null });
  },
}));
