import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { isTauri } from '../lib/tauri';
import {
  abortChatStreamWait,
  beginChatStream,
  endChatStream,
  ensureChatStreamBridge,
  waitForChatStreamEnd,
} from '../lib/chatStreamBridge';
import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';

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

export interface GatewayCommandResponse {
  ok: boolean;
  status: string;
  message?: string;
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
  choices?: Array<'once' | 'session' | 'always' | 'deny'>;
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

  // Backend expects messages: Vec<ChatMessage> + session_id: Option<String>
  // Build the messages array from the single user message
  const messages = [{ role: 'user' as const, content: params.message }];

  return apiClient.invoke<SendMessageResponse>('send_chat_message', {
    messages,
    session_id: params.session_id ?? null,
  });
}

export type StreamEventHandler = (event: ChatStreamEvent) => void;

export function createStreamSubscription(sessionId: string, handler: StreamEventHandler): () => void {
  if (!isTauri()) {
    logger.warn('[HermesChat] Not in Tauri environment, stream not available');
    return () => {};
  }

  let cancelled = false;
  let unlisten: (() => void) | null = null;
  const eventName = `chat-stream-${sessionId}`;

  (async () => {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      if (cancelled) return;
      unlisten = await listen<ChatStreamEvent>(eventName, (event) => {
        handler(event.payload);
      });
      if (cancelled) {
        unlisten();
        unlisten = null;
      }
    } catch (error) {
      logger.error(`[HermesChat] Failed to subscribe to stream: ${error}`);
    }
  })();

  return () => {
    cancelled = true;
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

export interface StreamChatRealtimeOptions {
  history?: ChatHistoryEntry[];
  callbacks?: StreamCallbacks;
  modelOverride?: { provider?: string; model?: string };
}

export async function streamChatRealtime(
  message: string,
  sessionId: string | null,
  historyOrOptions?: ChatHistoryEntry[] | StreamChatRealtimeOptions,
  legacyCallbacks?: StreamCallbacks,
  legacyModelOverride?: { provider?: string; model?: string }
): Promise<void> {
  // Support both new options-object and legacy positional signatures
  let history: ChatHistoryEntry[];
  let resolvedCallbacks: StreamCallbacks;
  let modelOverride: { provider?: string; model?: string } | undefined;

  if (Array.isArray(historyOrOptions)) {
    // Legacy positional: (message, sessionId, history, callbacks, modelOverride)
    history = historyOrOptions;
    resolvedCallbacks = legacyCallbacks ?? {};
    modelOverride = legacyModelOverride;
  } else {
    // New options object: (message, sessionId, options)
    history = historyOrOptions?.history ?? [];
    resolvedCallbacks = historyOrOptions?.callbacks ?? {};
    modelOverride = historyOrOptions?.modelOverride;
  }

  if (!isTauri()) {
    logger.warn('[HermesChat] Not in Tauri environment, stream not available');
    resolvedCallbacks.onComplete?.('[Mock response]', sessionId, {}, null);
    return;
  }

  if (!sessionId) {
    resolvedCallbacks.onError?.('Session ID is required for streaming');
    return;
  }

  await ensureChatStreamBridge();
  beginChatStream(sessionId, resolvedCallbacks);

  try {
    resolvedCallbacks.onStatus?.('connecting');

    const messages: ChatHistoryEntry[] = [...history, { role: 'user', content: message }];

    const completionPromise = waitForChatStreamEnd();

    invoke('stream_chat_realtime', {
      messages,
      session_id: sessionId,
      model_override: modelOverride || null,
    }).catch((error) => {
      const detail = getErrorDetail(error);
      logger.error(`[HermesChat] stream_chat_realtime invoke failed: ${detail}`);
      resolvedCallbacks.onError?.(detail);
      abortChatStreamWait(detail);
    });

    resolvedCallbacks.onStatus?.('connected');
    await completionPromise;
  } catch (error) {
    const detail = getErrorDetail(error);
    logger.error(`[HermesChat] streamChatRealtime failed: ${detail}`);
    resolvedCallbacks.onError?.(detail);
  } finally {
    endChatStream();
  }
}

export async function checkHermesApiHealth(): Promise<boolean> {
  if (!isTauri()) return false;

  try {
    const result = await invoke<{ status: string }>('check_hermes_health');
    return result.status === 'healthy' || result.status === 'degraded';
  } catch (error) {
    logger.error(`[HermesChat] checkHermesApiHealth failed: ${error}`);
    return false;
  }
}

export type ApprovalResponseChoice = boolean | 'once' | 'session' | 'always' | 'deny' | 'approved' | 'denied';

export async function respondApproval(approvalId: string, choice: ApprovalResponseChoice): Promise<void> {
  if (!isTauri()) return;
  const normalizedChoice =
    choice === true ? 'approved' :
    choice === false ? 'denied' :
    choice;
  await apiClient.invoke('respond_approval', { approval_id: approvalId, choice: normalizedChoice });
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
  // Use interrupt_session to kill only the specific session's process.
  await apiClient.invoke('interrupt_session', { session_id: sessionId });
}

export async function startHermesGateway(): Promise<GatewayCommandResponse> {
  if (!isTauri()) return { ok: true, status: 'mock' };
  return apiClient.invoke<GatewayCommandResponse>('start_hermes_gateway', {});
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
