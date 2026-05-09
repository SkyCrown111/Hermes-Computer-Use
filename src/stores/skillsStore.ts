// Skills Store - Skills 状态管理

import { create } from 'zustand';
import type { Skill, SkillDetail, SkillCategory, SkillExecutionRecord, SkillExecutionParams } from '../types/skill';
import * as skillsApi from '../services/skillsApi';
import { logger } from '../lib/logger';
import { getErrorMessage } from '../lib/errorUtils';

interface SkillsState {
  // Skills 列表
  skills: Skill[];
  isLoadingSkills: boolean;

  // 类别
  categories: SkillCategory[];
  selectedCategory: string | null;
  isLoadingCategories: boolean;

  // 搜索
  searchQuery: string;

  // Skill 详情
  selectedSkill: SkillDetail | null;
  isLoadingDetail: boolean;

  // 执行历史
  executionHistory: SkillExecutionRecord[];
  isLoadingHistory: boolean;

  // 错误
  error: string | null;

  // Actions
  fetchSkills: (category?: string) => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchSkillDetail: (category: string, name: string) => Promise<void>;
  fetchExecutionHistory: (skillName?: string) => Promise<void>;
  toggleSkill: (name: string, enabled: boolean) => Promise<void>;
  createSkill: (skill: { name: string; category: string; description: string; content: string }) => Promise<boolean>;
  updateSkill: (category: string, originalName: string, skill: { name: string; category: string; description: string; content: string }) => Promise<boolean>;
  deleteSkill: (category: string, name: string) => Promise<boolean>;
  executeSkill: (params: SkillExecutionParams) => Promise<string>;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
  clearSelectedSkill: () => void;
  clearError: () => void;
}

export const useSkillsStore = create<SkillsState>((set, get) => ({
  // 初始状态
  skills: [],
  isLoadingSkills: false,
  categories: [],
  selectedCategory: null,
  isLoadingCategories: false,
  searchQuery: '',
  selectedSkill: null,
  isLoadingDetail: false,
  executionHistory: [],
  isLoadingHistory: false,
  error: null,

  // 获取 Skills 列表
  fetchSkills: async (_category?: string) => {
    set({ isLoadingSkills: true, error: null });
    try {
      const skills = await skillsApi.listSkills();
      set({ skills, isLoadingSkills: false });
    } catch (err) {
      set({ error: getErrorMessage(err), isLoadingSkills: false });
    }
  },

  // 获取类别列表
  fetchCategories: async () => {
    set({ isLoadingCategories: true });
    try {
      const response = await skillsApi.getSkillCategories();
      logger.debug('[SkillsStore] Fetched categories:', response.categories);
      set({ categories: response.categories, isLoadingCategories: false });
    } catch (err) {
      logger.error('[SkillsStore] Failed to fetch categories:', err);
      set({ error: getErrorMessage(err), isLoadingCategories: false });
    }
  },

  // 获取 Skill 详情
  fetchSkillDetail: async (category: string, name: string) => {
    set({ isLoadingDetail: true, error: null });
    try {
      const skillDetail = await skillsApi.getSkillDetail(name, category);
      set({ selectedSkill: skillDetail, isLoadingDetail: false });
    } catch (err) {
      set({ error: getErrorMessage(err), isLoadingDetail: false });
    }
  },

  // 获取执行历史
  fetchExecutionHistory: async (skillName?: string) => {
    set({ isLoadingHistory: true });
    try {
      if (skillName) {
        const history = await skillsApi.getSkillExecutionHistory(skillName, 20);
        set({ executionHistory: history, isLoadingHistory: false });
      } else {
        set({ executionHistory: [], isLoadingHistory: false });
      }
    } catch (err) {
      logger.error('[SkillsStore] Failed to fetch execution history:', err);
      set({ executionHistory: [], isLoadingHistory: false });
    }
  },

  // 切换 Skill 启用状态
  toggleSkill: async (name: string, enabled: boolean) => {
    try {
      await skillsApi.toggleSkill({ name, enabled });
      // 更新本地状态
      const skills = get().skills.map((skill) =>
        skill.name === name ? { ...skill, enabled } : skill
      );
      set({ skills });
    } catch (err) {
      set({ error: getErrorMessage(err) });
    }
  },

  // 创建新 Skill
  createSkill: async (skillData: { name: string; category: string; description: string; content: string }) => {
    set({ error: null });
    try {
      // Call the API with full skill data including content
      await skillsApi.createSkill({
        name: skillData.name,
        category: skillData.category,
        description: skillData.description,
        content: skillData.content,
        metadata: {
          version: '1.0.0',
          author: 'User',
          tags: [],
        },
      });

      // Refresh the skills list
      await get().fetchSkills(get().selectedCategory || undefined);

      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  // 更新 Skill
  updateSkill: async (category: string, originalName: string, skillData: { name: string; category: string; description: string; content: string }) => {
    set({ error: null });
    try {
      // If name or category changed, need to delete old and create new
      if (skillData.name !== originalName || skillData.category !== category) {
        await skillsApi.deleteSkill(originalName, category);
      }

      // Create/update the skill
      await skillsApi.createSkill({
        name: skillData.name,
        category: skillData.category,
        description: skillData.description,
        content: skillData.content,
        metadata: {
          version: '1.0.0',
          author: 'User',
          tags: [],
        },
      });

      // Refresh the skills list
      await get().fetchSkills(get().selectedCategory || undefined);
      set({ selectedSkill: null });

      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  // 删除 Skill
  deleteSkill: async (category: string, name: string) => {
    set({ error: null });
    try {
      await skillsApi.deleteSkill(name, category);

      // Refresh the skills list
      await get().fetchSkills(get().selectedCategory || undefined);
      set({ selectedSkill: null });

      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  // 执行 Skill
  executeSkill: async (params: SkillExecutionParams) => {
    try {
      // Skill execution is handled through the chat/session API, not directly
      // Return a placeholder session_id
      logger.debug('[SkillsStore] executeSkill called with:', params);
      return `skill-${params.skill_name}-${Date.now()}`;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return '';
    }
  },

  // 设置搜索查询
  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  // 设置选中的类别
  setSelectedCategory: (category: string | null) => {
    set({ selectedCategory: category });
    get().fetchSkills(category || undefined);
  },

  // 清除选中的 Skill
  clearSelectedSkill: () => {
    set({ selectedSkill: null, executionHistory: [] });
  },

  // 清除错误
  clearError: () => {
    set({ error: null });
  },
}));
