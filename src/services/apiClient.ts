// Unified API Client — request/response interceptor layer
// Wraps safeInvoke with retry, logging, error handling, and abort support

import { safeInvoke } from '../lib/tauri';
import { logger } from '../lib/logger';
import { toast } from '../stores/toastStore';

// ─── Types ───────────────────────────────────────────

export interface ApiErrorData {
  code: string;
  message: string;
  command: string;
  originalError?: unknown;
}

export class ApiError extends Error {
  public code: string;
  public command: string;
  public originalError?: unknown;

  constructor(data: ApiErrorData) {
    super(data.message);
    this.name = 'ApiError';
    this.code = data.code;
    this.command = data.command;
    this.originalError = data.originalError;
  }
}

export type ErrorCategory = 'network' | 'timeout' | 'not_found' | 'permission' | 'validation' | 'unknown';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryOn: (error: unknown) => boolean;
}

export interface InvokeOptions {
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Override default retry config */
  retry?: Partial<RetryConfig>;
  /** Suppress error toast (for silent background operations) */
  silent?: boolean;
  /** Request label for logging */
  label?: string;
}

// ─── Defaults ────────────────────────────────────────

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 2,
  baseDelayMs: 300,
  maxDelayMs: 3000,
  retryOn: (err: unknown) => {
    // Retry on network errors and timeouts
    if (err instanceof ApiError) {
      return err.code === 'NETWORK' || err.code === 'TIMEOUT';
    }
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      return msg.includes('network') || msg.includes('timeout') || msg.includes('econnrefused');
    }
    return false;
  },
};

// ─── Utilities ───────────────────────────────────────

function classifyError(err: unknown, cmd: string): ApiError {
  if (err instanceof ApiError) return err;

  const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const msgLower = message.toLowerCase();

  let code: ErrorCategory;
  if (msgLower.includes('network') || msgLower.includes('econnrefused') || msgLower.includes('fetch')) {
    code = 'network';
  } else if (msgLower.includes('timeout')) {
    code = 'timeout';
  } else if (msgLower.includes('not found') || msgLower.includes('404')) {
    code = 'not_found';
  } else if (msgLower.includes('permission') || msgLower.includes('denied') || msgLower.includes('forbidden')) {
    code = 'permission';
  } else if (msgLower.includes('validation') || msgLower.includes('invalid')) {
    code = 'validation';
  } else {
    code = 'unknown';
  }

  return new ApiError({
    code,
    message,
    command: cmd,
    originalError: err,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  signal?: AbortSignal
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Check for cancellation before each attempt
      if (signal?.aborted) {
        throw new ApiError({
          code: 'ABORTED',
          message: 'Request was cancelled',
          command: '',
        });
      }

      return await fn();
    } catch (err) {
      lastError = err;

      // Don't retry if aborted
      if (err instanceof ApiError && err.code === 'ABORTED') throw err;

      // Check if we should retry
      if (attempt < config.maxRetries && config.retryOn(err)) {
        const backoff = Math.min(
          config.baseDelayMs * Math.pow(2, attempt),
          config.maxDelayMs
        );
        logger.warn(`[ApiClient] Retry attempt ${attempt + 1}/${config.maxRetries} after ${backoff}ms`);
        await delay(backoff);

        // Check for cancellation during backoff
        if (signal?.aborted) {
          throw new ApiError({
            code: 'ABORTED',
            message: 'Request was cancelled during retry backoff',
            command: '',
          });
        }

        continue;
      }

      throw err;
    }
  }

  throw lastError;
}

// ─── ApiClient ───────────────────────────────────────

export class ApiClient {
  private defaultRetry: RetryConfig;

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.defaultRetry = { ...DEFAULT_RETRY, ...retryConfig };
  }

  /**
   * Invoke a Tauri command through the unified client.
   *
   * Features:
   * - Request/response logging
   * - Retry with exponential backoff
   * - Unified error classification
   * - Optional error toast
   * - AbortController support
   */
  async invoke<T = unknown>(
    cmd: string,
    args?: Record<string, unknown>,
    options?: InvokeOptions
  ): Promise<T> {
    const label = options?.label || cmd;
    const retryConfig = { ...this.defaultRetry, ...options?.retry };

    // Request logging
    logger.debug(`[ApiClient] → ${label}`, args ? args : '');

    // Check pre-abort
    if (options?.signal?.aborted) {
      throw new ApiError({
        code: 'ABORTED',
        message: `Request "${label}" was cancelled before starting`,
        command: cmd,
      });
    }

    try {
      const result = await withRetry<T>(
        () => safeInvoke<T>(cmd, args),
        retryConfig,
        options?.signal
      );

      // Response logging
      logger.debug(`[ApiClient] ← ${label}`, result);

      return result;
    } catch (err) {
      const apiError = classifyError(err, cmd);

      // Log error
      logger.error(`[ApiClient] ✗ ${label}`, apiError);

      // Show toast for non-silent errors
      if (!options?.silent) {
        const userMessage = this.getUserMessage(apiError);
        toast.error(`Request failed: ${label}`, userMessage, 5000);
      }

      throw apiError;
    }
  }

  /**
   * Create an AbortController and return it alongside a typed invoke.
   * Usage:
   *   const [result, cancel] = apiClient.invokeWithCancel<T>('cmd', args);
   *   cancel(); // to abort
   */
  invokeWithCancel<T = unknown>(
    cmd: string,
    args?: Record<string, unknown>,
    options?: InvokeOptions
  ): { promise: Promise<T>; cancel: () => void } {
    const controller = new AbortController();
    const promise = this.invoke<T>(cmd, args, {
      ...options,
      signal: controller.signal,
    });
    return {
      promise,
      cancel: () => controller.abort(),
    };
  }

  private getUserMessage(error: ApiError): string {
    switch (error.code) {
      case 'network':
        return 'Unable to reach Hermes Gateway. Is it running?';
      case 'timeout':
        return 'Request timed out. Please try again.';
      case 'not_found':
        return 'The requested resource was not found.';
      case 'permission':
        return 'Permission denied. Check your configuration.';
      case 'validation':
        return 'Invalid request parameters.';
      default:
        return error.message.length > 100
          ? error.message.slice(0, 100) + '...'
          : error.message;
    }
  }
}

// ─── Singleton ──────────────────────────────────────

/**
 * Default API client instance.
 * Use this for most Tauri command invocations.
 */
export const apiClient = new ApiClient();
