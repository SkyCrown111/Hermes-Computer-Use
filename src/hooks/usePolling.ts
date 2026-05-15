import { useEffect, useRef } from 'react';

interface UsePollingOptions {
  enabled?: boolean;
  immediate?: boolean;
}

export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  options: UsePollingOptions = {},
): void {
  const { enabled = true, immediate = true } = options;
  const callbackRef = useRef(callback);
  const runningRef = useRef(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    const run = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        await callbackRef.current();
      } finally {
        runningRef.current = false;
      }
    };

    if (immediate) {
      void run();
    }

    const timerId = setInterval(() => {
      if (!cancelled) {
        void run();
      }
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [enabled, immediate, intervalMs]);
}
