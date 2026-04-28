import { safeInvoke, HermesApiError } from '../lib/tauri';
import { logger } from '../lib/logger';

export interface RequestOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

const DEFAULT_OPTIONS: RequestOptions = {
  timeout: 30000,
  retries: 1,
  retryDelay: 1000,
};

export { HermesApiError };

export class ApiClient {
  private defaultOptions: RequestOptions;

  constructor(options?: RequestOptions) {
    this.defaultOptions = { ...DEFAULT_OPTIONS, ...options };
  }

  async invoke<T>(command: string, args?: Record<string, unknown>, options?: RequestOptions): Promise<T> {
    const opts = { ...this.defaultOptions, ...options };
    let lastError: HermesApiError | null = null;
    const maxAttempts = opts.retries ?? 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await safeInvoke<T>(command, args);
        return result;
      } catch (error) {
        if (error instanceof HermesApiError) {
          lastError = error;
          if (error.code === 'not_found' || error.code === 'validation' || error.code === 'permission') {
            throw error;
          }
          if (attempt < maxAttempts) {
            logger.info(`[ApiClient] Retrying ${command} (attempt ${attempt + 1}/${maxAttempts})`);
            await this.delay(opts.retryDelay ?? 1000);
            continue;
          }
        } else {
          const detail = error instanceof Error ? error.message : String(error);
          lastError = new HermesApiError('unknown', detail);
        }
        throw lastError;
      }
    }

    throw lastError ?? new HermesApiError('unknown', 'Unknown error');
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
