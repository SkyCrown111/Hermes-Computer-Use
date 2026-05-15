import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import { DEFAULT_PATHS } from './constants';
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
import type { Checkpoint, RestoreCheckpointResult } from '../types/checkpoint';

/** Checkpoint metadata from CheckpointManager v2 (camelCase from backend) */
interface CheckpointMetadataV2 {
  id: string;
  sessionId: string;
  name: string;
  description?: string | null;
  createdAt: string;
  messageCount: number;
  sizeBytes: number;
  tags?: string[];
}

function mapCheckpointV2(meta: CheckpointMetadataV2): Checkpoint {
  return {
    id: meta.id,
    session_id: meta.sessionId,
    name: meta.name,
    created_at: meta.createdAt,
    message_count: meta.messageCount,
    size_bytes: meta.sizeBytes,
    description: meta.description ?? null,
  };
}

export async function listSessions(params?: SessionListParams): Promise<SessionListResponse> {
  try {
    const result = await apiClient.invokeShared<SessionListResponse>('list_sessions', {
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

export async function exportSessions(params: SessionExportParams): Promise<string> {
  return apiClient.invoke<string>('export_session', {
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
    return DEFAULT_PATHS.sessions;
  }
}

export async function countSessions(): Promise<number> {
  try {
    const result = await apiClient.invoke<{ count: number }>('count_sessions', { platform: null });
    return result.count;
  } catch (error) {
    logger.error(`[SessionApi] countSessions failed: ${getErrorDetail(error)}`);
    return 0;
  }
}

// Checkpoint v2 (CheckpointManager)
export async function listCheckpoints(sessionId: string): Promise<Checkpoint[]> {
  try {
    const list = await apiClient.invoke<CheckpointMetadataV2[]>('list_checkpoints_v2', {
      session_id: sessionId,
    });
    return (list ?? []).map(mapCheckpointV2);
  } catch (error) {
    logger.error(`[SessionApi] listCheckpoints failed: ${getErrorDetail(error)}`);
    return [];
  }
}

export async function createCheckpoint(
  sessionId: string,
  name?: string,
  description?: string,
): Promise<Checkpoint | null> {
  try {
    const descParts = [name, description].filter(Boolean);
    const meta = await apiClient.invoke<CheckpointMetadataV2>('create_checkpoint_v2', {
      session_id: sessionId,
      description: descParts.length > 0 ? descParts.join(' — ') : null,
    });
    return mapCheckpointV2(meta);
  } catch (error) {
    logger.error(`[SessionApi] createCheckpoint failed: ${getErrorDetail(error)}`);
    return null;
  }
}

export async function getCheckpointInfo(checkpointId: string): Promise<Checkpoint | null> {
  try {
    const meta = await apiClient.invoke<CheckpointMetadataV2>('get_checkpoint_info_v2', {
      checkpoint_id: checkpointId,
    });
    return mapCheckpointV2(meta);
  } catch (error) {
    logger.error(`[SessionApi] getCheckpointInfo failed: ${getErrorDetail(error)}`);
    return null;
  }
}

export async function restoreCheckpoint(
  sessionId: string,
  checkpointId: string,
): Promise<RestoreCheckpointResult> {
  await apiClient.invoke<void>('restore_checkpoint_v2', { checkpoint_id: checkpointId });
  return {
    success: true,
    session_id: sessionId,
    checkpoint_id: checkpointId,
    restored_at: new Date().toISOString(),
    message_count: 0,
  };
}

export async function deleteCheckpoint(checkpointId: string): Promise<ApiOkResponse> {
  await apiClient.invoke<void>('delete_checkpoint_v2', { checkpoint_id: checkpointId });
  return { ok: true };
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
