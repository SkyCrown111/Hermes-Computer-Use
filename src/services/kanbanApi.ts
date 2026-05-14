import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import type {
  KanbanBoard,
  KanbanBoardInfo,
  KanbanTaskDetail,
  KanbanStats,
  CreateKanbanBoardParams,
  CreateKanbanTaskParams,
  SetKanbanBoardArchivedParams,
  UpdateKanbanBoardParams,
  UpdateKanbanTaskParams,
  MoveKanbanTaskParams,
  AddKanbanCommentParams,
} from '../types/kanban';
import type { ApiOkResponse } from '../types/common';

export async function listKanbanBoards(includeArchived?: boolean): Promise<KanbanBoardInfo[]> {
  try {
    return await apiClient.invoke<KanbanBoardInfo[]>('list_kanban_boards', {
      include_archived: includeArchived ?? false,
    });
  } catch (error) {
    logger.error(`[KanbanApi] listKanbanBoards failed: ${getErrorDetail(error)}`);
    throw error;
  }
}

export async function getCurrentKanbanBoard(): Promise<string> {
  try {
    return await apiClient.invoke<string>('get_current_kanban_board');
  } catch (error) {
    logger.error(`[KanbanApi] getCurrentKanbanBoard failed: ${getErrorDetail(error)}`);
    throw error;
  }
}

export async function switchKanbanBoard(slug: string): Promise<ApiOkResponse & { slug?: string }> {
  return apiClient.invoke<ApiOkResponse & { slug?: string }>('switch_kanban_board', { slug });
}

export async function createKanbanBoard(params: CreateKanbanBoardParams): Promise<ApiOkResponse & { slug?: string }> {
  return apiClient.invoke<ApiOkResponse & { slug?: string }>('create_kanban_board', { ...params });
}

export async function updateKanbanBoard(params: UpdateKanbanBoardParams): Promise<ApiOkResponse & { slug?: string }> {
  return apiClient.invoke<ApiOkResponse & { slug?: string }>('update_kanban_board', { ...params });
}

export async function setKanbanBoardArchived(params: SetKanbanBoardArchivedParams): Promise<ApiOkResponse & { slug?: string; current_board?: string }> {
  return apiClient.invoke<ApiOkResponse & { slug?: string; current_board?: string }>('set_kanban_board_archived', { ...params });
}

export async function getKanbanBoard(tenant?: string, showArchived?: boolean): Promise<KanbanBoard> {
  try {
    return await apiClient.invoke<KanbanBoard>('get_kanban_board', {
      tenant: tenant || null,
      show_archived: showArchived ?? false,
    });
  } catch (error) {
    logger.error(`[KanbanApi] getKanbanBoard failed: ${getErrorDetail(error)}`);
    throw error;
  }
}

export async function getKanbanTask(taskId: string): Promise<KanbanTaskDetail> {
  try {
    return await apiClient.invoke<KanbanTaskDetail>('get_kanban_task', { task_id: taskId });
  } catch (error) {
    logger.error(`[KanbanApi] getKanbanTask failed: ${getErrorDetail(error)}`);
    throw error;
  }
}

export async function getKanbanStats(tenant?: string, showArchived?: boolean): Promise<KanbanStats> {
  try {
    return await apiClient.invoke<KanbanStats>('get_kanban_stats', {
      tenant: tenant || null,
      show_archived: showArchived ?? false,
    });
  } catch (error) {
    logger.error(`[KanbanApi] getKanbanStats failed: ${getErrorDetail(error)}`);
    throw error;
  }
}

export async function getKanbanTenants(showArchived?: boolean): Promise<string[]> {
  try {
    return await apiClient.invoke<string[]>('get_kanban_tenants', {
      show_archived: showArchived ?? false,
    });
  } catch (error) {
    logger.error(`[KanbanApi] getKanbanTenants failed: ${getErrorDetail(error)}`);
    throw error;
  }
}

export async function createKanbanTask(params: CreateKanbanTaskParams): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('create_kanban_task', { ...params });
}

export async function updateKanbanTask(taskId: string, params: UpdateKanbanTaskParams): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('update_kanban_task', { task_id: taskId, ...params });
}

export async function deleteKanbanTask(taskId: string): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('delete_kanban_task', { task_id: taskId });
}

export async function moveKanbanTask(params: MoveKanbanTaskParams): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('move_kanban_task', { task_id: params.task_id, status: params.status });
}

export async function addKanbanComment(params: AddKanbanCommentParams): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('add_kanban_comment', {
    task_id: params.task_id,
    content: params.content,
    author: params.author || null,
  });
}

export async function addKanbanLink(parentId: string, childId: string, relation?: string): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('add_kanban_link', {
    parent_id: parentId,
    child_id: childId,
    relation: relation || null,
  });
}

export async function removeKanbanLink(linkId: string): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('remove_kanban_link', { link_id: linkId });
}
