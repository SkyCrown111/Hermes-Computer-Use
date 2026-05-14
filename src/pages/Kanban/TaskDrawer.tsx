import React, { useState, useEffect } from 'react';
import { useKanbanStore } from '../../stores/kanbanStore';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../stores/toastStore';
import type { KanbanStatus, KanbanPriority } from '../../types/kanban';

interface TaskDrawerProps {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
}

const STATUS_OPTIONS: KanbanStatus[] = ['triage', 'todo', 'ready', 'blocked', 'done', 'archived'];
const PRIORITY_OPTIONS: KanbanPriority[] = ['low', 'medium', 'high', 'critical'];

export const TaskDrawer: React.FC<TaskDrawerProps> = ({ taskId, open, onClose }) => {
  const { t } = useTranslation();
  const selectedTask = useKanbanStore(s => s.selectedTask);
  const loadingDetail = useKanbanStore(s => s.loadingDetail);
  const fetchTask = useKanbanStore(s => s.fetchTask);
  const updateTask = useKanbanStore(s => s.updateTask);
  const deleteTask = useKanbanStore(s => s.deleteTask);
  const moveTask = useKanbanStore(s => s.moveTask);
  const addComment = useKanbanStore(s => s.addComment);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState<KanbanPriority>('medium');
  const [editAssignee, setEditAssignee] = useState('');
  const [commentText, setCommentText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const emptyValue = t('common.noData');

  useEffect(() => {
    if (taskId && open) {
      fetchTask(taskId);
      setEditing(false);
      setConfirmDelete(false);
    }
  }, [taskId, open, fetchTask]);

  useEffect(() => {
    if (selectedTask && editing) {
      setEditTitle(selectedTask.title);
      setEditDesc(selectedTask.description);
      setEditPriority(selectedTask.priority);
      setEditAssignee(selectedTask.assignee || '');
    }
  }, [selectedTask, editing]);

  if (!open || !taskId) return null;

  const handleSave = async () => {
    if (!selectedTask) return;
    const ok = await updateTask(selectedTask.id, {
      title: editTitle,
      description: editDesc,
      priority: editPriority,
      assignee: editAssignee || undefined,
    });
    if (ok) {
      toast.success(t('kanban.taskUpdated'));
      setEditing(false);
    } else {
      toast.error(t('kanban.updateFailed'));
    }
  };

  const handleDelete = async () => {
    if (!selectedTask) return;
    const ok = await deleteTask(selectedTask.id);
    if (ok) {
      toast.success(t('kanban.taskDeleted'));
      onClose();
    } else {
      toast.error(t('kanban.deleteFailed'));
    }
  };

  const handleMove = async (status: KanbanStatus) => {
    if (!selectedTask) return;
    const ok = await moveTask(selectedTask.id, status);
    if (ok) {
      toast.success(t('kanban.taskMoved'));
    } else {
      toast.error(t('kanban.updateFailed'));
    }
  };

  const handleAddComment = async () => {
    if (!selectedTask || !commentText.trim()) return;
    const ok = await addComment({ task_id: selectedTask.id, content: commentText.trim() });
    if (ok) {
      setCommentText('');
      toast.success(t('kanban.commentAdded'));
    } else {
      toast.error(t('kanban.updateFailed'));
    }
  };

  const statusLabel = (s: KanbanStatus) => t(`kanban.status.${s}`);
  const priorityLabel = (p: KanbanPriority) => t(`kanban.priority.${p}`);

  return (
    <div className="kanban-drawer-overlay" onClick={onClose}>
      <div className="kanban-drawer" onClick={e => e.stopPropagation()}>
        <div className="kanban-drawer-header">
          <h3>{selectedTask?.title || t('kanban.loading')}</h3>
          <button className="close-button" onClick={onClose} aria-label={t('common.close')}>x</button>
        </div>

        {loadingDetail ? (
          <div className="loading-container"><div className="loading-spinner" /></div>
        ) : selectedTask ? (
          <div className="kanban-drawer-body">
            <div className="drawer-section">
              <label className="field-label">{t('kanban.moveStatus')}</label>
              <div className="drawer-status-bar">
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s}
                    className={`status-move-btn status-move-${s} ${selectedTask.status === s ? 'active' : ''}`}
                    onClick={() => handleMove(s)}
                    disabled={selectedTask.status === s}
                  >
                    {statusLabel(s)}
                  </button>
                ))}
              </div>
            </div>

            <div className="drawer-section">
              {!editing ? (
                <div className="drawer-detail-grid">
                  <div className="detail-row">
                    <span className="detail-label">{t('kanban.moveStatus')}</span>
                    <span className="detail-value">{statusLabel(selectedTask.status)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{t('kanban.priority')}</span>
                    <span className={`priority-badge priority-${selectedTask.priority}`}>{priorityLabel(selectedTask.priority)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{t('kanban.assignee')}</span>
                    <span className="detail-value">{selectedTask.assignee || emptyValue}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{t('kanban.tenant')}</span>
                    <span className="detail-value">{selectedTask.tenant || emptyValue}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{t('kanban.createdAt')}</span>
                    <span className="detail-value">{new Date(selectedTask.created_at).toLocaleString()}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{t('kanban.updatedAt')}</span>
                    <span className="detail-value">{new Date(selectedTask.updated_at).toLocaleString()}</span>
                  </div>
                </div>
              ) : (
                <div className="drawer-edit-form">
                  <div className="form-field">
                    <label className="field-label">{t('kanban.title')}</label>
                    <input className="kanban-input" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                  </div>
                  <div className="form-field">
                    <label className="field-label">{t('kanban.description')}</label>
                    <textarea className="kanban-textarea" value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} />
                  </div>
                  <div className="form-field">
                    <label className="field-label">{t('kanban.priority')}</label>
                    <select className="kanban-select" value={editPriority} onChange={e => setEditPriority(e.target.value as KanbanPriority)}>
                      {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{priorityLabel(p)}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="field-label">{t('kanban.assignee')}</label>
                    <input className="kanban-input" value={editAssignee} onChange={e => setEditAssignee(e.target.value)} />
                  </div>
                  <div className="form-actions">
                    <button className="btn btn-secondary" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
                    <button className="btn btn-primary" onClick={handleSave}>{t('common.save')}</button>
                  </div>
                </div>
              )}
              {!editing && (
                <button className="btn btn-secondary" onClick={() => setEditing(true)} style={{ marginTop: 'var(--space-3)' }}>
                  {t('kanban.editTask')}
                </button>
              )}
            </div>

            {!editing && selectedTask.description && (
              <div className="drawer-section">
                <label className="field-label">{t('kanban.description')}</label>
                <p className="drawer-description">{selectedTask.description}</p>
              </div>
            )}

            {selectedTask.events && selectedTask.events.length > 0 && (
              <div className="drawer-section">
                <label className="field-label">{t('kanban.events')}</label>
                <div className="events-timeline">
                  {selectedTask.events.map(ev => (
                    <div key={ev.id} className="event-item">
                      <span className="event-action">{ev.action}</span>
                      <span className="event-detail">{ev.detail}</span>
                      <span className="event-time">{new Date(ev.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(selectedTask.parent_links.length > 0 || selectedTask.child_links.length > 0) && (
              <div className="drawer-section">
                <label className="field-label">{t('kanban.links')}</label>
                <div className="links-grid">
                  {selectedTask.parent_links.map(l => (
                    <div key={l.id} className="link-item">
                      <span className="link-relation">{l.relation}</span>
                      <span className="link-id">{l.parent_id}</span>
                    </div>
                  ))}
                  {selectedTask.child_links.map(l => (
                    <div key={l.id} className="link-item">
                      <span className="link-relation">{l.relation}</span>
                      <span className="link-id">{l.child_id}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="drawer-section">
              <label className="field-label">{t('kanban.comments')} ({selectedTask.comments?.length ?? 0})</label>
              <div className="comments-list">
                {selectedTask.comments?.map(c => (
                  <div key={c.id} className="comment-item">
                    <div className="comment-header">
                      <span className="comment-author">{c.author || 'Unknown'}</span>
                      <span className="comment-time">{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <p className="comment-text">{c.content}</p>
                  </div>
                ))}
              </div>
              <div className="comment-form">
                <textarea
                  className="kanban-textarea"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder={t('kanban.addCommentPlaceholder')}
                  rows={2}
                />
                <button className="btn btn-primary" onClick={handleAddComment} disabled={!commentText.trim()}>
                  {t('kanban.addComment')}
                </button>
              </div>
            </div>

            <div className="drawer-section drawer-danger-zone">
              {!confirmDelete ? (
                <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                  {t('kanban.deleteTask')}
                </button>
              ) : (
                <div className="confirm-delete">
                  <span>{t('kanban.confirmDelete')}</span>
                  <button className="btn btn-danger" onClick={handleDelete}>{t('common.confirm')}</button>
                  <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
