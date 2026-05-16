import { describe, expect, it } from 'vitest';
import { isSafeUrl } from '../safeUrl';

describe('isSafeUrl', () => {
  it('allows http and https', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://localhost:9119')).toBe(true);
  });

  it('allows mailto', () => {
    expect(isSafeUrl('mailto:user@example.com')).toBe(true);
  });

  it('allows relative paths and anchors', () => {
    expect(isSafeUrl('/assets/icon.png')).toBe(true);
    expect(isSafeUrl('./file.md')).toBe(true);
    expect(isSafeUrl('../docs/readme.md')).toBe(true);
    expect(isSafeUrl('#section')).toBe(true);
  });

  it('allows safe data:image URLs only', () => {
    expect(isSafeUrl('data:image/png;base64,abc')).toBe(true);
    expect(isSafeUrl('data:image/jpeg;base64,abc')).toBe(true);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('data:application/javascript,alert(1)')).toBe(false);
  });

  it('blocks javascript, vbscript, and file', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('FILE://C:/Windows/System32')).toBe(false);
  });

  it('blocks blob and unknown schemes', () => {
    expect(isSafeUrl('blob:https://example.com/uuid')).toBe(false);
    expect(isSafeUrl('custom-scheme:payload')).toBe(false);
  });

  it('blocks empty, whitespace, and free-form text', () => {
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('   ')).toBe(false);
    expect(isSafeUrl('not a url with spaces')).toBe(false);
  });

  it('blocks scheme-smuggling in relative-looking URLs', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('  javascript:alert(1)')).toBe(false);
  });
});
