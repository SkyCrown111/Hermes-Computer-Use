/**
 * Sanitize paths used inside ZIP archives to prevent Zip Slip (path traversal).
 */
export function sanitizeZipEntryName(name: string): string | null {
  if (!name || !name.trim()) {
    return null;
  }

  const normalized = name.replace(/\\/g, '/').trim();

  if (normalized.startsWith('/') || normalized.includes('..')) {
    return null;
  }

  // Reject drive-letter absolute paths on Windows archives
  if (/^[a-zA-Z]:/.test(normalized)) {
    return null;
  }

  return normalized.replace(/^\/+/, '');
}

/**
 * Build a safe archive path for session export files.
 */
export function sessionExportZipName(sessionId: string): string {
  const safeId = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `sessions/session-${safeId}.json`;
}
