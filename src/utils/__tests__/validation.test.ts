import { describe, it, expect } from 'vitest';
import { validateSchedule, validateNumber, validateApiKey, validatePath } from '../validation';

describe('validateSchedule', () => {
  it('rejects empty input', () => {
    expect(validateSchedule('')).toEqual({ valid: false, error: 'Schedule is required' });
    expect(validateSchedule('   ')).toEqual({ valid: false, error: 'Schedule is required' });
  });

  it('accepts valid interval: every 30m', () => {
    expect(validateSchedule('every 30m')).toEqual({ valid: true });
  });

  it('accepts valid interval: every 1h', () => {
    expect(validateSchedule('every 1h')).toEqual({ valid: true });
  });

  it('rejects interval with 0 minutes', () => {
    expect(validateSchedule('every 0m')).toEqual({ valid: false, error: 'Minutes must be between 1 and 1440 (24 hours)' });
  });

  it('rejects interval exceeding 1440 minutes', () => {
    expect(validateSchedule('every 1441m')).toEqual({ valid: false, error: 'Minutes must be between 1 and 1440 (24 hours)' });
  });

  it('rejects interval exceeding 168 hours', () => {
    expect(validateSchedule('every 169h')).toEqual({ valid: false, error: 'Hours must be between 1 and 168 (1 week)' });
  });

  it('accepts standard 5-field cron', () => {
    expect(validateSchedule('0 9 * * *')).toEqual({ valid: true });
    expect(validateSchedule('*/5 * * * *')).toEqual({ valid: true });
    expect(validateSchedule('0 0 1 1 *')).toEqual({ valid: true });
  });

  it('rejects cron with wrong number of fields', () => {
    expect(validateSchedule('0 9 * *')).toEqual({
      valid: false,
      error: 'Invalid format. Use "every Xm", "every Xh", or standard cron (5 fields)',
    });
  });

  it('rejects out-of-range minute', () => {
    expect(validateSchedule('60 * * * *')).toEqual({ valid: false, error: 'Invalid minute field (0-59)' });
  });

  it('rejects out-of-range hour', () => {
    expect(validateSchedule('* 24 * * *')).toEqual({ valid: false, error: 'Invalid hour field (0-23)' });
  });

  it('accepts ranges and steps in cron fields', () => {
    expect(validateSchedule('1-5/2 * * * *')).toEqual({ valid: true });
    expect(validateSchedule('0,30 * * * *')).toEqual({ valid: true });
  });
});

describe('validateNumber', () => {
  it('accepts empty when not required', () => {
    expect(validateNumber('', {})).toEqual({ valid: true });
  });

  it('rejects empty when required', () => {
    expect(validateNumber('', { required: true })).toEqual({ valid: false, error: 'This field is required' });
  });

  it('rejects non-numeric input', () => {
    expect(validateNumber('abc', {})).toEqual({ valid: false, error: 'Must be a valid number' });
  });

  it('validates integer constraint', () => {
    expect(validateNumber('3.5', { integer: true })).toEqual({ valid: false, error: 'Must be an integer' });
    expect(validateNumber('3', { integer: true })).toEqual({ valid: true });
  });

  it('validates min/max range', () => {
    expect(validateNumber('5', { min: 10 })).toEqual({ valid: false, error: 'Must be at least 10' });
    expect(validateNumber('100', { max: 50 })).toEqual({ valid: false, error: 'Must be at most 50' });
    expect(validateNumber('25', { min: 0, max: 100 })).toEqual({ valid: true });
  });
});

describe('validateApiKey', () => {
  it('accepts empty (optional)', () => {
    expect(validateApiKey('')).toEqual({ valid: true });
  });

  it('rejects too-short keys', () => {
    expect(validateApiKey('abc')).toEqual({ valid: false, error: 'API key seems too short' });
  });

  it('rejects keys with invalid characters', () => {
    expect(validateApiKey('sk-test@key!')).toEqual({ valid: false, error: 'API key contains invalid characters' });
  });

  it('accepts valid API key format', () => {
    expect(validateApiKey('sk-test123456789')).toEqual({ valid: true });
  });
});

describe('validatePath', () => {
  it('accepts empty (optional)', () => {
    expect(validatePath('')).toEqual({ valid: true });
  });

  it('rejects paths with invalid characters', () => {
    expect(validatePath('C:\\Users<>test')).toEqual({ valid: false, error: 'Path contains invalid characters' });
  });

  it('accepts valid paths', () => {
    expect(validatePath('/home/user/data')).toEqual({ valid: true });
    expect(validatePath('.\\relative\\path')).toEqual({ valid: true });
  });
});
