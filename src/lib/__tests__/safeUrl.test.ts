import { describe, expect, it } from 'vitest';
import { isSafeUrl } from '../safeUrl';

describe('isSafeUrl', () => {
  it('allows http and https', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://localhost:9119')).toBe(true);
  });

  it('allows relative paths', () => {
    expect(isSafeUrl('/assets/icon.png')).toBe(true);
    expect(isSafeUrl('./file.md')).toBe(true);
    expect(isSafeUrl('#section')).toBe(true);
  });

  it('blocks javascript and vbscript', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
  });

  it('blocks empty and invalid', () => {
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('   ')).toBe(false);
    expect(isSafeUrl('not a url with spaces')).toBe(false);
  });
});
