// Session API Service - Tauri Commands

import { safeInvoke } from '../lib/tauri';
import type { Session, SessionMessage } from '../types/session';
import type { Checkpoint, CheckpointListResponse, CreateCheckpointParams, RestoreCheckpointResult } from '../types/checkpoint';
import { logger } from '../lib/logger';

export interface SessionListResponse {
  sessions: Session[];
  total: number;
}

export interface SessionDetailResponse {
  session: Session;
  messages: SessionMessage[];
}

export interface SessionSearchResult {
  session_id: string;
  platform: string;
  matched_at: string;
}

export interface SessionSearchResponse {
  query: string;
  results: SessionSearchResult[];
  total: number;
}

interface WrappedSessionSearchResponse {
  results: SessionSearchResult[];
  total: number;
}

// Type guard for new SessionListResponse format
function isNewSessionResponse(resp: unknown): resp is SessionListResponse {
  if (typeof resp !== 'object' || resp === null) return false;
  const obj = resp as Record<string, unknown>;
  return 'sessions' in obj && Array.isArray(obj.sessions);
}

// Type guard for legacy Session[] format
function isLegacySessionArray(resp: unknown): resp is Session[] {
  if (!Array.isArray(resp)) return false;
  if (resp.length === 0) return true; // Empty array is valid legacy format
  const first = resp[0];
  return typeof first === 'object' && first !== null && 'id' in first;
}

function isWrappedSessionSearchResponse(resp: unknown): resp is WrappedSessionSearchResponse {
  if (typeof resp !== 'object' || resp === null) return false;
  const obj = resp as Record<string, unknown>;
  return 'results' in obj && Array.isArray(obj.results);
}

function isLegacySessionSearchArray(resp: unknown): resp is SessionSearchResult[] {
  if (!Array.isArray(resp)) return false;
  if (resp.length === 0) return true;
  const first = resp[0];
  return typeof first === 'object' && first !== null && 'session_id' in first;
}

// List all sessions
export async function listSessions(platform?: string, limit?: number, offset?: number): Promise<SessionListResponse> {
  const params: Record<string, unknown> = {};
  if (platform) params.platform = platform;
  if (limit) params.limit = limit;
  if (offset) params.offset = offset;

  logger.debug('[SessionApi] Calling list_sessions with params:', params);
  try {
    const response = await safeInvoke<unknown>('list_sessions', Object.keys(params).length > 0 ? params : undefined);
    logger.debug('[SessionApi] Raw response:', response);
    logger.debug('[SessionApi] Raw response type:', typeof response);

    // Handle new format (SessionListResponse)
    if (isNewSessionResponse(response)) {
      logger.debug('[SessionApi] Sessions fetched (new format):', response.sessions.length, 'total:', response.total);
      return {
        sessions: response.sessions || [],
        total: response.total ?? response.sessions.length,
      };
    }

    // Handle legacy format (Session[])
    if (isLegacySessionArray(response)) {
      logger.debug('[SessionApi] Sessions fetched (legacy format):', response.length);
      return {
        sessions: response,
        total: response.length,
      };
    }

    // Fallback: return empty response
    logger.warn('[SessionApi] Unexpected response format:', response);
    return {
      sessions: [],
      total: 0,
    };
  } catch (error) {
    logger.error('[SessionApi] Failed to list sessions:', error);
    return {
      sessions: [],
      total: 0,
    };
  }
}

// Get a single session by ID with messages
export async function getSession(id: string): Promise<SessionDetailResponse> {
  logger.debug('[SessionApi] Getting session:', id);
  try {
    const response = await safeInvoke<{ session: Session; messages: SessionMessage[] }>('get_session', { id });
    logger.debug('[SessionApi] Raw response:', response);
    logger.debug('[SessionApi] Session from response:', response?.session);
    logger.debug('[SessionApi] Messages from response:', response?.messages?.length);

    // Ensure we have valid data
    if (!response) {
      throw new Error('No response from get_session');
    }

    const session = response.session;
    const messages = response.messages || [];

    logger.debug('[SessionApi] Returning session:', session?.id, 'with', messages.length, 'messages');

    return { session, messages };
  } catch (error) {
    logger.error('[SessionApi] Failed to get session:', error);
    throw error;
  }
}

// Search sessions
export async function searchSessions(params: { q: string; platform?: string; days?: number }): Promise<SessionSearchResponse> {
  const response = await safeInvoke<unknown>('search_sessions', params);
  if (isWrappedSessionSearchResponse(response)) {
    return {
      query: params.q,
      results: response.results || [],
      total: response.total ?? response.results.length,
    };
  }

  if (isLegacySessionSearchArray(response)) {
    return {
      query: params.q,
      results: response,
      total: response.length,
    };
  }

  return {
    query: params.q,
    results: [],
    total: 0,
  };
}

// Delete a session
export async function deleteSession(id: string): Promise<void> {
  await safeInvoke('delete_session', { id });
}

// Update session title
export async function updateSessionTitle(id: string, title: string): Promise<void> {
  await safeInvoke('update_session_title', { id, title });
}

// Get sessions directory path
export async function getSessionsPath(): Promise<string> {
  return safeInvoke<string>('get_sessions_path');
}

// ============================================
// Checkpoint API Functions
// ============================================

// List all checkpoints for a session
export async function listCheckpoints(sessionId: string): Promise<CheckpointListResponse> {
  logger.debug('[SessionApi] Listing checkpoints for session:', sessionId);
  try {
    const response = await safeInvoke<CheckpointListResponse>('list_checkpoints', { session_id: sessionId });
    logger.debug('[SessionApi] Checkpoints found:', response.checkpoints.length);
    return {
      checkpoints: response.checkpoints || [],
      total: response.total || 0,
    };
  } catch (error) {
    logger.error('[SessionApi] Failed to list checkpoints:', error);
    throw error;
  }
}

// Create a checkpoint for a session
export async function createCheckpoint(params: CreateCheckpointParams): Promise<Checkpoint> {
  logger.debug('[SessionApi] Creating checkpoint for session:', params.session_id);
  try {
    const response = await safeInvoke<Checkpoint>('create_checkpoint', {
      session_id: params.session_id,
      name: params.name,
      description: params.description,
    });
    logger.debug('[SessionApi] Checkpoint created:', response.id);
    return response;
  } catch (error) {
    logger.error('[SessionApi] Failed to create checkpoint:', error);
    throw error;
  }
}

// Get checkpoint info
export async function getCheckpointInfo(checkpointId: string): Promise<Checkpoint> {
  logger.debug('[SessionApi] Getting checkpoint info:', checkpointId);
  try {
    const response = await safeInvoke<Checkpoint>('get_checkpoint_info', { checkpoint_id: checkpointId });
    return response;
  } catch (error) {
    logger.error('[SessionApi] Failed to get checkpoint info:', error);
    throw error;
  }
}

// Restore a checkpoint
export async function restoreCheckpoint(sessionId: string, checkpointId: string): Promise<RestoreCheckpointResult> {
  logger.debug('[SessionApi] Restoring checkpoint:', checkpointId, 'for session:', sessionId);
  try {
    const response = await safeInvoke<RestoreCheckpointResult>('restore_checkpoint', {
      session_id: sessionId,
      checkpoint_id: checkpointId,
    });
    logger.debug('[SessionApi] Checkpoint restored:', response);
    return response;
  } catch (error) {
    logger.error('[SessionApi] Failed to restore checkpoint:', error);
    throw error;
  }
}

// Delete a checkpoint
export async function deleteCheckpoint(checkpointId: string): Promise<void> {
  logger.debug('[SessionApi] Deleting checkpoint:', checkpointId);
  try {
    await safeInvoke<void>('delete_checkpoint', { checkpoint_id: checkpointId });
    logger.debug('[SessionApi] Checkpoint deleted:', checkpointId);
  } catch (error) {
    logger.error('[SessionApi] Failed to delete checkpoint:', error);
    throw error;
  }
}

// Export all functions
export const sessionApi = {
  listSessions,
  getSession,
  searchSessions,
  deleteSession,
  updateSessionTitle,
  getSessionsPath,

  // Checkpoint functions
  listCheckpoints,
  createCheckpoint,
  getCheckpointInfo,
  restoreCheckpoint,
  deleteCheckpoint,

  // Export session in various formats
  export: async (format: 'jsonl' | 'json' | 'markdown', sessionId: string): Promise<Blob> => {
    const content = await safeInvoke<string>('export_session', { format, session_id: sessionId });
    return new Blob([content], { type: format === 'markdown' ? 'text/markdown' : 'application/json' });
  },
};
