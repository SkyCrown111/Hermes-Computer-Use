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
  // Resolve history and callbacks from flexible parameter signature
  const history: Array<{ role: string; content: string }> =
    Array.isArray(_historyOrCallbacks) ? _historyOrCallbacks as Array<{ role: string; content: string }> : [];
  const resolvedCallbacks: StreamCallbacks = (callbacks ?? (_historyOrCallbacks && !Array.isArray(_historyOrCallbacks) ? _historyOrCallbacks as StreamCallbacks : {})) || {};

  if (!isTauri()) {
    logger.warn('[HermesChat] Not in Tauri environment, stream not available');
    resolvedCallbacks.onComplete?.('[Mock response]', sessionId, {}, null);
    return;
  }

  try {
    resolvedCallbacks.onStatus?.('connecting');
    
    // Import Tauri event listener
    const { listen } = await import('@tauri-apps/api/event');
    
    // Set up event listeners BEFORE calling the backend
    const unlisteners: Array<() => void> = [];
    
    // Create a promise that resolves when chat:complete or chat:error is received
    let resolveCompletion: () => void;
    const completionPromise = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    
    // Listen for chunk events
    unlisteners.push(await listen<{ content: string; accumulated: string }>('chat:chunk', (event) => {
      resolvedCallbacks.onChunk?.(event.payload.content, event.payload.accumulated);
    }));
    
    // Listen for reasoning events
    unlisteners.push(await listen<{ text: string; accumulated: string }>('chat:reasoning', (event) => {
      resolvedCallbacks.onReasoning?.(event.payload.text, event.payload.accumulated);
    }));
    
    // Listen for tool events
    unlisteners.push(await listen<StreamToolEvent>('chat:tool', (event) => {
      resolvedCallbacks.onTool?.(event.payload);
    }));

    // Listen for approval events
    unlisteners.push(await listen<StreamApprovalEvent>('chat:approval', (event) => {
      resolvedCallbacks.onApproval?.(event.payload);
    }));

    // Listen for clarify events
    unlisteners.push(await listen<StreamClarifyEvent>('chat:clarify', (event) => {
      resolvedCallbacks.onClarify?.(event.payload);
    }));

    // Listen for secret events
    unlisteners.push(await listen<StreamSecretEvent>('chat:secret', (event) => {
      resolvedCallbacks.onSecret?.(event.payload);
    }));

    // Listen for usage events
    unlisteners.push(await listen<StreamUsageEvent>('chat:usage', (event) => {
      resolvedCallbacks.onUsage?.(event.payload);
    }));
    
    // Listen for session creation events
    unlisteners.push(await listen<{ session_id: string }>('chat:session', (event) => {
      resolvedCallbacks.onSessionCreated?.(event.payload.session_id);
    }));
    
    // Listen for completion events
    unlisteners.push(await listen<{ id?: string; content: string; reasoning?: string }>('chat:complete', (event) => {
      resolvedCallbacks.onComplete?.(
        event.payload.content,
        event.payload.id ?? null,
        null,
        event.payload.reasoning ?? null
      );
      // Clean up listeners after completion
      unlisteners.forEach(unlisten => unlisten());
      // Resolve the completion promise
      resolveCompletion();
    }));
    
    // Listen for error events
    unlisteners.push(await listen<{ error: string }>('chat:error', (event) => {
      resolvedCallbacks.onError?.(event.payload.error);
      // Clean up listeners after error
      unlisteners.forEach(unlisten => unlisten());
      // Resolve the completion promise
      resolveCompletion();
    }));
    
    // Build messages array: history + current user message
    const messages = [...history, { role: 'user', content: message }];
    
    // Call the backend command (don't await - it returns immediately)
    invoke('stream_chat_realtime', { messages, session_id: sessionId });
    resolvedCallbacks.onStatus?.('connected');
    
    // Wait for the completion event before returning
    await completionPromise;
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
  return wrapChatCall('respond_approval', { approval_id: approvalId, choice: approved ? 'approved' : 'denied' }, 'approval_error');
}

export async function respondClarify(clarifyId: string, response: string): Promise<void> {
  if (!isTauri()) return;
  return wrapChatCall('respond_clarify', { clarify_id: clarifyId, answer: response }, 'clarify_error');
}

export async function respondSecret(secretId: string, value: string): Promise<void> {
  if (!isTauri()) return;
  return wrapChatCall('respond_secret', { secret_id: secretId, value }, 'secret_error');
}

export async function abortChat(_sessionId: string): Promise<void> {
  if (!isTauri()) return;
  return wrapChatCall('abort_chat', {}, 'abort_error');
}

// 启动 Hermes Gateway
export async function startHermesGateway(): Promise<{ status: string; message?: string }> {
  if (!isTauri()) return { status: 'mock' };
  return wrapChatCall<{ status: string; message?: string }>('start_hermes_gateway', {}, 'gateway_error');
}

// 流式聊天消息（带进度回调）
export async function streamChatWithProgress(
  message: string,
  sessionId: string | null,
  onProgress?: (progress: number, status: string) => void
): Promise<void> {
  if (!isTauri()) return;
  
  try {
    const messages = [{ role: 'user' as const, content: message }];
    await invoke('stream_chat_with_progress', { 
      messages, 
      session_id: sessionId,
      on_progress: onProgress 
    });
  } catch (error) {
    const detail = getErrorDetail(error);
    logger.error(`[HermesChat] streamChatWithProgress failed: ${detail}`);
    throw new HermesApiError('stream_error', detail);
  }
}

// 流式聊天消息（基础版本）
export async function streamChatMessage(
  message: string,
  sessionId: string | null
): Promise<void> {
  if (!isTauri()) return;
  
  try {
    const messages = [{ role: 'user' as const, content: message }];
    await invoke('stream_chat_message', { messages, session_id: sessionId });
  } catch (error) {
    const detail = getErrorDetail(error);
    logger.error(`[HermesChat] streamChatMessage failed: ${detail}`);
    throw new HermesApiError('stream_error', detail);
  }
}
