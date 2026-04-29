/**
 * Shared constants for the services/API layer.
 *
 * Centralises default paths, timeouts, and other magic values so they
 * can be changed in one place.
 */

/** Base directory for all Hermes user data. */
export const HERMES_DATA_DIR = '~/.hermes';

/** Default fallback paths used when the backend cannot be reached. */
export const DEFAULT_PATHS = {
  dataDir: HERMES_DATA_DIR,
  sessions: `${HERMES_DATA_DIR}/sessions`,
  skills: `${HERMES_DATA_DIR}/skills`,
  memories: `${HERMES_DATA_DIR}/memories`,
  cron: `${HERMES_DATA_DIR}/cron`,
} as const;
