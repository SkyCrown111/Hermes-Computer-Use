import { create } from 'zustand';
import type {
  KanbanBoard,
  KanbanBoardInfo,
  KanbanTaskDetail,
  KanbanStats,
  KanbanFilters,
  CreateKanbanBoardParams,
  CreateKanbanTaskParams,
  SetKanbanBoardArchivedParams,
  UpdateKanbanBoardParams,
  UpdateKanbanTaskParams,
  AddKanbanCommentParams,
} from '../types/kanban';
import * as kanbanApi from '../services/kanbanApi';
import { getErrorMessage } from '../lib/errorUtils';
import { logger } from '../lib/logger';

interface KanbanState {
  board: KanbanBoard;
  boards: KanbanBoardInfo[];
  currentBoard: string | null;
  selectedTask: KanbanTaskDetail | null;
  stats: KanbanStats;
  tenants: string[];
  loading: boolean;
  loadingDetail: boolean;
  error: string | null;
  filters: KanbanFilters;

  fetchBoard: () => Promise<void>;
  fetchBoards: () => Promise<void>;
  fetchTask: (taskId: string) => Promise<void>;
  fetchStats: () => Promise<void>;
  fetchTenants: () => Promise<void>;
  switchBoard: (slug: string) => Promise<boolean>;
  createBoard: (params: CreateKanbanBoardParams, switchAfterCreate?: boolean) => Promise<boolean>;
  updateBoard: (params: UpdateKanbanBoardParams) => Promise<boolean>;
  setBoardArchived: (params: SetKanbanBoardArchivedParams) => Promise<boolean>;
  createTask: (params: CreateKanbanTaskParams) => Promise<boolean>;
  updateTask: (taskId: string, params: UpdateKanbanTaskParams) => Promise<boolean>;
  deleteTask: (taskId: string) => Promise<boolean>;
  moveTask: (taskId: string, status: KanbanTaskDetail['status']) => Promise<boolean>;
  addComment: (params: AddKanbanCommentParams) => Promise<boolean>;
  setFilters: (filters: Partial<KanbanFilters>) => void;
  clearSelectedTask: () => void;
  clearError: () => void;
}

export const useKanbanStore = create<KanbanState>((set, get) => ({
  board: {},
  boards: [],
  currentBoard: null,
  selectedTask: null,
  stats: { total: 0, triage: 0, todo: 0, ready: 0, running: 0, blocked: 0, done: 0, archived: 0 },
  tenants: [],
  loading: false,
  loadingDetail: false,
  error: null,
  filters: { board: null, tenant: null, showArchived: false },

  fetchBoard: async () => {
    set({ loading: true, error: null });
    try {
      const { filters } = get();
      const board = await kanbanApi.getKanbanBoard(filters.tenant ?? undefined, filters.showArchived);
      set({ board, loading: false });
    } catch (err) {
      set({ error: getErrorMessage(err), loading: false });
    }
  },

  fetchBoards: async () => {
    try {
      const boards = await kanbanApi.listKanbanBoards(true);
      const currentBoard = await kanbanApi.getCurrentKanbanBoard();
      set(state => ({
        boards,
        currentBoard,
        filters: { ...state.filters, board: currentBoard },
      }));
    } catch (err) {
      const message = getErrorMessage(err);
      logger.error('[KanbanStore] fetchBoards failed:', err);
      set({ error: message });
    }
  },

  fetchTask: async (taskId: string) => {
    set({ loadingDetail: true, error: null, selectedTask: null });
    try {
      const task = await kanbanApi.getKanbanTask(taskId);
      set({ selectedTask: task, loadingDetail: false });
    } catch (err) {
      set({ error: getErrorMessage(err), loadingDetail: false, selectedTask: null });
    }
  },

  fetchStats: async () => {
    set({ error: null });
    try {
      const { filters } = get();
      const stats = await kanbanApi.getKanbanStats(filters.tenant ?? undefined, filters.showArchived);
      set({ stats });
    } catch (err) {
      const message = getErrorMessage(err);
      logger.error('[KanbanStore] fetchStats failed:', err);
      set({ error: message });
    }
  },

  fetchTenants: async () => {
    try {
      const { filters } = get();
      const tenants = await kanbanApi.getKanbanTenants(filters.showArchived);
      set({ tenants });
    } catch (err) {
      const message = getErrorMessage(err);
      logger.error('[KanbanStore] fetchTenants failed:', err);
      set({ error: message });
    }
  },

  switchBoard: async (slug: string) => {
    set({ error: null });
    try {
      await kanbanApi.switchKanbanBoard(slug);
      set(state => ({
        currentBoard: slug,
        filters: { ...state.filters, board: slug, tenant: null },
      }));
      await get().fetchBoards();
      await get().fetchBoard();
      await get().fetchStats();
      await get().fetchTenants();
      if (get().selectedTask) {
        set({ selectedTask: null });
      }
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  createBoard: async (params: CreateKanbanBoardParams, switchAfterCreate = true) => {
    set({ error: null });
    try {
      await kanbanApi.createKanbanBoard(params);
      await get().fetchBoards();
      const nextBoard = params.slug.trim();
      if (switchAfterCreate && nextBoard) {
        set(state => ({
          currentBoard: nextBoard,
          filters: { ...state.filters, board: nextBoard, tenant: null },
        }));
      }
      await get().fetchBoard();
      await get().fetchStats();
      await get().fetchTenants();
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  updateBoard: async (params: UpdateKanbanBoardParams) => {
    set({ error: null });
    try {
      await kanbanApi.updateKanbanBoard(params);
      await get().fetchBoards();
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  setBoardArchived: async (params: SetKanbanBoardArchivedParams) => {
    set({ error: null });
    try {
      const result = await kanbanApi.setKanbanBoardArchived(params);
      await get().fetchBoards();
      const nextBoard = result.current_board || get().currentBoard || 'default';
      set(state => ({
        currentBoard: nextBoard,
        filters: { ...state.filters, board: nextBoard, tenant: null },
      }));
      await get().fetchBoard();
      await get().fetchStats();
      await get().fetchTenants();
      if (get().selectedTask) {
        set({ selectedTask: null });
      }
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  createTask: async (params: CreateKanbanTaskParams) => {
    set({ error: null });
    try {
      await kanbanApi.createKanbanTask(params);
      await get().fetchBoard();
      await get().fetchStats();
      await get().fetchTenants();
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  updateTask: async (taskId: string, params: UpdateKanbanTaskParams) => {
    set({ error: null });
    try {
      await kanbanApi.updateKanbanTask(taskId, params);
      await get().fetchBoard();
      await get().fetchStats();
      await get().fetchTenants();
      if (get().selectedTask?.id === taskId) {
        await get().fetchTask(taskId);
      }
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  deleteTask: async (taskId: string) => {
    set({ error: null });
    try {
      await kanbanApi.deleteKanbanTask(taskId);
      if (get().selectedTask?.id === taskId) {
        set({ selectedTask: null });
      }
      await get().fetchBoard();
      await get().fetchStats();
      await get().fetchTenants();
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  moveTask: async (taskId: string, status: KanbanTaskDetail['status']) => {
    set({ error: null });
    try {
      await kanbanApi.moveKanbanTask({ task_id: taskId, status });
      await get().fetchBoard();
      await get().fetchStats();
      if (get().selectedTask?.id === taskId) {
        await get().fetchTask(taskId);
      }
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  addComment: async (params: AddKanbanCommentParams) => {
    set({ error: null });
    try {
      await kanbanApi.addKanbanComment(params);
      await get().fetchBoard();
      await get().fetchStats();
      if (get().selectedTask?.id === params.task_id) {
        await get().fetchTask(params.task_id);
      }
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  setFilters: (filters: Partial<KanbanFilters>) => {
    set({ filters: { ...get().filters, ...filters } });
  },

  clearSelectedTask: () => {
    set({ selectedTask: null });
  },

  clearError: () => {
    set({ error: null });
  },
}));
