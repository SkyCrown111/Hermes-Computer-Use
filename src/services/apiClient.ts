import { safeInvoke, HermesApiError } from '../lib/tauri';
import { logger } from '../lib/logger';

export interface RequestOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

const DEFAULT_OPTIONS: Required<RequestOptions> = {
  timeout: 30000,
  retries: 1,
  retryDelay: 1000,
};

/** Error codes that should never be retried (client errors). */
const NON_RETRIABLE_CODES = new Set(['not_found', 'validation', 'permission']);

export { HermesApiError };

export class ApiClient {
  private defaultOptions: Required<RequestOptions>;
  private inflightRequests = new Map<string, Promise<unknown>>();

  constructor(options?: RequestOptions) {
    this.defaultOptions = { ...DEFAULT_OPTIONS, ...options };
  }

  async invoke<T>(command: string, args?: Record<string, unknown>, options?: RequestOptions): Promise<T> {
    const opts = { ...this.defaultOptions, ...options };
    let lastError: HermesApiError | null = null;
    const maxAttempts = opts.retries;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.invokeWithTimeout<T>(command, args, opts.timeout);
        return result;
      } catch (error) {
        const hermesError = this.toHermesError(error);

        // Non-retriable errors are thrown immediately regardless of attempt count.
        if (NON_RETRIABLE_CODES.has(hermesError.code)) {
          throw hermesError;
        }

        lastError = hermesError;

        if (attempt < maxAttempts) {
          logger.info(`[ApiClient] Retrying ${command} (attempt ${attempt + 1}/${maxAttempts})`);
          await this.delay(opts.retryDelay);
          continue;
        }
      }
    }

    throw lastError ?? new HermesApiError('unknown', 'Unknown error');
  }

  async invokeShared<T>(command: string, args?: Record<string, unknown>, options?: RequestOptions): Promise<T> {
    const key = `${command}:${this.stableStringify(args)}`;
    const existing = this.inflightRequests.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const request = this.invoke<T>(command, args, options).finally(() => {
      this.inflightRequests.delete(key);
    });

    this.inflightRequests.set(key, request);
    return request;
  }

  /**
   * Wraps safeInvoke with a timeout. If the timeout elapses before the
   * promise settles, a HermesApiError with code 'timeout' is thrown.
   */
  private async invokeWithTimeout<T>(command: string, args: Record<string, unknown> | undefined, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new HermesApiError('timeout', `Command "${command}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([safeInvoke<T>(command, args), timeoutPromise]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /**
   * Normalises any thrown value into a HermesApiError.
   */
  private toHermesError(error: unknown): HermesApiError {
    if (error instanceof HermesApiError) return error;
    const detail = error instanceof Error ? error.message : String(error);
    return new HermesApiError('unknown', detail);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private stableStringify(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;

    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    return `{${entries.map(([entryKey, entryValue]) => `${JSON.stringify(entryKey)}:${this.stableStringify(entryValue)}`).join(',')}}`;
  }
}

export const apiClient = new ApiClient();

export function createApiError(code: string, detail: string): HermesApiError {
  return new HermesApiError(code, detail);
}

export function isApiError(error: unknown): error is HermesApiError {
  return error instanceof HermesApiError;
}

export function getErrorDetail(error: unknown): string {
  if (error instanceof HermesApiError) return error.detail;
  if (error instanceof Error) return error.message;
  return String(error ?? 'Unknown error');
}
