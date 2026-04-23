/**
 * Development-only logging utility
 * In production, all debug/info logs are disabled
 * Error and warn logs are always enabled
 */

const isDev = import.meta.env.DEV;

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.log('[DEBUG]', ...args);
    }
  },

  info: (...args: unknown[]) => {
    if (isDev) {
      console.info('[INFO]', ...args);
    }
  },

  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...args);
  },

  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
  },

  // For development tracing with component names
  component: (componentName: string, ...args: unknown[]) => {
    if (isDev) {
      console.log(`[${componentName}]`, ...args);
    }
  },

  // Group related logs together
  group: (label: string, fn: () => void) => {
    if (isDev) {
      console.group(label);
      fn();
      console.groupEnd();
    }
  },
};
