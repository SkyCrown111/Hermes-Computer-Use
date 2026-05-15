import { describe, expect, it } from 'vitest';
import { sanitizeZipEntryName, sessionExportZipName } from '../zipSafe';

describe('zipSafe', () => {
  it('allows normal relative paths', () => {
    expect(sanitizeZipEntryName('sessions/foo.json')).toBe('sessions/foo.json');
  });

  it('blocks parent traversal', () => {
    expect(sanitizeZipEntryName('../etc/passwd')).toBeNull();
    expect(sanitizeZipEntryName('sessions/../../secret')).toBeNull();
  });

  it('blocks absolute paths', () => {
    expect(sanitizeZipEntryName('/etc/passwd')).toBeNull();
    expect(sanitizeZipEntryName('C:/Windows/system.ini')).toBeNull();
  });

  it('sanitizes session export names', () => {
    expect(sessionExportZipName('abc-123')).toBe('sessions/session-abc-123.json');
    expect(sessionExportZipName('../bad')).toBe('sessions/session-.._bad.json');
  });
});
