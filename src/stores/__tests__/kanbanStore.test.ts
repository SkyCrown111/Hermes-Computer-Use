import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useKanbanStore } from '../kanbanStore';
import type { KanbanBoardInfo, KanbanStats } from '../../types/kanban';

vi.mock('../../services/kanbanApi', () => ({
  listKanbanBoards: vi.fn(),
  getCurrentKanbanBoard: vi.fn(),
  switchKanbanBoard: vi.fn(),
  createKanbanBoard: vi.fn(),
  updateKanbanBoard: vi.fn(),
  setKanbanBoardArchived: vi.fn(),
  getKanbanBoard: vi.fn(),
  getKanbanStats: vi.fn(),
  getKanbanTenants: vi.fn(),
  getKanbanTask: vi.fn(),
  createKanbanTask: vi.fn(),
  updateKanbanTask: vi.fn(),
  deleteKanbanTask: vi.fn(),
  moveKanbanTask: vi.fn(),
  addKanbanComment: vi.fn(),
  addKanbanLink: vi.fn(),
  removeKanbanLink: vi.fn(),
}));

import * as kanbanApi from '../../services/kanbanApi';

const createBoardInfo = (overrides: Partial<KanbanBoardInfo> = {}): KanbanBoardInfo => ({
  slug: 'default',
  name: 'Default',
  description: 'Shared default board',
  icon: 'KB',
  color: '#0a84ff',
  archived: false,
  is_current: true,
  ...overrides,
});

const emptyStats: KanbanStats = {
  total: 0,
  triage: 0,
  todo: 0,
  ready: 0,
  running: 0,
  blocked: 0,
  done: 0,
  archived: 0,
};

describe('KanbanStore', () => {
  beforeEach(() => {
    useKanbanStore.setState({
      board: {},
      boards: [],
      currentBoard: null,
      selectedTask: null,
      stats: emptyStats,
      tenants: [],
      loading: false,
      loadingDetail: false,
      error: null,
      filters: { board: null, tenant: null, showArchived: false },
    });
    vi.clearAllMocks();
    vi.mocked(kanbanApi.getKanbanBoard).mockResolvedValue({});
    vi.mocked(kanbanApi.getKanbanStats).mockResolvedValue(emptyStats);
    vi.mocked(kanbanApi.getKanbanTenants).mockResolvedValue([]);
  });

  it('fetchBoards loads board metadata including icon and color', async () => {
    const boards = [
      createBoardInfo(),
      createBoardInfo({ slug: 'ui-refresh', name: 'UI Refresh', icon: 'UI', color: '#bf5af2', is_current: false }),
    ];
    vi.mocked(kanbanApi.listKanbanBoards).mockResolvedValue(boards);
    vi.mocked(kanbanApi.getCurrentKanbanBoard).mockResolvedValue('ui-refresh');

    await useKanbanStore.getState().fetchBoards();

    const state = useKanbanStore.getState();
    expect(state.boards).toEqual(boards);
    expect(state.currentBoard).toBe('ui-refresh');
    expect(state.filters.board).toBe('ui-refresh');
  });

  it('createBoard switches state to the new board and refreshes data', async () => {
    vi.mocked(kanbanApi.createKanbanBoard).mockResolvedValue({ ok: true, slug: 'frontend-platform' });
    vi.mocked(kanbanApi.listKanbanBoards).mockResolvedValue([
      createBoardInfo({ is_current: false }),
      createBoardInfo({
        slug: 'frontend-platform',
        name: 'Frontend Platform',
        description: 'UI ownership',
        icon: 'FE',
        color: '#30d158',
        is_current: true,
      }),
    ]);
    vi.mocked(kanbanApi.getCurrentKanbanBoard).mockResolvedValue('frontend-platform');

    const ok = await useKanbanStore.getState().createBoard({
      slug: 'frontend-platform',
      name: 'Frontend Platform',
      icon: 'FE',
      color: '#30d158',
    });

    const state = useKanbanStore.getState();
    expect(ok).toBe(true);
    expect(state.currentBoard).toBe('frontend-platform');
    expect(state.filters.board).toBe('frontend-platform');
    expect(kanbanApi.createKanbanBoard).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'frontend-platform',
      icon: 'FE',
      color: '#30d158',
    }));
  });

  it('setBoardArchived falls back to default when the current board is archived', async () => {
    useKanbanStore.setState({
      currentBoard: 'ui-refresh',
      filters: { board: 'ui-refresh', tenant: 'acme', showArchived: false },
      boards: [
        createBoardInfo({ is_current: false }),
        createBoardInfo({ slug: 'ui-refresh', name: 'UI Refresh', is_current: true }),
      ],
    });
    vi.mocked(kanbanApi.setKanbanBoardArchived).mockResolvedValue({
      ok: true,
      slug: 'ui-refresh',
      current_board: 'default',
    });
    vi.mocked(kanbanApi.listKanbanBoards).mockResolvedValue([
      createBoardInfo({ is_current: true }),
      createBoardInfo({ slug: 'ui-refresh', name: 'UI Refresh', archived: true, is_current: false }),
    ]);
    vi.mocked(kanbanApi.getCurrentKanbanBoard).mockResolvedValue('default');

    const ok = await useKanbanStore.getState().setBoardArchived({
      slug: 'ui-refresh',
      archived: true,
    });

    const state = useKanbanStore.getState();
    expect(ok).toBe(true);
    expect(state.currentBoard).toBe('default');
    expect(state.filters.board).toBe('default');
    expect(state.filters.tenant).toBeNull();
  });
});
