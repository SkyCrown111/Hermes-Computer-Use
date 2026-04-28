import { useRef, useCallback } from 'react';
import { streamChatRealtime, respondApproval, abortChat } from '../services/hermesChat';
import type { StreamCallbacks } from '../services/hermesChat';
import { getErrorMessage } from '../lib/errorUtils';
import { logger } from '../lib/logger';

export interface StreamChatOptions {
  sessionId: string | null;
  onContentChunk?: (chunk: string, accumulated: string) => void;
  onReasoningChunk?: (text: string, accumulated: string) => void;
  onToolCall?: (tool: Record<string, unknown>) => void;
  onComplete?: (result: StreamCompleteResult) => void;
  onError?: (error: string) => void;
  onApproval?: (approval: Record<string, unknown>) => void;
  onStatusChange?: (status: 'idle' | 'streaming' | 'done' | 'error') => void;
  autoDenyApprovals?: boolean;
}

export interface StreamCompleteResult {
  content: string;
  reasoning: string | null;
  tools: Record<string, unknown>[];
  usage: Record<string, unknown> | null;
  newSessionId: string | null;
}

export function useStreamChat(options: StreamChatOptions) {
  const {
    sessionId,
    onContentChunk,
    onReasoningChunk,
    onToolCall,
    onComplete,
    onError,
    onApproval,
    onStatusChange,
    autoDenyApprovals = false,
  } = options;

  const isStoppedRef = useRef(false);
  const streamingContentRef = useRef('');
  const streamingReasoningRef = useRef('');
  const streamingToolsRef = useRef<Record<string, unknown>[]>([]);

  const resetStreamingState = useCallback(() => {
    streamingContentRef.current = '';
    streamingReasoningRef.current = '';
    streamingToolsRef.current = [];
  }, []);

  const stop = useCallback(() => {
    isStoppedRef.current = true;
  }, []);

  const send = useCallback(async (message: string, history?: Array<unknown>) => {
    isStoppedRef.current = false;
    resetStreamingState();
    onStatusChange?.('streaming');

    const callbacks: StreamCallbacks = {
      onChunk: (chunk, accumulated) => {
        if (isStoppedRef.current) return;
        streamingContentRef.current = accumulated;
        onContentChunk?.(chunk, accumulated);
      },
      onReasoning: (text, accumulated) => {
        if (isStoppedRef.current) return;
        streamingReasoningRef.current = accumulated;
        onReasoningChunk?.(text, accumulated);
      },
      onTool: (tool) => {
        if (isStoppedRef.current) return;
        streamingToolsRef.current = [...streamingToolsRef.current, tool as Record<string, unknown>];
        onToolCall?.(tool as Record<string, unknown>);
      },
      onComplete: (content, newSessionId, usage, reasoning) => {
        if (isStoppedRef.current) return;
        onStatusChange?.('done');
        onComplete?.({
          content: content || streamingContentRef.current,
          reasoning: reasoning || streamingReasoningRef.current || null,
          tools: streamingToolsRef.current.length > 0 ? [...streamingToolsRef.current] : [],
          usage,
          newSessionId,
        });
        resetStreamingState();
      },
      onError: (error) => {
        if (isStoppedRef.current) return;
        onStatusChange?.('error');
        const errorMessage = error instanceof Error ? error.message : String(error);
        onError?.(errorMessage);
        resetStreamingState();
      },
      onApproval: (approval) => {
        if (isStoppedRef.current) return;
        if (autoDenyApprovals) {
          respondApproval((approval as Record<string, unknown>).id as string, false).catch(() => {});
        } else {
          onApproval?.(approval as Record<string, unknown>);
        }
      },
    };

    try {
      await streamChatRealtime(message, sessionId, history, callbacks);
    } catch (error) {
      if (isStoppedRef.current) return;
      onStatusChange?.('error');
      const errorMessage = getErrorMessage(error);
      logger.error('[useStreamChat] Stream failed:', errorMessage);
      onError?.(errorMessage);
    }
  }, [sessionId, onContentChunk, onReasoningChunk, onToolCall, onComplete, onError, onApproval, onStatusChange, autoDenyApprovals, resetStreamingState]);

  const abort = useCallback(async () => {
    isStoppedRef.current = true;
    if (sessionId) {
      try {
        await abortChat(sessionId);
      } catch (err) {
        logger.error('[useStreamChat] Abort failed:', err);
      }
    }
    onStatusChange?.('idle');
    resetStreamingState();
  }, [sessionId, onStatusChange, resetStreamingState]);

  return {
    send,
    stop,
    abort,
    isStopped: isStoppedRef,
  };
}
