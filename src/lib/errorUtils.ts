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
