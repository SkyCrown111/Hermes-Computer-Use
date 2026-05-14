/**
 * Error handling utility functions
 * Provides type-safe error message extraction
 */

/**
 * Safely extracts an error message from unknown error types.
 * Handles Error, DOMException, string, and object with message property.
 *
 * @param err - The unknown error to extract message from
 * @returns A string representation of the error message
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err instanceof DOMException) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/**
 * Cleans error messages from backend debug output.
 * Strips DEBUG: lines and extracts the actual error message.
 *
 * @param err - The unknown error to clean and extract message from
 * @returns A clean error message without debug noise
 */
export function cleanErrorMessage(err: unknown): string {
  const raw = getErrorMessage(err);
  // Strip DEBUG: lines that the gateway includes in error output
  const lines = raw.split('\n').filter(line => !line.trim().startsWith('DEBUG:'));
  // Find the actual error: look for "Process failed:" or use first non-empty line
  const cleaned = lines.join('\n').trim();
  const processFailed = cleaned.match(/Process failed:\s*(.*)/s);
  if (processFailed) return processFailed[1].trim() || cleaned;
  return cleaned || 'Unknown error';
}

/**
 * Creates a formatted error message with a prefix.
 * Useful for API error responses.
 *
 * @param prefix - The prefix to prepend to the error message
 * @param err - The unknown error to extract message from
 * @returns A formatted error string: "prefix: message"
 */
export function formatErrorMessage(prefix: string, err: unknown): string {
  return `${prefix}: ${getErrorMessage(err)}`;
}
