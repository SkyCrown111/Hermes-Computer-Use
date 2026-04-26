// Session API Service - Tauri Commands

import { safeInvoke } from '../lib/tauri';
import type { Session, SessionMessage } from '../types/session';
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

// List all sessions
export async function listSessions(platform?: string, limit?: number, offset?: number): Promise<SessionListResponse> {
  const params: Record<string, unknown> = {};
  if (platform) params.platform = platform;
  if (limit) params.limit = limit;
  if (offset) params.offset = offset;

  logger.debug('[SessionApi] Calling list_sessions with params:', params);
  const response = await safeInvoke<SessionListResponse>('list_sessions', Object.keys(params).length > 0 ? params : undefined);
  logger.debug('[SessionApi] Sessions fetched:', response?.sessions?.length || 0, 'total:', response?.total);

  // Handle both old format (Session[]) and new format (SessionListResponse)
  if (response && 'sessions' in response) {
    return response;
  }

  // Fallback for old format
  const sessions = response as unknown as Session[];
  return {
    sessions: sessions || [],
    total: sessions?.length || 0,
  };
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
  const response = await safeInvoke<{ results: SessionSearchResult[]; total: number }>('search_sessions', params);
  return {
    query: params.q,
    results: response?.results || [],
    total: response?.total || 0,
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

// Export all functions
export const sessionApi = {
  listSessions,
  getSession,
  searchSessions,
  deleteSession,
  updateSessionTitle,
  getSessionsPath,

  // Export session in various formats
  export: async (format: 'jsonl' | 'json' | 'markdown', sessionId: string): Promise<Blob> => {
    const content = await safeInvoke<string>('export_session', { format, sessionId });
    return new Blob([content], { type: format === 'markdown' ? 'text/markdown' : 'application/json' });
  },
};
