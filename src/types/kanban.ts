export type KanbanStatus = 'triage' | 'todo' | 'ready' | 'running' | 'blocked' | 'done' | 'archived';
export type KanbanPriority = 'low' | 'medium' | 'high' | 'critical';

export interface KanbanTask {
  id: string;
  title: string;
  description: string;
  status: KanbanStatus;
  priority: KanbanPriority;
  tenant: string;
  assignee: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  due_date: string | null;
  completed_at: string | null;
  comments_count: number;
  links_count: number;
}

export interface KanbanComment {
  id: string;
  task_id: string;
  author: string;
  content: string;
  created_at: string;
}

export interface KanbanEvent {
  id: string;
  task_id: string;
  actor: string;
  action: string;
  detail: string | null;
  created_at: string;
}

export interface KanbanLink {
  id: string;
  parent_id: string;
  child_id: string;
  relation: string;
}

export interface KanbanBoard {
  [status: string]: KanbanTask[];
}

export interface KanbanTaskDetail extends KanbanTask {
  comments: KanbanComment[];
  events: KanbanEvent[];
  parent_links: KanbanLink[];
  child_links: KanbanLink[];
}

export interface KanbanStats {
  total: number;
  triage: number;
  todo: number;
  ready: number;
  running: number;
  blocked: number;
  done: number;
  archived: number;
}

export interface KanbanBoardInfo {
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  archived: boolean;
  is_current: boolean;
}

export interface CreateKanbanBoardParams {
  slug: string;
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface UpdateKanbanBoardParams {
  slug: string;
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface SetKanbanBoardArchivedParams {
  slug: string;
  archived: boolean;
}

export interface CreateKanbanTaskParams {
  title: string;
  description?: string;
  status?: KanbanStatus;
  priority?: KanbanPriority;
  tenant?: string;
  assignee?: string;
  parent_id?: string;
  due_date?: string;
}

export interface UpdateKanbanTaskParams {
  title?: string;
  description?: string;
  status?: KanbanStatus;
  priority?: KanbanPriority;
  tenant?: string;
  assignee?: string;
  parent_id?: string;
  due_date?: string;
}

export interface MoveKanbanTaskParams {
  task_id: string;
  status: KanbanStatus;
}

export interface AddKanbanCommentParams {
  task_id: string;
  content: string;
  author?: string;
}

export interface KanbanFilters {
  board: string | null;
  tenant: string | null;
  showArchived: boolean;
}
