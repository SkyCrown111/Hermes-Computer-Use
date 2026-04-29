// Memory Store Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMemoryStore } from '../memoryStore';
import type { MemoryData, MemorySearchResult, MemorySaveResponse } from '../../types/memory';

// Mock the memory API
vi.mock('../../services/memoryApi', () => ({
  memoryApi: {
    getMemory: vi.fn(),
    saveMemory: vi.fn(),
    searchMemory: vi.fn(),
  },
}));

import { memoryApi } from '../../services/memoryApi';

// Helper to create valid mock MemoryData
const createMockMemoryData = (overrides: Partial<MemoryData> = {}): MemoryData => ({
  memory: {
    file: 'MEMORY.md',
    content: '# Section 1\nContent here',
    char_count: 20,
    char_limit: 100000,
    sections: [],
  },
  user_profile: {
    file: 'USER.md',
    content: '# Profile',
    char_count: 10,
    char_limit: 100000,
    sections: [],
  },
  ...overrides,
});

// Helper to create valid mock MemorySearchResult
const createMockSearchResult = (overrides: Partial<MemorySearchResult> = {}): MemorySearchResult => ({
  type: 'memory',
  fileName: 'MEMORY.md',
  matchedContent: 'Found match',
  lineNumber: 5,
  context: '...',
  ...overrides,
});

// Helper to create valid mock MemorySaveResponse
const createMockSaveResponse = (overrides: Partial<MemorySaveResponse> = {}): MemorySaveResponse => ({
  ok: true,
  char_count: 10,
  char_limit: 100000,
  ...overrides,
});

describe('MemoryStore', () => {
  beforeEach(() => {
    useMemoryStore.setState({
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
    });
    vi.clearAllMocks();
  });

  describe('fetchMemory', () => {
    it('should fetch and parse memory data', async () => {
      const mockData = createMockMemoryData({
        memory: {
          ...createMockMemoryData().memory,
          content: '# Section 1\nContent here\n\n# Section 2\nMore content',
        },
      });
      vi.mocked(memoryApi.getMemory).mockResolvedValue(mockData);

      await useMemoryStore.getState().fetchMemory();

      const state = useMemoryStore.getState();
      expect(state.memoryData).not.toBeNull();
      expect(state.isLoading).toBe(false);
    });

    it('should set error on fetch failure', async () => {
      vi.mocked(memoryApi.getMemory).mockRejectedValue(new Error('Failed to load'));

      await useMemoryStore.getState().fetchMemory();

      expect(useMemoryStore.getState().error).toBe('Failed to load');
      expect(useMemoryStore.getState().isLoading).toBe(false);
    });
  });

  describe('startEdit', () => {
    it('should start editing memory', async () => {
      const mockData = createMockMemoryData({
        memory: { ...createMockMemoryData().memory, content: 'Test content' },
      });
      vi.mocked(memoryApi.getMemory).mockResolvedValue(mockData);
      await useMemoryStore.getState().fetchMemory();

      useMemoryStore.getState().startEdit('memory');

      const state = useMemoryStore.getState();
      expect(state.editingType).toBe('memory');
      expect(state.editingContent).toBe('Test content');
      expect(state.isEditing).toBe(true);
      expect(state.isDirty).toBe(false);
    });

    it('should not start edit without memory data', () => {
      useMemoryStore.getState().startEdit('memory');

      expect(useMemoryStore.getState().isEditing).toBe(false);
    });
  });

  describe('cancelEdit', () => {
    it('should cancel editing and reset state', () => {
      useMemoryStore.setState({
        editingType: 'memory',
        editingContent: 'Some content',
        isEditing: true,
        isDirty: true,
        saveError: 'Previous error',
      });

      useMemoryStore.getState().cancelEdit();

      const state = useMemoryStore.getState();
      expect(state.editingType).toBeNull();
      expect(state.editingContent).toBe('');
      expect(state.isEditing).toBe(false);
      expect(state.isDirty).toBe(false);
      expect(state.saveError).toBeNull();
    });
  });

  describe('updateContent', () => {
    it('should update content and mark as dirty', async () => {
      const mockData = createMockMemoryData({
        memory: { ...createMockMemoryData().memory, content: 'Original' },
      });
      vi.mocked(memoryApi.getMemory).mockResolvedValue(mockData);
      await useMemoryStore.getState().fetchMemory();
      useMemoryStore.getState().startEdit('memory');

      useMemoryStore.getState().updateContent('Modified');

      const state = useMemoryStore.getState();
      expect(state.editingContent).toBe('Modified');
      expect(state.isDirty).toBe(true);
    });

    it('should not mark as dirty if content matches original', async () => {
      const mockData = createMockMemoryData({
        memory: { ...createMockMemoryData().memory, content: 'Original' },
      });
      vi.mocked(memoryApi.getMemory).mockResolvedValue(mockData);
      await useMemoryStore.getState().fetchMemory();
      useMemoryStore.getState().startEdit('memory');

      useMemoryStore.getState().updateContent('Original');

      expect(useMemoryStore.getState().isDirty).toBe(false);
    });
  });

  describe('saveMemory', () => {
    it('should save memory and update local data', async () => {
      const mockData = createMockMemoryData({
        memory: { ...createMockMemoryData().memory, content: 'Original' },
      });
      vi.mocked(memoryApi.getMemory).mockResolvedValue(mockData);
      await useMemoryStore.getState().fetchMemory();
      useMemoryStore.setState({ editingType: 'memory', editingContent: 'New content' });

      vi.mocked(memoryApi.saveMemory).mockResolvedValue(createMockSaveResponse({ char_count: 10 }));

      const result = await useMemoryStore.getState().saveMemory();

      expect(result).toBe(true);
      expect(useMemoryStore.getState().isEditing).toBe(false);
    });

    it('should return false if no editing type', async () => {
      const result = await useMemoryStore.getState().saveMemory();
      expect(result).toBe(false);
    });

    it('should set saveError on failure', async () => {
      useMemoryStore.setState({ editingType: 'memory', editingContent: 'Test' });
      vi.mocked(memoryApi.saveMemory).mockRejectedValue(new Error('Save failed'));

      const result = await useMemoryStore.getState().saveMemory();

      expect(result).toBe(false);
      expect(useMemoryStore.getState().saveError).toBe('Save failed');
    });
  });

  describe('searchMemory', () => {
    it('should search memory and set results', async () => {
      const mockResults = [createMockSearchResult()];
      vi.mocked(memoryApi.searchMemory).mockResolvedValue(mockResults);

      await useMemoryStore.getState().searchMemory('test query');

      const state = useMemoryStore.getState();
      expect(state.searchQuery).toBe('test query');
      expect(state.searchResults).toEqual(mockResults);
      expect(state.isSearching).toBe(false);
    });

    it('should clear results for empty query', async () => {
      useMemoryStore.setState({ searchResults: [createMockSearchResult()] });

      await useMemoryStore.getState().searchMemory('   ');

      expect(useMemoryStore.getState().searchQuery).toBe('');
      expect(useMemoryStore.getState().searchResults).toHaveLength(0);
    });
  });

  describe('toggleSection', () => {
    it('should toggle section expanded state', () => {
      useMemoryStore.setState({ expandedSections: { 'section-1': true } });

      useMemoryStore.getState().toggleSection('section-1');
      expect(useMemoryStore.getState().expandedSections['section-1']).toBe(false);

      useMemoryStore.getState().toggleSection('section-1');
      expect(useMemoryStore.getState().expandedSections['section-1']).toBe(true);
    });
  });

  describe('expandAllSections / collapseAllSections', () => {
    it('should expand all sections', async () => {
      const mockData = createMockMemoryData({
        memory: {
          ...createMockMemoryData().memory,
          content: '# S1\n# S2',
          sections: [
            { id: 's1', content: '', startLine: 0, endLine: 0, charCount: 0 },
            { id: 's2', content: '', startLine: 1, endLine: 1, charCount: 0 },
          ],
        },
        user_profile: {
          ...createMockMemoryData().user_profile,
          sections: [{ id: 'p1', content: '', startLine: 0, endLine: 0, charCount: 0 }],
        },
      });
      vi.mocked(memoryApi.getMemory).mockResolvedValue(mockData);
      await useMemoryStore.getState().fetchMemory();

      useMemoryStore.getState().collapseAllSections();
      useMemoryStore.getState().expandAllSections();

      const { expandedSections } = useMemoryStore.getState();
      Object.values(expandedSections).forEach(expanded => {
        expect(expanded).toBe(true);
      });
    });

    it('should collapse all sections', async () => {
      const mockData = createMockMemoryData({
        memory: {
          ...createMockMemoryData().memory,
          sections: [
            { id: 's1', content: '', startLine: 0, endLine: 0, charCount: 0 },
            { id: 's2', content: '', startLine: 1, endLine: 1, charCount: 0 },
          ],
        },
        user_profile: {
          ...createMockMemoryData().user_profile,
          sections: [{ id: 'p1', content: '', startLine: 0, endLine: 0, charCount: 0 }],
        },
      });
      vi.mocked(memoryApi.getMemory).mockResolvedValue(mockData);
      await useMemoryStore.getState().fetchMemory();

      useMemoryStore.getState().collapseAllSections();

      const { expandedSections } = useMemoryStore.getState();
      Object.values(expandedSections).forEach(expanded => {
        expect(expanded).toBe(false);
      });
    });
  });

  describe('clearError', () => {
    it('should clear both error and saveError', () => {
      useMemoryStore.setState({ error: 'Error 1', saveError: 'Error 2' });

      useMemoryStore.getState().clearError();

      const state = useMemoryStore.getState();
      expect(state.error).toBeNull();
      expect(state.saveError).toBeNull();
    });
  });
});
