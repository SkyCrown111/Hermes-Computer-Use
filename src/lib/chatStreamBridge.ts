/**
 * Global chat stream bridge — updates chatStore from Tauri events regardless of which page is mounted.
 */
import { isTauri } from './tauri';
import { logger } from './logger';
import { useChatStore, resolveSessionId } from '../stores/chatStore';
import { useSessionStore } from '../stores/sessionStore';
import { useNavigationStore } from '../stores/navigationStore';
import { useThemeStore } from '../stores/themeStore';
import { playNotificationSound, sendNotification } from '../services/notifications';
import type {
  StreamCallbacks,
  StreamToolEvent,
  StreamApprovalEvent,
  StreamClarifyEvent,
  StreamSecretEvent,
  StreamUsageEvent,
} from '../services/hermesChat';
import type { ToolCallInfo } from '../stores/chatStore';

const STREAM_TIMEOUT_MS = 30 * 60 * 1000;

let activeRequestSessionId: string | null = null;
let streamCallbacks: StreamCallbacks | null = null;
let listenersReady = false;
let listenerTeardown: (() => void) | null = null;

let completionResolve: (() => void) | null = null;
let completionReject: ((err: Error) => void) | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    completionReject?.(new Error(`Stream timed out after ${STREAM_TIMEOUT_MS}ms of inactivity`));
    finishStreamWait();
  }, STREAM_TIMEOUT_MS);
}

function finishStreamWait(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  completionResolve?.();
  completionResolve = null;
  completionReject = null;
}

function failStreamWait(err: Error): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  completionReject?.(err);
  completionResolve = null;
  completionReject = null;
}

/** Prefer backend `stream_session_key` so chunks still route after tab migration / without relying on a single active pointer. */
function resolveStreamTargetSessionId(
  payload?: { stream_session_key?: string } | null,
): string | null {
  const sid = payload?.stream_session_key ?? activeRequestSessionId;
  if (!sid) {
    logger.warn('[ChatStreamBridge] No stream session key (missing payload.stream_session_key and no active stream)');
    return null;
  }
  return sid;
}

function mapTools(tools: StreamToolEvent[]): ToolCallInfo[] {
  return tools.map((tool) => ({
    name: tool.name,
    event_type: tool.event_type,
    preview: tool.preview,
    args: tool.args as Record<string, unknown> | undefined,
    duration: tool.duration,
    is_error: tool.is_error,
  }));
}

export function beginChatStream(requestSessionId: string, callbacks: StreamCallbacks = {}): void {
  activeRequestSessionId = requestSessionId;
  streamCallbacks = callbacks;
  streamingToolsAccumulator.length = 0;
}

export function endChatStream(): void {
  activeRequestSessionId = null;
  streamCallbacks = null;
}

export function getActiveChatStreamRequestSessionId(): string | null {
  return activeRequestSessionId;
}

export function waitForChatStreamEnd(): Promise<void> {
  return new Promise((resolve, reject) => {
    completionResolve = resolve;
    completionReject = reject;
    resetIdleTimer();
  });
}

/** Resolve the in-flight stream wait (e.g. when invoke fails before events arrive). */
export function abortChatStreamWait(reason?: string): void {
  failStreamWait(new Error(reason || 'Stream aborted'));
}

export function applyStreamingChunk(requestSessionId: string, accumulated: string): void {
  const sessionId = resolveSessionId(requestSessionId);
  useChatStore.getState().setStreamingText(sessionId, accumulated);
}

export function applyStreamingReasoning(requestSessionId: string, accumulated: string): void {
  const sessionId = resolveSessionId(requestSessionId);
  useChatStore.getState().setReasoningText(sessionId, accumulated);
}

export function applyStreamingTool(requestSessionId: string, tool: StreamToolEvent): void {
  const sessionId = resolveSessionId(requestSessionId);
  useChatStore.getState().addStreamingTool(sessionId, {
    name: tool.name,
    event_type: tool.event_type,
    preview: tool.preview,
    args: tool.args as Record<string, unknown> | undefined,
    duration: tool.duration,
    is_error: tool.is_error,
  });
}

export function applyPendingApproval(requestSessionId: string, approval: StreamApprovalEvent): void {
  const sessionId = resolveSessionId(requestSessionId);
  useChatStore.getState().setPendingPermission(sessionId, approval);
}

export function applyPendingClarify(requestSessionId: string, clarify: StreamClarifyEvent): void {
  const sessionId = resolveSessionId(requestSessionId);
  useChatStore.getState().setPendingClarify(sessionId, clarify);
}

export function applyPendingSecret(requestSessionId: string, secret: StreamSecretEvent): void {
  const sessionId = resolveSessionId(requestSessionId);
  useChatStore.getState().setPendingSecret(sessionId, secret);
}

export async function handleChatSessionCreated(
  oldRequestSessionId: string,
  newSessionId: string,
): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('register_chat_interrupt_alias', {
        alias_id: newSessionId,
        stream_key: oldRequestSessionId,
      });
    } catch (e) {
      logger.warn('[ChatStreamBridge] register_chat_interrupt_alias failed:', e);
    }
  }

  useChatStore.getState().migrateSession(oldRequestSessionId, newSessionId);
  useNavigationStore.getState().replaceTabId(oldRequestSessionId, newSessionId);
  useSessionStore.getState().addSessionOptimistic(newSessionId);
  useSessionStore.getState().clearCache(oldRequestSessionId);
  if (activeRequestSessionId === oldRequestSessionId) {
    activeRequestSessionId = newSessionId;
  }
}

function notifyStreamComplete(sessionId: string): void {
  const prefs = useThemeStore.getState().displayPreferences.notifications;
  const lang = useThemeStore.getState().language || 'zh';
  if (!prefs.enabled) return;
  if (prefs.sound) {
    void playNotificationSound();
  }
  if (prefs.desktop) {
    void sendNotification('Hermes', {
      body: lang === 'zh' ? '任务已完成' : 'Task completed',
      tag: `hermes-task-complete-${sessionId}`,
    });
  }
}

export function finalizeChatStreamComplete(
  requestSessionId: string,
  content: string,
  newSessionId: string | null,
  reasoning: string | null,
  tools: StreamToolEvent[],
): void {
  const sessionId = resolveSessionId(newSessionId || requestSessionId);
  const store = useChatStore.getState();
  const currentSession = store.sessions[sessionId];
  const sTools =
    tools.length > 0 ? mapTools(tools) : (currentSession?.streamingTools || []);

  store.setStreaming(sessionId, false);
  store.clearStreamingTools(sessionId);
  store.setStreamingText(sessionId, '');
  store.clearReasoningText(sessionId);

  const lastMessage = currentSession?.messages?.[currentSession.messages.length - 1];
  if (lastMessage && lastMessage.role === 'assistant') {
    store.updateMessage(sessionId, lastMessage.id, {
      content,
      reasoning: reasoning || currentSession?.reasoningText || undefined,
      tools: sTools.length > 0 ? sTools : undefined,
    });
  } else {
    store.addMessage(sessionId, {
      role: 'assistant',
      content,
      reasoning: reasoning || undefined,
      tools: sTools.length > 0 ? sTools : undefined,
    });
  }

  if (sessionId && !sessionId.startsWith('new_')) {
    useSessionStore.getState().updateSessionActivity(sessionId, 2);
  }
  if (newSessionId) {
    void useSessionStore.getState().refreshSessions();
  }

  notifyStreamComplete(sessionId);
}

export function finalizeChatStreamError(
  requestSessionId: string,
  errorMessage: string,
  content: string,
  reasoning: string | null,
  tools: StreamToolEvent[],
): void {
  const sessionId = resolveSessionId(requestSessionId);
  const store = useChatStore.getState();
  const currentSession = store.sessions[sessionId];
  const accumulatedText = content || currentSession?.streamingText || '';
  const resolvedReasoning = reasoning || currentSession?.reasoningText || '';
  const sTools =
    tools.length > 0 ? mapTools(tools) : (currentSession?.streamingTools || []);

  store.setStreaming(sessionId, false);
  store.clearStreamingTools(sessionId);
  store.setStreamingText(sessionId, '');
  store.clearReasoningText(sessionId);

  if (accumulatedText.trim()) {
    const lastMessage = currentSession?.messages?.slice(-1)[0];
    if (lastMessage && lastMessage.role === 'assistant') {
      store.updateMessage(sessionId, lastMessage.id, {
        content: accumulatedText,
        reasoning: resolvedReasoning || undefined,
        tools: sTools.length > 0 ? sTools : undefined,
      });
    } else {
      store.addMessage(sessionId, {
        role: 'assistant',
        content: accumulatedText,
        reasoning: resolvedReasoning || undefined,
        tools: sTools.length > 0 ? sTools : undefined,
      });
    }
  } else if (errorMessage.trim()) {
    store.addMessage(sessionId, {
      role: 'assistant',
      content: errorMessage,
    });
  }
}

const streamingToolsAccumulator: StreamToolEvent[] = [];

export async function ensureChatStreamBridge(): Promise<void> {
  if (!isTauri() || listenersReady) return;

  const { listen } = await import('@tauri-apps/api/event');
  const unlisteners: Array<() => void> = [];

  unlisteners.push(
    await listen<{ content: string; accumulated: string; stream_session_key?: string }>(
      'chat:chunk',
      (event) => {
        const requestId = resolveStreamTargetSessionId(event.payload);
        if (!requestId) return;
        resetIdleTimer();
        applyStreamingChunk(requestId, event.payload.accumulated);
        streamCallbacks?.onChunk?.(event.payload.content, event.payload.accumulated);
      },
    ),
  );

  unlisteners.push(
    await listen<{ text: string; accumulated: string; stream_session_key?: string }>(
      'chat:reasoning',
      (event) => {
        const requestId = resolveStreamTargetSessionId(event.payload);
        if (!requestId) return;
        resetIdleTimer();
        applyStreamingReasoning(requestId, event.payload.accumulated);
        streamCallbacks?.onReasoning?.(event.payload.text, event.payload.accumulated);
      },
    ),
  );

  unlisteners.push(
    await listen<StreamToolEvent & { stream_session_key?: string }>('chat:tool', (event) => {
      const requestId = resolveStreamTargetSessionId(event.payload);
      if (!requestId) return;
      resetIdleTimer();
      const { stream_session_key: _sk, ...toolPayload } = event.payload;
      streamingToolsAccumulator.push(toolPayload as StreamToolEvent);
      applyStreamingTool(requestId, toolPayload as StreamToolEvent);
      streamCallbacks?.onTool?.(toolPayload as StreamToolEvent);
    }),
  );

  unlisteners.push(
    await listen<StreamApprovalEvent & { stream_session_key?: string }>('chat:approval', (event) => {
      const requestId = resolveStreamTargetSessionId(event.payload);
      if (!requestId) return;
      resetIdleTimer();
      const { stream_session_key: _sk, ...approval } = event.payload;
      applyPendingApproval(requestId, approval);
      streamCallbacks?.onApproval?.(approval);
    }),
  );

  unlisteners.push(
    await listen<StreamClarifyEvent & { stream_session_key?: string }>('chat:clarify', (event) => {
      const requestId = resolveStreamTargetSessionId(event.payload);
      if (!requestId) return;
      resetIdleTimer();
      const { stream_session_key: _sk, ...clarify } = event.payload;
      applyPendingClarify(requestId, clarify);
      streamCallbacks?.onClarify?.(clarify);
    }),
  );

  unlisteners.push(
    await listen<StreamSecretEvent & { stream_session_key?: string }>('chat:secret', (event) => {
      const requestId = resolveStreamTargetSessionId(event.payload);
      if (!requestId) return;
      resetIdleTimer();
      const { stream_session_key: _sk, ...secret } = event.payload;
      applyPendingSecret(requestId, secret);
      streamCallbacks?.onSecret?.(secret);
    }),
  );

  unlisteners.push(
    await listen<StreamUsageEvent>('chat:usage', (event) => {
      resetIdleTimer();
      streamCallbacks?.onUsage?.(event.payload);
    }),
  );

  unlisteners.push(
    await listen<{ status: string; message?: string; stream_session_key?: string }>('chat:status', (event) => {
      resetIdleTimer();
      streamCallbacks?.onStatus?.(event.payload.status);
    }),
  );

  unlisteners.push(
    await listen<{ session_id: string; stream_session_key?: string }>('chat:session', async (event) => {
      const requestId = resolveStreamTargetSessionId(event.payload);
      if (!requestId) return;
      resetIdleTimer();
      await handleChatSessionCreated(requestId, event.payload.session_id);
      streamCallbacks?.onSessionCreated?.(event.payload.session_id);
    }),
  );

  unlisteners.push(
    await listen<{ id?: string; content: string; reasoning?: string; stream_session_key?: string }>(
      'chat:complete',
      (event) => {
        const requestId = resolveStreamTargetSessionId(event.payload);
        if (!requestId) return;
        const tools = [...streamingToolsAccumulator];
        streamingToolsAccumulator.length = 0;
        finalizeChatStreamComplete(
          requestId,
          event.payload.content,
          event.payload.id ?? null,
          event.payload.reasoning ?? null,
          tools,
        );
        streamCallbacks?.onComplete?.(
          event.payload.content,
          event.payload.id ?? null,
          null,
          event.payload.reasoning ?? null,
        );
        finishStreamWait();
      },
    ),
  );

  unlisteners.push(
    await listen<{ error: string; stream_session_key?: string }>('chat:error', (event) => {
      const requestId = resolveStreamTargetSessionId(event.payload);
      if (!requestId) return;
      const tools = [...streamingToolsAccumulator];
      streamingToolsAccumulator.length = 0;
      const store = useChatStore.getState();
      const sessionId = resolveSessionId(requestId);
      const session = store.sessions[sessionId];
      finalizeChatStreamError(
        requestId,
        event.payload.error,
        session?.streamingText || '',
        session?.reasoningText || null,
        tools,
      );
      streamCallbacks?.onError?.(event.payload.error);
      finishStreamWait();
    }),
  );

  listenerTeardown = () => {
    for (const unlisten of unlisteners) {
      try {
        unlisten();
      } catch {
        /* already removed */
      }
    }
  };
  listenersReady = true;
  logger.debug('[ChatStreamBridge] Global chat stream listeners registered');
}

export function teardownChatStreamBridge(): void {
  listenerTeardown?.();
  listenerTeardown = null;
  listenersReady = false;
  endChatStream();
}
