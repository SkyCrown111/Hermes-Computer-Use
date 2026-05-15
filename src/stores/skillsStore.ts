import { create } from 'zustand';
import type { Skill, SkillDetail, SkillCategory, SkillExecutionRecord, SkillExecutionParams } from '../types/skill';
import * as skillsApi from '../services/skillsApi';
import { logger } from '../lib/logger';
import { getErrorMessage } from '../lib/errorUtils';

const SKILLS_FRESHNESS_MS = 5 * 60_000;
const CATEGORIES_FRESHNESS_MS = 10 * 60_000;

function isFresh(lastLoadedAt: number | null, freshnessMs: number, force = false): boolean {
  return !force && lastLoadedAt !== null && Date.now() - lastLoadedAt < freshnessMs;
}

interface SkillsState {
  skills: Skill[];
  isLoadingSkills: boolean;
  categories: SkillCategory[];
  selectedCategory: string | null;
  isLoadingCategories: boolean;
  searchQuery: string;
  selectedSkill: SkillDetail | null;
  isLoadingDetail: boolean;
  executionHistory: SkillExecutionRecord[];
  isLoadingHistory: boolean;
  error: string | null;
  lastLoadedSkillsAt: number | null;
  lastLoadedCategoriesAt: number | null;
  fetchSkills: (category?: string, force?: boolean) => Promise<void>;
  fetchCategories: (force?: boolean) => Promise<void>;
  fetchSkillDetail: (category: string, name: string) => Promise<void>;
  fetchExecutionHistory: (skillName?: string, skillCategory?: string) => Promise<void>;
  toggleSkill: (category: string, name: string, enabled: boolean) => Promise<void>;
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
  lastLoadedSkillsAt: null,
  lastLoadedCategoriesAt: null,

  fetchSkills: async (_category?: string, force = false) => {
    if (isFresh(get().lastLoadedSkillsAt, SKILLS_FRESHNESS_MS, force)) {
      return;
    }

    set({ isLoadingSkills: true, error: null });
    try {
      const skills = await skillsApi.listSkills();
      set({ skills, isLoadingSkills: false, lastLoadedSkillsAt: Date.now() });
    } catch (err) {
      set({ error: getErrorMessage(err), isLoadingSkills: false });
    }
  },

  fetchCategories: async (force = false) => {
    if (isFresh(get().lastLoadedCategoriesAt, CATEGORIES_FRESHNESS_MS, force)) {
      return;
    }

    set({ isLoadingCategories: true, error: null });
    try {
      const response = await skillsApi.getSkillCategories();
      logger.debug('[SkillsStore] Fetched categories:', response.categories);
      set({ categories: response.categories, isLoadingCategories: false, lastLoadedCategoriesAt: Date.now() });
    } catch (err) {
      logger.error('[SkillsStore] Failed to fetch categories:', err);
      set({ error: getErrorMessage(err), isLoadingCategories: false });
    }
  },

  fetchSkillDetail: async (category: string, name: string) => {
    set({ isLoadingDetail: true, error: null });
    try {
      const skillDetail = await skillsApi.getSkillDetail(name, category);
      set({ selectedSkill: skillDetail, isLoadingDetail: false });
    } catch (err) {
      set({ error: getErrorMessage(err), isLoadingDetail: false });
    }
  },

  fetchExecutionHistory: async (skillName?: string, skillCategory?: string) => {
    set({ isLoadingHistory: true });
    try {
      if (skillName) {
        const history = await skillsApi.getSkillExecutionHistory(skillName, 20, skillCategory);
        const filteredHistory = skillCategory
          ? history.filter((record) => record.skill_category === skillCategory)
          : history;
        set({ executionHistory: filteredHistory, isLoadingHistory: false });
      } else {
        set({ executionHistory: [], isLoadingHistory: false });
      }
    } catch (err) {
      logger.error('[SkillsStore] Failed to fetch execution history:', err);
      set({ executionHistory: [], isLoadingHistory: false });
    }
  },

  toggleSkill: async (category: string, name: string, enabled: boolean) => {
    try {
      await skillsApi.toggleSkill({ category, name, enabled });
      const skills = get().skills.map((skill) =>
        skill.name === name && skill.category === category ? { ...skill, enabled } : skill,
      );
      set({ skills });
    } catch (err) {
      set({ error: getErrorMessage(err) });
    }
  },

  createSkill: async (skillData) => {
    set({ error: null });
    try {
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

      await get().fetchSkills(get().selectedCategory || undefined, true);
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  updateSkill: async (category, originalName, skillData) => {
    set({ error: null });
    try {
      const renamed = skillData.name !== originalName || skillData.category !== category;

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

      if (renamed) {
        await skillsApi.deleteSkill(originalName, category);
      }

      await get().fetchSkills(get().selectedCategory || undefined, true);
      set({ selectedSkill: null });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  deleteSkill: async (category: string, name: string) => {
    set({ error: null });
    try {
      await skillsApi.deleteSkill(name, category);
      await get().fetchSkills(get().selectedCategory || undefined, true);
      set({ selectedSkill: null });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  executeSkill: async (params: SkillExecutionParams) => {
    try {
      const args: string[] = [];
      if (params.input_text) {
        args.push(params.input_text);
      }
      if (params.parameters) {
        for (const [key, value] of Object.entries(params.parameters)) {
          args.push(`${key}=${String(value)}`);
        }
      }
      const result = await skillsApi.executeSkill(params.skill_name, args);
      return result.id;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return '';
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  setSelectedCategory: (category: string | null) => {
    set({ selectedCategory: category });
    void get().fetchSkills(category || undefined);
  },

  clearSelectedSkill: () => {
    set({ selectedSkill: null, executionHistory: [] });
  },

  clearError: () => {
    set({ error: null });
  },
}));
