import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import type {
  Session,
  SessionListResponse,
  SessionMessagesResponse,
  SessionSearchParams,
  SessionSearchResponse,
  SessionListParams,
  SessionExportParams,
} from '../types/session';
import type { ApiOkResponse } from '../types/common';

export async function listSessions(params?: SessionListParams): Promise<SessionListResponse> {
  try {
    const result = await apiClient.invoke<SessionListResponse>('list_sessions', {
      platform: params?.platform,
      limit: params?.limit ?? 100,
      offset: params?.offset ?? 0,
    });
    return result;
  } catch (error) {
    logger.error(`[SessionApi] listSessions failed: ${getErrorDetail(error)}`);
    return { sessions: [], total: 0, limit: params?.limit ?? 100, offset: params?.offset ?? 0 };
  }
}

export async function getSession(sessionId: string): Promise<SessionMessagesResponse | null> {
  if (!sessionId || sessionId.trim() === '') {
    logger.warn('[SessionApi] getSession called with empty session ID');
    return null;
  }
  try {
    return await apiClient.invoke<SessionMessagesResponse>('get_session', { id: sessionId });
  } catch (error) {
    logger.error(`[SessionApi] getSession failed: ${getErrorDetail(error)}`);
    return null;
  }
}

export async function deleteSession(sessionId: string): Promise<ApiOkResponse> {
  if (!sessionId || sessionId.trim() === '') {
    throw new Error('Cannot delete session: empty session ID');
  }
  return apiClient.invoke<ApiOkResponse>('delete_session', { id: sessionId });
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<ApiOkResponse> {
  if (!sessionId || sessionId.trim() === '') {
    throw new Error('Cannot update session title: empty session ID');
  }
  return apiClient.invoke<ApiOkResponse>('update_session_title', { id: sessionId, title });
}

export async function searchSessions(params: SessionSearchParams): Promise<SessionSearchResponse> {
  try {
    return await apiClient.invoke<SessionSearchResponse>('search_sessions', {
      q: params.q,
      platform: params.platform,
      days: params.days,
    });
  } catch (error) {
    logger.error(`[SessionApi] searchSessions failed: ${getErrorDetail(error)}`);
    return { query: params.q ?? '', results: [], total: 0 };
  }
}

export async function exportSessions(params: SessionExportParams): Promise<unknown> {
  return apiClient.invoke('export_session', {
    format: params.format,
    session_id: params.session_id,
    platform: params.platform,
  });
}

export async function getSessionsPath(): Promise<string> {
  try {
    return await apiClient.invoke<string>('get_sessions_path');
  } catch (error) {
    logger.debug('[Sessions] getSessionsPath failed, using default:', getErrorDetail(error));
    return '~/.hermes/sessions';
  }
}

// 统计会话数量
export async function countSessions(): Promise<number> {
  try {
    const result = await apiClient.invoke<{ count: number }>('count_sessions');
    return result.count;
  } catch (error) {
    logger.error(`[SessionApi] countSessions failed: ${getErrorDetail(error)}`);
    return 0;
  }
}

// Checkpoint 相关功能
export interface Checkpoint {
  id: string;
  session_id: string;
  created_at: string;
  message_count: number;
  description?: string;
}

export interface CheckpointInfo {
  checkpoint: Checkpoint;
  messages: Array<{ role: string; content: string }>;
}

export async function listCheckpoints(sessionId: string): Promise<Checkpoint[]> {
  try {
    return await apiClient.invoke<Checkpoint[]>('list_checkpoints', { session_id: sessionId });
  } catch (error) {
    logger.error(`[SessionApi] listCheckpoints failed: ${getErrorDetail(error)}`);
    return [];
  }
}

export async function createCheckpoint(sessionId: string, description?: string): Promise<Checkpoint | null> {
  try {
    return await apiClient.invoke<Checkpoint>('create_checkpoint', { 
      session_id: sessionId,
      description 
    });
  } catch (error) {
    logger.error(`[SessionApi] createCheckpoint failed: ${getErrorDetail(error)}`);
    return null;
  }
}

export async function getCheckpointInfo(checkpointId: string): Promise<CheckpointInfo | null> {
  try {
    return await apiClient.invoke<CheckpointInfo>('get_checkpoint_info', { checkpoint_id: checkpointId });
  } catch (error) {
    logger.error(`[SessionApi] getCheckpointInfo failed: ${getErrorDetail(error)}`);
    return null;
  }
}

export async function restoreCheckpoint(checkpointId: string): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('restore_checkpoint', { checkpoint_id: checkpointId });
}

export async function deleteCheckpoint(checkpointId: string): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('delete_checkpoint', { checkpoint_id: checkpointId });
}

export function formatSessionId(raw: string): string {
  return raw.replace(/^cron_/, '⏰ ').replace(/^(\d{8}_\d{6})/, (_, date: string) => {
    const y = date.slice(0, 4);
    const m = date.slice(4, 6);
    const d = date.slice(6, 8);
    const h = date.slice(9, 11);
    const min = date.slice(11, 13);
    const s = date.slice(13, 15);
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  });
}

export function isCronSession(session: Session): boolean {
  return session.id.startsWith('cron_') || session.platform === 'cron';
}

export function getSessionDisplayName(session: Session): string {
  if (session.chat_name) return session.chat_name;
  if (isCronSession(session)) return `Cron: ${session.id}`;
  return formatSessionId(session.id);
}
