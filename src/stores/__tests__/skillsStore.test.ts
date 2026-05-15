// Skills Store Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSkillsStore } from '../skillsStore';
import type { SkillDetail } from '../../types/skill';

// Mock the skills API - skillsApi.ts uses named exports (export async function ...)
vi.mock('../../services/skillsApi', () => ({
  listSkills: vi.fn(),
  getSkillCategories: vi.fn(),
  getSkillDetail: vi.fn(),
  getSkillExecutionHistory: vi.fn(),
  toggleSkill: vi.fn(),
  createSkill: vi.fn(),
  deleteSkill: vi.fn(),
}));

import * as skillsApi from '../../services/skillsApi';

// Helper to create valid mock SkillDetail
const createMockSkillDetail = (overrides: Partial<SkillDetail> = {}): SkillDetail => ({
  name: 'code_review',
  category: 'dev',
  path: 'skills/code_review.md',
  content: '# Code Review\n...',
  metadata: {
    name: 'code_review',
    description: 'Code review skill',
    version: '1.0',
    author: 'system',
  },
  ...overrides,
});

describe('SkillsStore', () => {
  beforeEach(() => {
    useSkillsStore.setState({
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
    });
    vi.clearAllMocks();
  });

  describe('fetchSkills', () => {
    it('should fetch and set skills', async () => {
      const mockSkills = [
        { name: 'code_review', path: 'skills/code_review.md', description: 'Code review', enabled: true, category: 'dev', version: '1.0', author: 'system', tags: [] },
      ];
      vi.mocked(skillsApi.listSkills).mockResolvedValue(mockSkills);

      await useSkillsStore.getState().fetchSkills();

      const state = useSkillsStore.getState();
      expect(state.skills).toEqual(mockSkills);
      expect(state.isLoadingSkills).toBe(false);
    });

    it('should fetch skills for specific category', async () => {
      vi.mocked(skillsApi.listSkills).mockResolvedValue([]);

      await useSkillsStore.getState().fetchSkills('dev');

      expect(skillsApi.listSkills).toHaveBeenCalled();
    });

    it('should set error on fetch failure', async () => {
      vi.mocked(skillsApi.listSkills).mockRejectedValue(new Error('Network error'));

      await useSkillsStore.getState().fetchSkills();

      expect(useSkillsStore.getState().error).toBe('Network error');
    });

    it('should reuse fresh cached skills', async () => {
      vi.mocked(skillsApi.listSkills).mockResolvedValue([]);

      await useSkillsStore.getState().fetchSkills();
      await useSkillsStore.getState().fetchSkills();

      expect(skillsApi.listSkills).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchCategories', () => {
    it('should fetch and set categories', async () => {
      const mockCategories = [
        { name: 'development', skill_count: 5 },
        { name: 'general', skill_count: 3 },
      ];
      vi.mocked(skillsApi.getSkillCategories).mockResolvedValue({ categories: mockCategories });

      await useSkillsStore.getState().fetchCategories();

      expect(useSkillsStore.getState().categories).toEqual(mockCategories);
    });

    it('should reuse fresh cached categories', async () => {
      vi.mocked(skillsApi.getSkillCategories).mockResolvedValue({ categories: [] });

      await useSkillsStore.getState().fetchCategories();
      await useSkillsStore.getState().fetchCategories();

      expect(skillsApi.getSkillCategories).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchSkillDetail', () => {
    it('should fetch skill detail', async () => {
      const mockDetail = createMockSkillDetail();
      vi.mocked(skillsApi.getSkillDetail).mockResolvedValue(mockDetail);

      await useSkillsStore.getState().fetchSkillDetail('dev', 'code_review');

      expect(useSkillsStore.getState().selectedSkill).toEqual(mockDetail);
    });
  });

  describe('toggleSkill', () => {
    it('should toggle skill enabled state', async () => {
      useSkillsStore.setState({
        skills: [
          { name: 'code_review', path: '', description: '', enabled: true, category: 'dev', version: '1.0', author: 'system', tags: [] },
        ],
      });

      vi.mocked(skillsApi.toggleSkill).mockResolvedValue({ ok: true, name: 'code_review', category: 'dev', enabled: false });

      await useSkillsStore.getState().toggleSkill('dev', 'code_review', false);

      const skill = useSkillsStore.getState().skills.find(s => s.name === 'code_review');
      expect(skill?.enabled).toBe(false);
    });
  });

  describe('createSkill', () => {
    it('should create skill and refresh list', async () => {
      vi.mocked(skillsApi.createSkill).mockResolvedValue({ ok: true });
      vi.mocked(skillsApi.listSkills).mockResolvedValue([]);

      const result = await useSkillsStore.getState().createSkill({
        name: 'new_skill',
        category: 'dev',
        description: 'A new skill',
        content: '# New Skill',
      });

      expect(result).toBe(true);
      expect(skillsApi.createSkill).toHaveBeenCalled();
    });

    it('should return false on create failure', async () => {
      vi.mocked(skillsApi.createSkill).mockRejectedValue(new Error('Create failed'));

      const result = await useSkillsStore.getState().createSkill({
        name: 'new_skill',
        category: 'dev',
        description: '',
        content: '',
      });

      expect(result).toBe(false);
      expect(useSkillsStore.getState().error).toBe('Create failed');
    });
  });

  describe('updateSkill', () => {
    it('should update skill and refresh list', async () => {
      vi.mocked(skillsApi.deleteSkill).mockResolvedValue({ ok: true });
      vi.mocked(skillsApi.createSkill).mockResolvedValue({ ok: true });
      vi.mocked(skillsApi.listSkills).mockResolvedValue([]);

      const result = await useSkillsStore.getState().updateSkill('dev', 'old_name', {
        name: 'new_name',
        category: 'dev',
        description: 'Updated',
        content: '# Updated',
      });

      expect(result).toBe(true);
    });

    it('should create replacement before deleting original when renaming', async () => {
      vi.mocked(skillsApi.createSkill).mockResolvedValue({ ok: true });
      vi.mocked(skillsApi.deleteSkill).mockResolvedValue({ ok: true });
      vi.mocked(skillsApi.listSkills).mockResolvedValue([]);

      await useSkillsStore.getState().updateSkill('dev', 'old_name', {
        name: 'new_name',
        category: 'ops',
        description: 'Updated',
        content: '# Updated',
      });

      const createOrder = vi.mocked(skillsApi.createSkill).mock.invocationCallOrder[0];
      const deleteOrder = vi.mocked(skillsApi.deleteSkill).mock.invocationCallOrder[0];
      expect(createOrder).toBeLessThan(deleteOrder);
    });

    it('should not delete original skill if replacement creation fails', async () => {
      vi.mocked(skillsApi.createSkill).mockRejectedValue(new Error('Create failed'));

      const result = await useSkillsStore.getState().updateSkill('dev', 'old_name', {
        name: 'new_name',
        category: 'ops',
        description: 'Updated',
        content: '# Updated',
      });

      expect(result).toBe(false);
      expect(skillsApi.deleteSkill).not.toHaveBeenCalled();
    });
  });

  describe('fetchExecutionHistory', () => {
    it('should filter history to the selected category', async () => {
      vi.mocked(skillsApi.getSkillExecutionHistory).mockResolvedValue([
        {
          id: '1',
          skill_name: 'code_review',
          skill_category: 'dev',
          executed_at: '2025-01-01T00:00:00Z',
          status: 'success',
        },
        {
          id: '2',
          skill_name: 'code_review',
          skill_category: 'ops',
          executed_at: '2025-01-02T00:00:00Z',
          status: 'success',
        },
      ]);

      await useSkillsStore.getState().fetchExecutionHistory('code_review', 'dev');

      expect(skillsApi.getSkillExecutionHistory).toHaveBeenCalledWith('code_review', 20, 'dev');
      expect(useSkillsStore.getState().executionHistory).toEqual([
        {
          id: '1',
          skill_name: 'code_review',
          skill_category: 'dev',
          executed_at: '2025-01-01T00:00:00Z',
          status: 'success',
        },
      ]);
    });
  });

  describe('deleteSkill', () => {
    it('should delete skill and refresh list', async () => {
      vi.mocked(skillsApi.deleteSkill).mockResolvedValue({ ok: true });
      vi.mocked(skillsApi.listSkills).mockResolvedValue([]);

      const result = await useSkillsStore.getState().deleteSkill('dev', 'skill_name');

      expect(result).toBe(true);
      expect(skillsApi.deleteSkill).toHaveBeenCalledWith('skill_name', 'dev');
    });
  });

  describe('setSearchQuery', () => {
    it('should set search query', () => {
      useSkillsStore.getState().setSearchQuery('code');
      expect(useSkillsStore.getState().searchQuery).toBe('code');
    });
  });

  describe('setSelectedCategory', () => {
    it('should set category and fetch skills', async () => {
      vi.mocked(skillsApi.listSkills).mockResolvedValue([]);

      await useSkillsStore.getState().setSelectedCategory('dev');

      expect(useSkillsStore.getState().selectedCategory).toBe('dev');
      expect(skillsApi.listSkills).toHaveBeenCalled();
    });

    it('should fetch all skills when category is null', async () => {
      vi.mocked(skillsApi.listSkills).mockResolvedValue([]);

      await useSkillsStore.getState().setSelectedCategory(null);

      expect(useSkillsStore.getState().selectedCategory).toBeNull();
      expect(skillsApi.listSkills).toHaveBeenCalled();
    });
  });

  describe('clearSelectedSkill', () => {
    it('should clear selected skill', () => {
      useSkillsStore.setState({ selectedSkill: createMockSkillDetail() });

      useSkillsStore.getState().clearSelectedSkill();

      expect(useSkillsStore.getState().selectedSkill).toBeNull();
    });
  });

  describe('clearError', () => {
    it('should clear error', () => {
      useSkillsStore.setState({ error: 'Some error' });
      useSkillsStore.getState().clearError();
      expect(useSkillsStore.getState().error).toBeNull();
    });
  });
});
