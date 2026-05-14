import React, { useCallback, useEffect, useState } from 'react';
import { useKanbanStore } from '../../stores/kanbanStore';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../stores/toastStore';
import { TaskDrawer } from './TaskDrawer';
import type {
  CreateKanbanTaskParams,
  KanbanBoardInfo,
  KanbanPriority,
  KanbanStatus,
  KanbanTask,
} from '../../types/kanban';
import './KanbanPage.css';

const COLUMNS: KanbanStatus[] = ['triage', 'todo', 'ready', 'running', 'blocked', 'done'];
const PRIORITIES: KanbanPriority[] = ['low', 'medium', 'high', 'critical'];
const BOARD_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#ff453a', '#bf5af2', '#64d2ff', '#8e8e93', '#f5dd4b'];
const DEFAULT_BOARD_COLOR = '#0a84ff';
const DEFAULT_BOARD_ICON = 'KB';

type BoardFormState = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
};

const createEmptyBoardForm = (): BoardFormState => ({
  slug: '',
  name: '',
  description: '',
  icon: DEFAULT_BOARD_ICON,
  color: DEFAULT_BOARD_COLOR,
});

export const KanbanPage: React.FC = () => {
  const { t } = useTranslation();
  const board = useKanbanStore(s => s.board);
  const boards = useKanbanStore(s => s.boards);
  const currentBoard = useKanbanStore(s => s.currentBoard);
  const stats = useKanbanStore(s => s.stats) ?? { total: 0, triage: 0, todo: 0, ready: 0, running: 0, blocked: 0, done: 0, archived: 0 };
  const tenants = useKanbanStore(s => s.tenants);
  const loading = useKanbanStore(s => s.loading);
  const error = useKanbanStore(s => s.error);
  const filters = useKanbanStore(s => s.filters);
  const fetchBoard = useKanbanStore(s => s.fetchBoard);
  const fetchBoards = useKanbanStore(s => s.fetchBoards);
  const fetchStats = useKanbanStore(s => s.fetchStats);
  const fetchTenants = useKanbanStore(s => s.fetchTenants);
  const switchBoard = useKanbanStore(s => s.switchBoard);
  const createBoard = useKanbanStore(s => s.createBoard);
  const updateBoard = useKanbanStore(s => s.updateBoard);
  const setBoardArchived = useKanbanStore(s => s.setBoardArchived);
  const createTask = useKanbanStore(s => s.createTask);
  const setFilters = useKanbanStore(s => s.setFilters);

  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [showEditBoard, setShowEditBoard] = useState(false);
  const [showBoardManager, setShowBoardManager] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [boardManagerSelection, setBoardManagerSelection] = useState<string | null>(null);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState<KanbanPriority>('medium');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskTenant, setTaskTenant] = useState('');
  const [createBoardForm, setCreateBoardForm] = useState<BoardFormState>(createEmptyBoardForm);
  const [editBoardForm, setEditBoardForm] = useState<BoardFormState>(createEmptyBoardForm);

  const activeBoard = boards.find(item => item.slug === currentBoard) || null;
  const selectedBoard = boards.find(item => item.slug === (boardManagerSelection || currentBoard || '')) || activeBoard;

  useEffect(() => {
    void fetchBoards();
  }, [fetchBoards]);

  useEffect(() => {
    void fetchBoard();
    void fetchStats();
    void fetchTenants();
  }, [fetchBoard, fetchStats, fetchTenants, filters.tenant, filters.showArchived, filters.board]);

  useEffect(() => {
    if (!boardManagerSelection && currentBoard) {
      setBoardManagerSelection(currentBoard);
    }
  }, [boardManagerSelection, currentBoard]);

  const handleFilterTenant = useCallback((tenant: string) => {
    setFilters({ tenant: tenant || null });
  }, [setFilters]);

  const handleToggleArchived = useCallback(() => {
    const next = !showArchived;
    setShowArchived(next);
    setFilters({ showArchived: next });
  }, [showArchived, setFilters]);

  const handleBoardChange = useCallback(async (slug: string) => {
    if (!slug || slug === currentBoard) return;
    const ok = await switchBoard(slug);
    if (ok) {
      setBoardManagerSelection(slug);
      return;
    }
    toast.error(t('kanban.boardSwitchFailed'));
  }, [currentBoard, switchBoard, t]);

  const handleCreateTask = async () => {
    if (!taskTitle.trim()) return;
    const params: CreateKanbanTaskParams = {
      title: taskTitle.trim(),
      description: taskDescription.trim() || undefined,
      priority: taskPriority,
      assignee: taskAssignee.trim() || undefined,
      tenant: taskTenant.trim() || undefined,
    };

    const ok = await createTask(params);
    if (!ok) {
      toast.error(t('kanban.createFailed'));
      return;
    }

    toast.success(t('kanban.taskCreated'));
    setShowCreateTask(false);
    setTaskTitle('');
    setTaskDescription('');
    setTaskPriority('medium');
    setTaskAssignee('');
    setTaskTenant('');
  };

  const openCreateBoard = useCallback(() => {
    setCreateBoardForm(createEmptyBoardForm());
    setShowCreateBoard(true);
  }, []);

  const openEditBoard = useCallback((boardInfo?: KanbanBoardInfo | null) => {
    const source = boardInfo || selectedBoard || activeBoard;
    if (!source) return;
    setBoardManagerSelection(source.slug);
    setEditBoardForm({
      slug: source.slug,
      name: source.name,
      description: source.description || '',
      icon: source.icon || DEFAULT_BOARD_ICON,
      color: source.color || DEFAULT_BOARD_COLOR,
    });
    setShowEditBoard(true);
  }, [activeBoard, selectedBoard]);

  const handleCreateBoard = async () => {
    const slug = createBoardForm.slug.trim();
    if (!slug) return;
    const ok = await createBoard({
      slug,
      name: createBoardForm.name.trim() || undefined,
      description: createBoardForm.description.trim() || undefined,
      icon: createBoardForm.icon.trim() || undefined,
      color: createBoardForm.color.trim() || undefined,
    });
    if (!ok) {
      toast.error(t('kanban.boardCreateFailed'));
      return;
    }
    setShowCreateBoard(false);
    setBoardManagerSelection(slug);
    toast.success(t('kanban.boardCreated'));
  };

  const handleUpdateBoard = async () => {
    if (!editBoardForm.slug) return;
    const ok = await updateBoard({
      slug: editBoardForm.slug,
      name: editBoardForm.name.trim() || editBoardForm.slug,
      description: editBoardForm.description.trim(),
      icon: editBoardForm.icon.trim() || undefined,
      color: editBoardForm.color.trim() || undefined,
    });
    if (!ok) {
      toast.error(t('kanban.boardUpdateFailed'));
      return;
    }
    setShowEditBoard(false);
    setBoardManagerSelection(editBoardForm.slug);
    toast.success(t('kanban.boardUpdated'));
  };

  const handleToggleBoardArchived = async (boardInfo?: KanbanBoardInfo | null) => {
    const target = boardInfo || selectedBoard || activeBoard;
    if (!target || target.slug === 'default') return;
    const nextArchived = !target.archived;
    const ok = await setBoardArchived({
      slug: target.slug,
      archived: nextArchived,
    });
    if (!ok) {
      toast.error(nextArchived ? t('kanban.boardArchiveFailed') : t('kanban.boardRestoreFailed'));
      return;
    }
    if (nextArchived && target.slug === boardManagerSelection) {
      setBoardManagerSelection('default');
    }
    toast.success(nextArchived ? t('kanban.boardArchived') : t('kanban.boardRestored'));
  };

  const handleCardClick = (taskId: string) => {
    setSelectedTaskId(taskId);
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedTaskId(null);
  };

  const columns = showArchived ? [...COLUMNS, 'archived' as KanbanStatus] : COLUMNS;

  return (
    <div className="kanban-page">
      <div className="kanban-stats">
        <div className="stat-card stat-card-info">
          <div className="stat-content">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">{t('kanban.total')}</span>
          </div>
        </div>
        <div className="stat-card stat-card-running">
          <div className="stat-content">
            <span className="stat-value">{stats.running}</span>
            <span className="stat-label">{t('kanban.status.running')}</span>
          </div>
        </div>
        <div className="stat-card stat-card-blocked">
          <div className="stat-content">
            <span className="stat-value">{stats.blocked}</span>
            <span className="stat-label">{t('kanban.status.blocked')}</span>
          </div>
        </div>
        <div className="stat-card stat-card-done">
          <div className="stat-content">
            <span className="stat-value">{stats.done}</span>
            <span className="stat-label">{t('kanban.status.done')}</span>
          </div>
        </div>
      </div>

      <div className="kanban-header">
        <div className="kanban-title-group">
          <h1 className="section-title">{t('kanban.title')}</h1>
          {activeBoard && (
            <div className="kanban-board-caption">
              <BoardAvatar board={activeBoard} />
              <span className="kanban-board-label">{t('kanban.currentBoard')}</span>
              <span className="kanban-board-name">{activeBoard.name}</span>
              {activeBoard.archived && <span className="kanban-board-badge">{t('kanban.status.archived')}</span>}
            </div>
          )}
          {activeBoard?.description && (
            <p className="kanban-board-description">{activeBoard.description}</p>
          )}
        </div>
        <div className="kanban-controls">
          <select
            className="kanban-filter-select"
            value={currentBoard || ''}
            onChange={e => void handleBoardChange(e.target.value)}
          >
            {(boards ?? []).map(item => (
              <option key={item.slug} value={item.slug}>
                {item.archived ? `${item.name} (${t('kanban.status.archived')})` : item.name}
              </option>
            ))}
          </select>
          <select
            className="kanban-filter-select"
            value={filters.tenant || ''}
            onChange={e => handleFilterTenant(e.target.value)}
          >
            <option value="">{t('kanban.allTenants')}</option>
            {(tenants ?? []).map(tn => <option key={tn} value={tn}>{tn}</option>)}
          </select>
          <label className="kanban-archived-toggle">
            <input type="checkbox" checked={showArchived} onChange={handleToggleArchived} />
            <span>{t('kanban.showArchived')}</span>
          </label>
          <button className="btn btn-secondary" onClick={openCreateBoard}>
            {t('kanban.createBoard')}
          </button>
          <button className="btn btn-secondary" onClick={() => setShowBoardManager(prev => !prev)}>
            {showBoardManager ? t('kanban.hideBoards') : t('kanban.manageBoards')}
          </button>
          <button className="btn btn-secondary" onClick={() => openEditBoard()} disabled={!activeBoard}>
            {t('kanban.editBoard')}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => void handleToggleBoardArchived()}
            disabled={!activeBoard || activeBoard.slug === 'default'}
          >
            {activeBoard?.archived ? t('kanban.restoreBoard') : t('kanban.archiveBoard')}
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateTask(true)}>
            {t('kanban.createTask')}
          </button>
        </div>
      </div>

      {showBoardManager && (
        <section className="board-manager">
          <div className="board-manager-header">
            <div>
              <h2 className="board-manager-title">{t('kanban.manageBoards')}</h2>
              <p className="board-manager-copy">{t('kanban.boardManagerHint')}</p>
            </div>
          </div>
          <div className="board-manager-list">
            {(boards ?? []).map(item => (
              <article
                key={item.slug}
                className={`board-row${item.slug === selectedBoard?.slug ? ' board-row-selected' : ''}${item.is_current ? ' board-row-current' : ''}`}
                onClick={() => setBoardManagerSelection(item.slug)}
              >
                <div className="board-row-main">
                  <BoardAvatar board={item} />
                  <div className="board-row-meta">
                    <div className="board-row-title">
                      <span>{item.name}</span>
                      {item.is_current && <span className="board-row-chip">{t('kanban.currentBoard')}</span>}
                      {item.archived && <span className="board-row-chip">{t('kanban.status.archived')}</span>}
                    </div>
                    <div className="board-row-slug">{item.slug}</div>
                    <div className="board-row-description">{item.description || t('kanban.noBoardDescription')}</div>
                  </div>
                </div>
                <div className="board-row-actions">
                  <button className="btn btn-secondary" onClick={() => void handleBoardChange(item.slug)} disabled={item.is_current}>
                    {t('kanban.switchBoard')}
                  </button>
                  <button className="btn btn-secondary" onClick={() => openEditBoard(item)}>
                    {t('kanban.editBoard')}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => void handleToggleBoardArchived(item)}
                    disabled={item.slug === 'default'}
                  >
                    {item.archived ? t('kanban.restoreBoard') : t('kanban.archiveBoard')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {error && (
        <div className="error-message">{error}</div>
      )}

      {loading ? (
        <div className="loading-container"><div className="loading-spinner" /></div>
      ) : (
        <div className="kanban-board">
          {columns.map(status => {
            const tasks = board?.[status] || [];
            return (
              <div key={status} className={`kanban-column column-${status}`}>
                <div className="column-header">
                  <span className={`column-status-dot status-dot-${status}`} />
                  <span className="column-title">{t(`kanban.status.${status}`)}</span>
                  <span className="column-count">{tasks.length}</span>
                </div>
                <div className="column-cards">
                  {tasks.length === 0 ? (
                    <div className="column-empty">{t('kanban.noTasks')}</div>
                  ) : (
                    tasks.map(task => <TaskCard key={task.id} task={task} onClick={handleCardClick} t={t} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateTask && (
        <div className="form-overlay" onClick={() => setShowCreateTask(false)}>
          <div className="form-modal" onClick={e => e.stopPropagation()}>
            <div className="form-header">
              <h2>{t('kanban.createTask')}</h2>
              <button className="close-button" onClick={() => setShowCreateTask(false)} aria-label={t('common.close')}>x</button>
            </div>
            <div className="form-content">
              <div className="form-field">
                <label className="field-label">{t('kanban.title')} *</label>
                <input className="kanban-input" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} />
              </div>
              <div className="form-field">
                <label className="field-label">{t('kanban.description')}</label>
                <textarea className="kanban-textarea" value={taskDescription} onChange={e => setTaskDescription(e.target.value)} rows={3} />
              </div>
              <div className="form-field">
                <label className="field-label">{t('kanban.priority')}</label>
                <select className="kanban-select" value={taskPriority} onChange={e => setTaskPriority(e.target.value as KanbanPriority)}>
                  {PRIORITIES.map(priority => <option key={priority} value={priority}>{t(`kanban.priority.${priority}`)}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="field-label">{t('kanban.assignee')}</label>
                <input className="kanban-input" value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)} />
              </div>
              <div className="form-field">
                <label className="field-label">{t('kanban.tenant')}</label>
                <input className="kanban-input" value={taskTenant} onChange={e => setTaskTenant(e.target.value)} />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreateTask(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleCreateTask} disabled={!taskTitle.trim()}>{t('kanban.createTask')}</button>
            </div>
          </div>
        </div>
      )}

      {showCreateBoard && (
        <BoardFormModal
          title={t('kanban.createBoard')}
          confirmLabel={t('common.create')}
          slugEditable
          form={createBoardForm}
          onClose={() => setShowCreateBoard(false)}
          onSubmit={handleCreateBoard}
          onChange={setCreateBoardForm}
          t={t}
        />
      )}

      {showEditBoard && (
        <BoardFormModal
          title={t('kanban.editBoard')}
          confirmLabel={t('common.save')}
          slugEditable={false}
          form={editBoardForm}
          onClose={() => setShowEditBoard(false)}
          onSubmit={handleUpdateBoard}
          onChange={setEditBoardForm}
          t={t}
        />
      )}

      <TaskDrawer taskId={selectedTaskId} open={drawerOpen} onClose={handleCloseDrawer} />
    </div>
  );
};

const BoardFormModal: React.FC<{
  title: string;
  confirmLabel: string;
  slugEditable: boolean;
  form: BoardFormState;
  onClose: () => void;
  onSubmit: () => void;
  onChange: React.Dispatch<React.SetStateAction<BoardFormState>>;
  t: (key: string) => string;
}> = ({ title, confirmLabel, slugEditable, form, onClose, onSubmit, onChange, t }) => (
  <div className="form-overlay" onClick={onClose}>
    <div className="form-modal" onClick={e => e.stopPropagation()}>
      <div className="form-header">
        <h2>{title}</h2>
        <button className="close-button" onClick={onClose} aria-label={t('common.close')}>x</button>
      </div>
      <div className="form-content">
        <div className="form-field">
          <label className="field-label">{t('kanban.boardSlug')}{slugEditable ? ' *' : ''}</label>
          <input
            className="kanban-input"
            value={form.slug}
            disabled={!slugEditable}
            onChange={e => onChange(prev => ({ ...prev, slug: e.target.value }))}
            placeholder="frontend-platform"
          />
        </div>
        <div className="form-field">
          <label className="field-label">{t('kanban.boardName')}</label>
          <input className="kanban-input" value={form.name} onChange={e => onChange(prev => ({ ...prev, name: e.target.value }))} />
        </div>
        <div className="form-field">
          <label className="field-label">{t('kanban.boardDescription')}</label>
          <textarea className="kanban-textarea" value={form.description} onChange={e => onChange(prev => ({ ...prev, description: e.target.value }))} rows={3} />
        </div>
        <div className="form-field">
          <label className="field-label">{t('kanban.boardIcon')}</label>
          <input className="kanban-input" value={form.icon} onChange={e => onChange(prev => ({ ...prev, icon: e.target.value }))} maxLength={4} />
        </div>
        <div className="form-field">
          <label className="field-label">{t('kanban.boardColor')}</label>
          <div className="board-color-grid">
            {BOARD_COLORS.map(color => (
              <button
                key={color}
                type="button"
                className={`board-color-swatch${form.color === color ? ' active' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => onChange(prev => ({ ...prev, color }))}
                aria-label={color}
              />
            ))}
          </div>
          <input className="kanban-input" value={form.color} onChange={e => onChange(prev => ({ ...prev, color: e.target.value }))} />
        </div>
      </div>
      <div className="form-actions">
        <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn btn-primary" onClick={onSubmit} disabled={slugEditable && !form.slug.trim()}>{confirmLabel}</button>
      </div>
    </div>
  </div>
);

const BoardAvatar: React.FC<{ board: KanbanBoardInfo }> = ({ board }) => {
  const color = board.color || DEFAULT_BOARD_COLOR;
  const icon = (board.icon || board.name || board.slug || DEFAULT_BOARD_ICON).slice(0, 4);
  return (
    <span className="board-avatar" style={{ backgroundColor: color }}>
      {icon}
    </span>
  );
};

const TaskCard: React.FC<{ task: KanbanTask; onClick: (id: string) => void; t: (key: string) => string }> = ({ task, onClick, t }) => (
  <div className="kanban-card" onClick={() => onClick(task.id)}>
    <div className="card-title-row">
      <span className="card-title">{task.title}</span>
      <span className={`priority-indicator priority-${task.priority}`} title={t(`kanban.priority.${task.priority}`)} />
    </div>
    {task.assignee && <div className="card-assignee">{task.assignee}</div>}
    {task.parent_id && (
      <div className="card-parent-badge" title={t('kanban.parentTask')}>
        # {task.parent_id.slice(0, 8)}
      </div>
    )}
    <div className="card-footer">
      {task.comments_count > 0 && <span className="card-meta">C {task.comments_count}</span>}
      {task.links_count > 0 && <span className="card-meta">L {task.links_count}</span>}
      {task.due_date && <span className="card-meta card-due">Due {task.due_date}</span>}
      {task.status === 'blocked' && <span className="card-warning" title={t('kanban.status.blocked')}>!</span>}
    </div>
  </div>
);
