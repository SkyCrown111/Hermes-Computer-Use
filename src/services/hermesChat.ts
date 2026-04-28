import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { HermesApiError, isTauri } from '../lib/tauri';
import { getErrorDetail } from './apiClient';
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

export interface StreamCallbacks {
  onStatus?: (status: string, message?: string) => void;
  onChunk?: (chunk: string, accumulated: string) => void;
  onReasoning?: (text: string, accumulated: string) => void;
  onTool?: (tool: Record<string, unknown>) => void;
  onUsage?: (usage: Record<string, unknown>) => void;
  onComplete?: (content: string, newSessionId: string | null, usage: Record<string, unknown> | null, reasoning: string | null) => void;
  onError?: (error: string | Error | unknown) => void;
  onApproval?: (approval: Record<string, unknown>) => void;
  onClarify?: (clarify: Record<string, unknown>) => void;
  onSecret?: (secret: Record<string, unknown>) => void;
  onSessionCreated?: (newSessionId: string) => void;
}

function wrapChatCall<T>(command: string, args: Record<string, unknown>, errorCode: string): Promise<T> {
  return invoke<T>(command, args).catch(error => {
    const detail = getErrorDetail(error);
    logger.error(`[HermesChat] ${command} failed: ${detail}`);
    throw new HermesApiError(errorCode, detail);
  });
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

  return wrapChatCall<SendMessageResponse>('send_chat_message', {
    message: params.message,
    session_id: params.session_id,
    platform: params.platform,
    chat_id: params.chat_id,
    skills: params.skills,
    model_override: params.model_override,
    stream: params.stream ?? true,
  }, 'chat_error');
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
  return wrapChatCall('interrupt_session', { session_id: sessionId }, 'interrupt_error');
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
  _historyOrCallbacks?: Array<unknown> | StreamCallbacks,
  callbacks?: StreamCallbacks
): Promise<void> {
  const resolvedCallbacks: StreamCallbacks = (callbacks ?? (_historyOrCallbacks && !Array.isArray(_historyOrCallbacks) ? _historyOrCallbacks as StreamCallbacks : {})) || {};

  if (!isTauri()) {
    logger.warn('[HermesChat] Not in Tauri environment, stream not available');
    resolvedCallbacks.onComplete?.('[Mock response]', sessionId, {}, null);
    return;
  }

  try {
    resolvedCallbacks.onStatus?.('connecting');
    await invoke('stream_chat_realtime', { message, session_id: sessionId });
    resolvedCallbacks.onStatus?.('connected');
  } catch (error) {
    const detail = getErrorDetail(error);
    logger.error(`[HermesChat] streamChatRealtime failed: ${detail}`);
    resolvedCallbacks.onError?.(detail);
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
  return wrapChatCall('respond_approval', { approval_id: approvalId, approved }, 'approval_error');
}

export async function respondClarify(clarifyId: string, response: string): Promise<void> {
  if (!isTauri()) return;
  return wrapChatCall('respond_clarify', { clarify_id: clarifyId, response }, 'clarify_error');
}

export async function respondSecret(secretId: string, value: string): Promise<void> {
  if (!isTauri()) return;
  return wrapChatCall('respond_secret', { secret_id: secretId, value }, 'secret_error');
}

export async function abortChat(sessionId: string): Promise<void> {
  if (!isTauri()) return;
  return wrapChatCall('abort_chat', { session_id: sessionId }, 'abort_error');
}
