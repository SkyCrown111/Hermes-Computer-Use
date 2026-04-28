import { getErrorMessage } from '../lib/errorUtils';
import { logger } from '../lib/logger';

export interface AsyncActionOptions<T> {
  setLoadingKey: string;
  setErrorKey?: string;
  dataKey?: string;
  action: () => Promise<T>;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
  defaultValue?: T;
}

export function createAsyncAction<S extends Record<string, unknown>>(
  set: (partial: Partial<S> | ((state: S) => Partial<S>)) => void,
  _get: () => S
) {
  return async function asyncAction<T>(options: AsyncActionOptions<T>): Promise<T | null> {
    const { setLoadingKey, setErrorKey = 'error', dataKey, action, onSuccess, onError, defaultValue } = options;

    set({ [setLoadingKey]: true, [setErrorKey]: null } as Partial<S>);

    try {
      const data = await action();
      const updates: Partial<S> = { [setLoadingKey]: false } as Partial<S>;
      if (dataKey) {
        (updates as Record<string, unknown>)[dataKey] = data;
      }
      set(updates);
      onSuccess?.(data);
      return data;
    } catch (err) {
      const message = getErrorMessage(err);
      logger.error(`[AsyncAction] Failed: ${message}`);
      const updates: Partial<S> = { [setLoadingKey]: false, [setErrorKey]: message } as Partial<S>;
      set(updates);
      onError?.(message);
      return defaultValue ?? null;
    }
  };
}
