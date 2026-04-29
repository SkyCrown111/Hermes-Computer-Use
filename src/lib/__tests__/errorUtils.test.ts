import { describe, it, expect } from 'vitest';
import { getErrorMessage, formatErrorMessage } from '../errorUtils';

describe('getErrorMessage', () => {
  it('extracts message from Error instances', () => {
    expect(getErrorMessage(new Error('something broke'))).toBe('something broke');
  });

  it('extracts message from DOMException', () => {
    const domEx = new DOMException('dom error', 'AbortError');
    expect(getErrorMessage(domEx)).toBe('dom error');
  });

  it('returns string errors as-is', () => {
    expect(getErrorMessage('plain string')).toBe('plain string');
  });

  it('extracts message from objects with a message property', () => {
    expect(getErrorMessage({ message: 'obj error' })).toBe('obj error');
  });

  it('stringifies unknown types', () => {
    expect(getErrorMessage(42)).toBe('42');
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
  });
});

describe('formatErrorMessage', () => {
  it('prepends prefix to error message', () => {
    expect(formatErrorMessage('API', new Error('fail'))).toBe('API: fail');
  });

  it('works with string errors', () => {
    expect(formatErrorMessage('Upload', 'too large')).toBe('Upload: too large');
  });
});
