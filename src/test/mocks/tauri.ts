// Mock Tauri invoke for tests
// This provides mock implementations of Tauri commands

interface MockHandler {
  (cmd: string, args?: Record<string, unknown>): unknown;
}

let mockHandlers: Map<string, MockHandler> = new Map();
let fallbackHandler: MockHandler | null = null;

/**
 * Register a mock handler for a specific Tauri command.
 */
export function mockTauriCommand(cmd: string, handler: MockHandler): void {
  mockHandlers.set(cmd, handler);
}

/**
 * Register a fallback handler for any unmatched command.
 */
export function mockTauriFallback(handler: MockHandler): void {
  fallbackHandler = handler;
}

/**
 * Clear all registered mock handlers.
 */
export function resetMocks(): void {
  mockHandlers.clear();
  fallbackHandler = null;
}

/**
 * Mock Tauri invoke function.
 * Call this as:
 *   vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
 */
export async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const handler = mockHandlers.get(cmd) || fallbackHandler;

  if (!handler) {
    throw new Error(`[MockTauri] No mock handler registered for command: ${cmd}`);
  }

  return handler(cmd, args) as T;
}

/**
 * Convenience: register a mock that returns a static value.
 */
export function mockTauriReturn(cmd: string, value: unknown): void {
  mockTauriCommand(cmd, () => value);
}

/**
 * Convenience: register a mock that throws an error.
 */
export function mockTauriError(cmd: string, errorMessage: string): void {
  mockTauriCommand(cmd, () => {
    throw new Error(errorMessage);
  });
}
