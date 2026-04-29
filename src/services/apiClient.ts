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
