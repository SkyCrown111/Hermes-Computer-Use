// Files Store Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useFilesStore } from '../filesStore';
import type { DirectoryContent, FileContent, FileInfo, FileEditState } from '../../types/files';

// Mock the files API
vi.mock('../../services/filesApi', () => ({
  filesApi: {
    getDirectory: vi.fn(),
    readFile: vi.fn(),
    updateFile: vi.fn(),
    createFile: vi.fn(),
    deleteFile: vi.fn(),
    renameFile: vi.fn(),
    moveFile: vi.fn(),
    copyFile: vi.fn(),
    batchCopy: vi.fn(),
    batchMove: vi.fn(),
    batchDelete: vi.fn(),
    searchFiles: vi.fn(),
    getFileTree: vi.fn(),
    getFavoriteFiles: vi.fn(),
    getRecentFiles: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
  },
}));

import { filesApi } from '../../services/filesApi';

// Helper to create valid mock FileInfo
const createMockFileInfo = (overrides: Partial<FileInfo> = {}): FileInfo => ({
  name: 'file.txt',
  path: '/file.txt',
  type: 'file',
  size: 100,
  modified: '',
  created: '',
  isHidden: false,
  ...overrides,
});

// Helper to create valid mock DirectoryContent
const createMockDirectoryContent = (overrides: Partial<DirectoryContent> = {}): DirectoryContent => ({
  path: '/',
  files: [],
  totalFiles: 0,
  totalDirectories: 0,
  ...overrides,
});

// Helper to create valid mock FileContent
const createMockFileContent = (overrides: Partial<FileContent> = {}): FileContent => ({
  path: '/file.txt',
  content: 'Hello World',
  encoding: 'utf-8',
  size: 11,
  lines: 1,
  language: 'text',
  ...overrides,
});

describe('FilesStore', () => {
  beforeEach(() => {
    useFilesStore.setState({
      currentPath: '/',
      directoryContent: null,
      isLoadingDirectory: false,
      currentFile: null,
      isLoadingFile: false,
      editState: null,
      fileTree: null,
      expandedPaths: new Set(),
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      favoriteFiles: [],
      recentFiles: [],
      uploads: [],
      selectedFiles: new Set(),
      clipboardFiles: new Set(),
      clipboardOperation: null,
      error: null,
    });
    vi.clearAllMocks();
  });

  describe('navigateTo', () => {
    it('should navigate to directory', async () => {
      const mockContent = createMockDirectoryContent({
        path: '/home/user',
        files: [createMockFileInfo({ name: 'file.txt', path: '/home/user/file.txt' })],
        totalFiles: 1,
      });
      vi.mocked(filesApi.getDirectory).mockResolvedValue(mockContent);

      await useFilesStore.getState().navigateTo('/home/user');

      const state = useFilesStore.getState();
      expect(state.currentPath).toBe('/home/user');
      expect(state.directoryContent).toEqual(mockContent);
    });

    it('should set error on navigate failure', async () => {
      vi.mocked(filesApi.getDirectory).mockRejectedValue(new Error('Access denied'));

      await useFilesStore.getState().navigateTo('/root');

      expect(useFilesStore.getState().error).toBe('Access denied');
    });
  });

  describe('refreshDirectory', () => {
    it('should refresh current directory', async () => {
      vi.mocked(filesApi.getDirectory).mockResolvedValue(createMockDirectoryContent());
      useFilesStore.setState({ currentPath: '/home' });

      await useFilesStore.getState().refreshDirectory();

      expect(filesApi.getDirectory).toHaveBeenCalledWith({ path: '/home' });
    });
  });

  describe('goUp', () => {
    it('should navigate to parent directory', async () => {
      vi.mocked(filesApi.getDirectory).mockResolvedValue(createMockDirectoryContent());
      useFilesStore.setState({ currentPath: '/home/user' });

      await useFilesStore.getState().goUp();

      expect(useFilesStore.getState().currentPath).toBe('/home');
    });

    it('should not navigate up from root', async () => {
      useFilesStore.setState({ currentPath: '/' });

      await useFilesStore.getState().goUp();

      expect(useFilesStore.getState().currentPath).toBe('/');
    });
  });

  describe('openFile', () => {
    it('should open file for viewing', async () => {
      const mockFile = createMockFileContent();
      vi.mocked(filesApi.readFile).mockResolvedValue(mockFile);

      await useFilesStore.getState().openFile('/home/file.txt');

      expect(useFilesStore.getState().currentFile).toEqual(mockFile);
    });
  });

  describe('closeFile', () => {
    it('should close current file', () => {
      useFilesStore.setState({ currentFile: createMockFileContent(), editState: { path: '/test', content: '', originalContent: '', isDirty: false, isSaving: false } satisfies FileEditState });

      useFilesStore.getState().closeFile();

      expect(useFilesStore.getState().currentFile).toBeNull();
      expect(useFilesStore.getState().editState).toBeNull();
    });
  });

  describe('startEdit', () => {
    it('should start editing current file', () => {
      useFilesStore.setState({
        currentFile: createMockFileContent({ content: 'Original' }),
      });

      useFilesStore.getState().startEdit();

      const state = useFilesStore.getState();
      expect(state.editState).not.toBeNull();
      expect(state.editState?.content).toBe('Original');
      expect(state.editState?.isDirty).toBe(false);
    });
  });

  describe('cancelEdit', () => {
    it('should cancel editing', () => {
      useFilesStore.setState({ editState: { path: '/test', content: '', originalContent: '', isDirty: false, isSaving: false } satisfies FileEditState });

      useFilesStore.getState().cancelEdit();

      expect(useFilesStore.getState().editState).toBeNull();
    });
  });

  describe('updateEditContent', () => {
    it('should update content and mark as dirty', () => {
      useFilesStore.setState({
        editState: {
          path: '/file.txt',
          content: 'Original',
          originalContent: 'Original',
          isDirty: false,
          isSaving: false,
          language: 'text',
        },
      });

      useFilesStore.getState().updateEditContent('Modified');

      const state = useFilesStore.getState();
      expect(state.editState?.content).toBe('Modified');
      expect(state.editState?.isDirty).toBe(true);
    });
  });

  describe('saveFile', () => {
    it('should save file and clear dirty flag', async () => {
      vi.mocked(filesApi.updateFile).mockResolvedValue({ success: true, message: '' });
      vi.mocked(filesApi.getDirectory).mockResolvedValue(createMockDirectoryContent());
      useFilesStore.setState({
        editState: {
          path: '/file.txt',
          content: 'Modified',
          originalContent: 'Original',
          isDirty: true,
          isSaving: false,
          language: 'text',
        },
      });

      const result = await useFilesStore.getState().saveFile();

      expect(result).toBe(true);
      expect(useFilesStore.getState().editState?.isDirty).toBe(false);
    });

    it('should not save if not dirty', async () => {
      useFilesStore.setState({
        editState: {
          path: '/file.txt',
          content: 'Original',
          originalContent: 'Original',
          isDirty: false,
          isSaving: false,
          language: 'text',
        },
      });

      const result = await useFilesStore.getState().saveFile();

      expect(result).toBe(false);
      expect(filesApi.updateFile).not.toHaveBeenCalled();
    });
  });

  describe('createFile', () => {
    it('should create file and refresh directory', async () => {
      vi.mocked(filesApi.createFile).mockResolvedValue({ success: true, message: '' });
      vi.mocked(filesApi.getDirectory).mockResolvedValue(createMockDirectoryContent());
      useFilesStore.setState({ currentPath: '/home' });

      const result = await useFilesStore.getState().createFile('new.txt', 'file', 'content');

      expect(result).toBe(true);
      expect(filesApi.createFile).toHaveBeenCalledWith({
        path: '/home/new.txt',
        type: 'file',
        content: 'content',
      });
    });
  });

  describe('deleteFile', () => {
    it('should delete file', async () => {
      vi.mocked(filesApi.deleteFile).mockResolvedValue({ success: true, message: '' });
      vi.mocked(filesApi.getDirectory).mockResolvedValue(createMockDirectoryContent());

      const result = await useFilesStore.getState().deleteFile('/file.txt');

      expect(result).toBe(true);
    });
  });

  describe('selectFile', () => {
    it('should select single file', () => {
      useFilesStore.getState().selectFile('/file.txt');

      expect(useFilesStore.getState().selectedFiles.has('/file.txt')).toBe(true);
    });

    it('should toggle selection in multi mode', () => {
      useFilesStore.getState().selectFile('/file1.txt', true);
      useFilesStore.getState().selectFile('/file2.txt', true);
      useFilesStore.getState().selectFile('/file1.txt', true);

      const selected = useFilesStore.getState().selectedFiles;
      expect(selected.has('/file1.txt')).toBe(false);
      expect(selected.has('/file2.txt')).toBe(true);
    });
  });

  describe('selectAll', () => {
    it('should select all files in directory', () => {
      useFilesStore.setState({
        directoryContent: createMockDirectoryContent({
          files: [
            createMockFileInfo({ name: 'a.txt', path: '/a.txt' }),
            createMockFileInfo({ name: 'b.txt', path: '/b.txt' }),
          ],
          totalFiles: 2,
        }),
      });

      useFilesStore.getState().selectAll();

      expect(useFilesStore.getState().selectedFiles.size).toBe(2);
    });
  });

  describe('deselectAll', () => {
    it('should deselect all files', () => {
      useFilesStore.setState({ selectedFiles: new Set(['/a.txt', '/b.txt']) });

      useFilesStore.getState().deselectAll();

      expect(useFilesStore.getState().selectedFiles.size).toBe(0);
    });
  });

  describe('copySelected', () => {
    it('should copy selected files to clipboard', () => {
      useFilesStore.setState({ selectedFiles: new Set(['/a.txt', '/b.txt']) });

      useFilesStore.getState().copySelected();

      const state = useFilesStore.getState();
      expect(state.clipboardOperation).toBe('copy');
      expect(state.clipboardFiles.size).toBe(2);
    });
  });

  describe('cutSelected', () => {
    it('should cut selected files to clipboard', () => {
      useFilesStore.setState({ selectedFiles: new Set(['/a.txt']) });

      useFilesStore.getState().cutSelected();

      const state = useFilesStore.getState();
      expect(state.clipboardOperation).toBe('cut');
      expect(state.clipboardFiles.has('/a.txt')).toBe(true);
    });
  });

  describe('searchFiles', () => {
    it('should search files', async () => {
      const mockResults = [
        { path: '/file.txt', fileName: 'file.txt', type: 'file' as const },
      ];
      vi.mocked(filesApi.searchFiles).mockResolvedValue(mockResults);

      await useFilesStore.getState().searchFiles('test');

      const state = useFilesStore.getState();
      expect(state.searchQuery).toBe('test');
      expect(state.searchResults).toEqual(mockResults);
    });

    it('should clear search for empty query', async () => {
      useFilesStore.setState({ searchResults: [{ path: 'test', fileName: 'test', type: 'file' }] });

      await useFilesStore.getState().searchFiles('   ');

      expect(useFilesStore.getState().searchResults).toHaveLength(0);
    });
  });

  describe('clearSearch', () => {
    it('should clear search state', () => {
      useFilesStore.setState({ searchQuery: 'test', searchResults: [{ path: 'test', fileName: 'test', type: 'file' }] });

      useFilesStore.getState().clearSearch();

      const state = useFilesStore.getState();
      expect(state.searchQuery).toBe('');
      expect(state.searchResults).toHaveLength(0);
    });
  });

  describe('clearError', () => {
    it('should clear error', () => {
      useFilesStore.setState({ error: 'Error' });
      useFilesStore.getState().clearError();
      expect(useFilesStore.getState().error).toBeNull();
    });
  });
});
