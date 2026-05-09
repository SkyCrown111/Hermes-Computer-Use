import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { HermesApiError, isTauri } from '../lib/tauri';
import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';

/** Default timeout (ms) for waiting on a stream completion event. */
const STREAM_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes - long tasks like compilation can take a while

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: string;
  tool_calls?: { name: string; args: Record<string, unknown> }[];
  tool_name?: string;
  reasoning?: string;
}

export interface ChatStreamEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error';
  content?: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result?: string;
  reasoning?: string;
  error?: string;
}

export interface SendMessageParams {
  message: string;
  session_id?: string;
  platform?: string;
  chat_id?: string;
  skills?: string[];
  model_override?: { provider?: string; model?: string };
  stream?: boolean;
}

export interface SendMessageResponse {
  session_id: string;
  response: string;
  tool_calls_count?: number;
  input_tokens?: number;
  output_tokens?: number;
  estimated_cost_usd?: number;
}

export interface StreamToolEvent {
  name: string;
  event_type: string;
  preview?: string;
  args?: Record<string, unknown>;
  duration?: number;
  is_error?: boolean;
}

export interface StreamUsageEvent {
  prompt_tokens?: number;
  input_tokens?: number;
  completion_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface StreamApprovalEvent {
  id: string;
  command: string;
  description: string;
  allow_permanent: boolean;
}

export interface StreamClarifyEvent {
  id: string;
  question: string;
  choices: string[];
  is_open_ended: boolean;
}

export interface StreamSecretEvent {
  id: string;
  var_name: string;
  prompt: string;
  metadata: Record<string, unknown>;
}

export interface StreamCallbacks {
  onStatus?: (status: string, message?: string) => void;
  onChunk?: (chunk: string, accumulated: string) => void;
  onReasoning?: (text: string, accumulated: string) => void;
  onTool?: (tool: StreamToolEvent) => void;
  onUsage?: (usage: StreamUsageEvent) => void;
  onComplete?: (content: string, newSessionId: string | null, usage: StreamUsageEvent | null, reasoning: string | null) => void;
  onError?: (error: string | Error | unknown) => void;
  onApproval?: (approval: StreamApprovalEvent) => void;
  onClarify?: (clarify: StreamClarifyEvent) => void;
  onSecret?: (secret: StreamSecretEvent) => void;
  onSessionCreated?: (newSessionId: string) => void;
}

/** Message entry used when building the messages array for streaming. */
export interface ChatHistoryEntry {
  role: string;
  content: string;
}

export async function sendMessage(params: SendMessageParams): Promise<SendMessageResponse> {
  if (!isTauri()) {
    logger.warn('[HermesChat] Not in Tauri environment, returning mock response');
    return {
      session_id: params.session_id ?? `mock_${Date.now()}`,
      response: `[Mock] Received: "${params.message}"`,
      tool_calls_count: 0,
      input_tokens: 10,
      output_tokens: 20,
      estimated_cost_usd: 0,
    };
  }

  return apiClient.invoke<SendMessageResponse>('send_chat_message', {
    message: params.message,
    session_id: params.session_id,
    platform: params.platform,
    chat_id: params.chat_id,
    skills: params.skills,
    model_override: params.model_override,
    stream: params.stream ?? true,
  });
}

export type StreamEventHandler = (event: ChatStreamEvent) => void;

export function createStreamSubscription(sessionId: string, handler: StreamEventHandler): () => void {
  if (!isTauri()) {
    logger.warn('[HermesChat] Not in Tauri environment, stream not available');
    return () => {};
  }

  let unlisten: (() => void) | null = null;
  const eventName = `chat-stream-${sessionId}`;

  (async () => {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<ChatStreamEvent>(eventName, (event) => {
        handler(event.payload);
      });
    } catch (error) {
      logger.error(`[HermesChat] Failed to subscribe to stream: ${error}`);
    }
  })();

  return () => {
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  };
}

export async function interruptSession(sessionId: string): Promise<void> {
  if (!isTauri()) return;
  await apiClient.invoke('interrupt_session', { session_id: sessionId });
}

export async function emitChatEvent(sessionId: string, event: ChatStreamEvent): Promise<void> {
  try {
    await emit(`chat-stream-${sessionId}`, event);
  } catch (error) {
    logger.error(`[HermesChat] emitChatEvent failed: ${error}`);
  }
}

export async function streamChatRealtime(
  message: string,
  sessionId: string | null,
  _historyOrCallbacks?: ChatHistoryEntry[] | StreamCallbacks,
  callbacks?: StreamCallbacks,
  modelOverride?: { provider?: string; model?: string }
): Promise<void> {
  // Resolve history and callbacks from flexible parameter signature
  const history: ChatHistoryEntry[] =
    Array.isArray(_historyOrCallbacks) ? _historyOrCallbacks : [];
  const resolvedCallbacks: StreamCallbacks =
    (callbacks ?? (_historyOrCallbacks && !Array.isArray(_historyOrCallbacks) ? _historyOrCallbacks as StreamCallbacks : {})) || {};

  if (!isTauri()) {
    logger.warn('[HermesChat] Not in Tauri environment, stream not available');
    resolvedCallbacks.onComplete?.('[Mock response]', sessionId, {}, null);
    return;
  }

  const unlisteners: Array<() => void> = [];

  /** Safely tear down every Tauri event listener. */
  const cleanupListeners = (): void => {
    for (const unlisten of unlisteners) {
      try { unlisten(); } catch { /* already unsubscribed */ }
    }
    unlisteners.length = 0;
  };

  // Idle timer lives outside try/finally so cleanup can always clear it.
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  try {
    resolvedCallbacks.onStatus?.('connecting');

    const { listen } = await import('@tauri-apps/api/event');

    // Create a promise that resolves when chat:complete or chat:error is received.
    // Also add an idle timeout that resets on every chunk so active streams don't get killed.
    let resolveCompletion: () => void;
    let rejectCompletion: ((err: Error) => void) | null = null;
    const completionPromise = new Promise<void>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        rejectCompletion?.(new HermesApiError('timeout', `Stream timed out after ${STREAM_TIMEOUT_MS}ms of inactivity`));
      }, STREAM_TIMEOUT_MS);
    };
    resetIdleTimer();

    // Register event listeners BEFORE invoking the backend.
    // Reset idle timer on any data activity so long-running active streams don't time out.
    unlisteners.push(await listen<{ content: string; accumulated: string }>('chat:chunk', (event) => {
      resetIdleTimer();
      resolvedCallbacks.onChunk?.(event.payload.content, event.payload.accumulated);
    }));

    unlisteners.push(await listen<{ text: string; accumulated: string }>('chat:reasoning', (event) => {
      resetIdleTimer();
      resolvedCallbacks.onReasoning?.(event.payload.text, event.payload.accumulated);
    }));

    unlisteners.push(await listen<StreamToolEvent>('chat:tool', (event) => {
      resetIdleTimer();
      resolvedCallbacks.onTool?.(event.payload);
    }));

    unlisteners.push(await listen<StreamApprovalEvent>('chat:approval', (event) => {
      resetIdleTimer();
      resolvedCallbacks.onApproval?.(event.payload);
    }));

    unlisteners.push(await listen<StreamClarifyEvent>('chat:clarify', (event) => {
      resetIdleTimer();
      resolvedCallbacks.onClarify?.(event.payload);
    }));

    unlisteners.push(await listen<StreamSecretEvent>('chat:secret', (event) => {
      resetIdleTimer();
      resolvedCallbacks.onSecret?.(event.payload);
    }));

    unlisteners.push(await listen<StreamUsageEvent>('chat:usage', (event) => {
      resetIdleTimer();
      resolvedCallbacks.onUsage?.(event.payload);
    }));

    // Listen for status events (heartbeat from long-running tool operations)
    unlisteners.push(await listen<{ status: string; message: string }>('chat:status', (event) => {
      resetIdleTimer();
      resolvedCallbacks.onStatus?.(event.payload.status);
    }));

    unlisteners.push(await listen<{ session_id: string }>('chat:session', (event) => {
      resetIdleTimer();
      resolvedCallbacks.onSessionCreated?.(event.payload.session_id);
    }));

    unlisteners.push(await listen<{ id?: string; content: string; reasoning?: string }>('chat:complete', (event) => {
      resolvedCallbacks.onComplete?.(
        event.payload.content,
        event.payload.id ?? null,
        null,
        event.payload.reasoning ?? null
      );
      resolveCompletion();
    }));

    unlisteners.push(await listen<{ error: string }>('chat:error', (event) => {
      resolvedCallbacks.onError?.(event.payload.error);
      resolveCompletion();
    }));

    // Build messages array: history + current user message
    const messages: ChatHistoryEntry[] = [...history, { role: 'user', content: message }];

    // Fire the backend command (do not await -- it returns immediately and
    // communicates results via Tauri events).
    invoke('stream_chat_realtime', { messages, session_id: sessionId, model_override: modelOverride || null }).catch((error) => {
      const detail = getErrorDetail(error);
      logger.error(`[HermesChat] stream_chat_realtime invoke failed: ${detail}`);
      resolvedCallbacks.onError?.(detail);
      resolveCompletion();
    });

    resolvedCallbacks.onStatus?.('connected');

    // Wait for completion (idle timer will reject if no activity for STREAM_TIMEOUT_MS).
    await completionPromise;
  } catch (error) {
    const detail = getErrorDetail(error);
    logger.error(`[HermesChat] streamChatRealtime failed: ${detail}`);
    resolvedCallbacks.onError?.(detail);
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    cleanupListeners();
  }
}

export async function checkHermesApiHealth(): Promise<boolean> {
  if (!isTauri()) return false;

  try {
    const result = await invoke<{ status: string }>('check_hermes_health');
    return result.status === 'ok' || result.status === 'healthy';
  } catch (error) {
    logger.error(`[HermesChat] checkHermesApiHealth failed: ${error}`);
    return false;
  }
}

export async function respondApproval(approvalId: string, approved: boolean): Promise<void> {
  if (!isTauri()) return;
  await apiClient.invoke('respond_approval', { approval_id: approvalId, choice: approved ? 'approved' : 'denied' });
}

export async function respondClarify(clarifyId: string, response: string): Promise<void> {
  if (!isTauri()) return;
  await apiClient.invoke('respond_clarify', { clarify_id: clarifyId, answer: response });
}

export async function respondSecret(secretId: string, value: string): Promise<void> {
  if (!isTauri()) return;
  await apiClient.invoke('respond_secret', { secret_id: secretId, value });
}

export async function abortChat(sessionId: string): Promise<void> {
  if (!isTauri()) return;
  // Use interrupt_session to kill only the specific session's process,
  // not abort_chat which kills ALL running chat processes.
  await apiClient.invoke('interrupt_session', { session_id: sessionId });
}

export async function startHermesGateway(): Promise<{ status: string; message?: string }> {
  if (!isTauri()) return { status: 'mock' };
  return apiClient.invoke<{ status: string; message?: string }>('start_hermes_gateway', {});
}

export async function streamChatWithProgress(
  message: string,
  sessionId: string | null,
  onProgress?: (progress: number, status: string) => void
): Promise<void> {
  if (!isTauri()) return;

  await apiClient.invoke('stream_chat_with_progress', {
    messages: [{ role: 'user' as const, content: message }],
    session_id: sessionId,
    on_progress: onProgress,
  });
}

export async function streamChatMessage(
  message: string,
  sessionId: string | null
): Promise<void> {
  if (!isTauri()) return;

  await apiClient.invoke('stream_chat_message', {
    messages: [{ role: 'user' as const, content: message }],
    session_id: sessionId,
  });
}
