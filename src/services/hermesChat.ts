// Hermes Chat API Client
// Uses Tauri commands to bypass CORS restrictions

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { logger } from '../lib/logger';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatResult {
  response: string;
  sessionId: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type ChatStatus = 'idle' | 'thinking' | 'streaming' | 'complete' | 'error';

export interface StreamCallbacks {
  onStatus?: (status: string, message: string) => void;
  onChunk?: (content: string, accumulated: string) => void;
  onReasoning?: (text: string, accumulated: string) => void;
  onTool?: (tool: { event_type: string; name: string; preview?: string; args?: Record<string, unknown>; duration?: number; is_error?: boolean }) => void;
  onUsage?: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => void;
  onComplete?: (content: string, sessionId: string, usage?: ChatResult['usage']) => void;
  onError?: (error: Error) => void;
  onApproval?: (approval: { id: string; command: string; description: string; allow_permanent: boolean; choices: string[] }) => void;
  onSessionCreated?: (sessionId: string) => void; // Called when session is created
}

/**
 * Check if Hermes API is available
 */
export async function checkHermesApiHealth(): Promise<boolean> {
  try {
    const result = await invoke<boolean>('check_hermes_health');
    logger.debug('[HermesChat] Health check result:', result);
    return result;
  } catch (error) {
    logger.error('[HermesChat] Health check error:', error);
    return false;
  }
}

/**
 * Send a chat message to Hermes Agent
 */
export async function sendChatMessage(
  message: string,
  sessionId: string | undefined,
  history: ChatMessage[] = []
): Promise<{ response: string; sessionId: string }> {
  logger.debug('[HermesChat] Sending message:', message.substring(0, 50));
  logger.debug('[HermesChat] Session ID:', sessionId);

  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message }
  ];

  try {
    const response = await invoke<string>('stream_chat_message', {
      messages,
      sessionId: sessionId || null,
    });

    logger.debug('[HermesChat] Raw response:', response);

    // Parse hermes CLI output format: "session_id: <id>\n<response>"
    const lines = response.split('\n');
    let newSessionId = sessionId || '';
    let responseContent = response;

    if (lines[0]?.startsWith('session_id:')) {
      newSessionId = lines[0].replace('session_id:', '').trim();
      responseContent = lines.slice(1).join('\n').trim();
    }

    return {
      response: responseContent,
      sessionId: newSessionId,
    };
  } catch (error) {
    logger.error('[HermesChat] Error:', error);
    throw error;
  }
}

/**
 * Respond to an approval request
 */
export async function respondApproval(approvalId: string, choice: 'once' | 'session' | 'always' | 'deny'): Promise<void> {
  logger.debug('[HermesChat] Responding to approval:', approvalId, choice);
  await invoke('respond_approval', { approvalId, choice });
}

/**
 * Abort the currently running chat stream
 */
export async function abortChat(): Promise<void> {
  logger.debug('[HermesChat] Aborting chat...');
  await invoke('abort_chat');
}

/**
 * Stream a chat message with real-time events
 * This is the new streaming implementation with true real-time updates
 */
export async function streamChatRealtime(
  message: string,
  sessionId: string | undefined,
  history: ChatMessage[],
  callbacks: StreamCallbacks
): Promise<void> {
  logger.debug('[HermesChat] Starting realtime stream:', message.substring(0, 50));
  logger.debug('[HermesChat] Starting realtime stream, sessionId:', sessionId);

  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message }
  ];

  // Set up event listeners
  const unlisteners: UnlistenFn[] = [];
  let fullContent = '';

  // Create a promise that resolves when chat:complete is received
  let completeResolve: () => void;
  const completePromise = new Promise<void>((resolve) => {
    completeResolve = resolve;
  });

  try {
    // Listen for status updates
    unlisteners.push(
      await listen<{ status: string; message: string }>('chat:status', (event) => {
        logger.debug('[HermesChat] Status event:', event.payload);
        callbacks.onStatus?.(event.payload.status, event.payload.message);
      })
    );

    // Listen for content chunks
    unlisteners.push(
      await listen<{ content: string; accumulated: string }>('chat:chunk', (event) => {
        logger.debug('[HermesChat] Chunk event:', event.payload);
        fullContent = event.payload.accumulated;
        callbacks.onChunk?.(event.payload.content, fullContent);
      })
    );

    // Listen for reasoning
    unlisteners.push(
      await listen<{ text: string; accumulated: string }>('chat:reasoning', (event) => {
        logger.debug('[HermesChat] Reasoning event:', event.payload);
        callbacks.onReasoning?.(event.payload.text, event.payload.accumulated);
      })
    );

    // Listen for tool calls
    unlisteners.push(
      await listen<{ event_type: string; name: string; preview?: string; args?: Record<string, unknown>; duration?: number; is_error?: boolean }>('chat:tool', (event) => {
        logger.debug('[HermesChat] Tool event:', event.payload);
        callbacks.onTool?.(event.payload);
      })
    );

    // Listen for usage updates
    unlisteners.push(
      await listen<{ prompt_tokens: number; completion_tokens: number; total_tokens: number }>('chat:usage', (event) => {
        logger.debug('[HermesChat] Usage event:', event.payload);
        callbacks.onUsage?.(event.payload);
      })
    );

    // Listen for completion
    unlisteners.push(
      await listen<{ id: string; content: string; reasoning?: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }>('chat:complete', (event) => {
        logger.debug('[HermesChat] Complete event:', event.payload);
        logger.debug('[HermesChat] Complete content length:', event.payload.content?.length);
        logger.debug('[HermesChat] Complete reasoning:', event.payload.reasoning?.substring(0, 100));
        // Use accumulated content if event content is empty
        const finalContent = event.payload.content || fullContent;
        callbacks.onComplete?.(finalContent, event.payload.id, event.payload.usage);
        // Resolve the promise to signal completion
        completeResolve();
      })
    );

    // Listen for errors
    unlisteners.push(
      await listen<{ error: string }>('chat:error', (event) => {
        logger.error('[HermesChat] Error event:', event.payload);
        callbacks.onError?.(new Error(event.payload.error));
        // Also resolve on error to avoid hanging
        completeResolve();
      })
    );

    // Listen for approval requests
    unlisteners.push(
      await listen<{ id: string; command: string; description: string; allow_permanent: boolean; choices: string[] }>('chat:approval', (event) => {
        logger.debug('[HermesChat] Approval event:', event.payload);
        callbacks.onApproval?.(event.payload);
      })
    );

    // Listen for session creation (emitted immediately when session is created)
    unlisteners.push(
      await listen<{ session_id: string; created_at: number }>('chat:session', (event) => {
        logger.debug('[HermesChat] Session created:', event.payload);
        callbacks.onSessionCreated?.(event.payload.session_id);
      })
    );

    logger.debug('[HermesChat] Invoking stream_chat_realtime command...');
    // Call the streaming command
    const result = await invoke<string>('stream_chat_realtime', {
      messages,
      sessionId: sessionId || null,
    });
    logger.debug('[HermesChat] Command returned:', result);

    // Wait for the chat:complete event before cleaning up listeners
    // This ensures we don't miss the final event
    await completePromise;

  } catch (error) {
    logger.error('[HermesChat] Stream error:', error);
    callbacks.onError?.(error as Error);
  } finally {
    // Clean up all listeners
    for (const unlisten of unlisteners) {
      unlisten();
    }
  }
}

/**
 * Stream a chat message with status updates (legacy)
 */
export async function streamChatMessageAsync(
  message: string,
  sessionId: string | undefined,
  history: ChatMessage[],
  onStatus: (status: ChatStatus, message?: string) => void,
  onComplete: (response: string, sessionId: string, usage?: ChatResult['usage']) => void,
  onError: (error: Error) => void
): Promise<void> {
  logger.debug('[HermesChat] Sending message (async):', message.substring(0, 50));

  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message }
  ];

  // Set up status listener
  let unlisten: UnlistenFn | null = null;

  try {
    unlisten = await listen<{ status: string; message: string }>('chat:status', (event) => {
      logger.debug('[HermesChat] Status event:', event.payload);
      const { status, message: msg } = event.payload;
      onStatus(status as ChatStatus, msg);
    });

    // Call the async command
    const response = await invoke<string>('stream_chat_with_progress', {
      messages,
      sessionId: sessionId || null,
    });

    logger.debug('[HermesChat] Raw response:', response);

    // Parse hermes CLI output format: "session_id: <id>\n<response>"
    const lines = response.split('\n');
    let newSessionId = sessionId || '';
    let content = response;

    if (lines[0]?.startsWith('session_id:')) {
      newSessionId = lines[0].replace('session_id:', '').trim();
      content = lines.slice(1).join('\n').trim();
    }

    // Approximate usage based on content length
    const usage = {
      prompt_tokens: messages.length * 100,
      completion_tokens: Math.ceil(content.length / 4),
      total_tokens: messages.length * 100 + Math.ceil(content.length / 4)
    };

    onComplete(content, newSessionId, usage);
  } catch (error) {
    logger.error('[HermesChat] Error:', error);
    onError(error as Error);
  } finally {
    if (unlisten) {
      unlisten();
    }
  }
}

/**
 * Stream a chat message from Hermes Agent (legacy simulated streaming)
 */
export async function streamChatMessage(
  message: string,
  sessionId: string | undefined,
  history: ChatMessage[],
  onChunk: (chunk: string) => void,
  onComplete: (sessionId: string) => void,
  onError: (error: Error) => void
): Promise<void> {
  logger.debug('[HermesChat] Sending message (simulated streaming):', message.substring(0, 50));

  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message }
  ];

  try {
    const response = await invoke<string>('stream_chat_message', {
      messages,
      sessionId: sessionId || null,
    });

    logger.debug('[HermesChat] Raw response:', response);

    // Parse hermes CLI output format: "session_id: <id>\n<response>"
    const lines = response.split('\n');
    let newSessionId = sessionId || '';
    let content = response;

    if (lines[0]?.startsWith('session_id:')) {
      newSessionId = lines[0].replace('session_id:', '').trim();
      content = lines.slice(1).join('\n').trim();
    }

    // Simulate streaming by sending chunks
    const words = content.split(' ');
    let accumulated = '';

    for (let i = 0; i < words.length; i++) {
      accumulated += (i > 0 ? ' ' : '') + words[i];
      onChunk(accumulated);
      // Small delay for visual effect
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    onComplete(newSessionId);
  } catch (error) {
    logger.error('[HermesChat] Error:', error);
    onError(error as Error);
  }
}
