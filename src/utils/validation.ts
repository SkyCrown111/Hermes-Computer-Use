// Validation utilities

/**
 * Validate cron expression or Hermes-style schedule
 * Supports:
 * - Standard cron: "0 9 * * *" (5 fields)
 * - Hermes interval: "every 30m", "every 1h"
 */
export function validateSchedule(schedule: string): { valid: boolean; error?: string } {
  if (!schedule || !schedule.trim()) {
    return { valid: false, error: 'Schedule is required' };
  }

  const trimmed = schedule.trim().toLowerCase();

  // Hermes-style interval: "every Xm" or "every Xh"
  const intervalMatch = trimmed.match(/^every\s+(\d+)([mh])$/);
  if (intervalMatch) {
    const amount = parseInt(intervalMatch[1], 10);
    const unit = intervalMatch[2];

    if (unit === 'm') {
      if (amount < 1 || amount > 1440) {
        return { valid: false, error: 'Minutes must be between 1 and 1440 (24 hours)' };
      }
    } else if (unit === 'h') {
      if (amount < 1 || amount > 168) {
        return { valid: false, error: 'Hours must be between 1 and 168 (1 week)' };
      }
    }

    return { valid: true };
  }

  // Standard cron: 5 fields
  const cronFields = trimmed.split(/\s+/);
  if (cronFields.length !== 5) {
    return { valid: false, error: 'Invalid format. Use "every Xm", "every Xh", or standard cron (5 fields)' };
  }

  // Validate each cron field
  const [minute, hour, dayOfMonth, month, dayOfWeek] = cronFields;

  const validateField = (value: string, min: number, max: number, name: string): boolean => {
    if (value === '*') return true;
    // Handle lists, ranges, and steps
    const parts = value.split(',');
    for (const part of parts) {
      // Step: */5 or 1-10/2
      if (part.includes('/')) {
        const [range, step] = part.split('/');
        if (!/^\d+$/.test(step)) return false;
        if (range !== '*' && !validateField(range, min, max, name)) return false;
        continue;
      }
      // Range: 1-5
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) return false;
        continue;
      }
      // Single value
      const num = parseInt(part, 10);
      if (isNaN(num) || num < min || num > max) return false;
    }
    return true;
  };

  if (!validateField(minute, 0, 59, 'minute')) {
    return { valid: false, error: 'Invalid minute field (0-59)' };
  }
  if (!validateField(hour, 0, 23, 'hour')) {
    return { valid: false, error: 'Invalid hour field (0-23)' };
  }
  if (!validateField(dayOfMonth, 1, 31, 'day of month')) {
    return { valid: false, error: 'Invalid day of month field (1-31)' };
  }
  if (!validateField(month, 1, 12, 'month')) {
    return { valid: false, error: 'Invalid month field (1-12)' };
  }
  if (!validateField(dayOfWeek, 0, 6, 'day of week')) {
    return { valid: false, error: 'Invalid day of week field (0-6, 0=Sunday)' };
  }

  return { valid: true };
}

/**
 * Validate numeric input with range constraints
 */
export function validateNumber(
  value: string,
  options: { min?: number; max?: number; integer?: boolean; required?: boolean }
): { valid: boolean; error?: string } {
  if (!value || !value.trim()) {
    if (options.required) {
      return { valid: false, error: 'This field is required' };
    }
    return { valid: true };
  }

  const num = parseFloat(value);

  if (isNaN(num)) {
    return { valid: false, error: 'Must be a valid number' };
  }

  if (options.integer && !Number.isInteger(num)) {
    return { valid: false, error: 'Must be an integer' };
  }

  if (options.min !== undefined && num < options.min) {
    return { valid: false, error: `Must be at least ${options.min}` };
  }

  if (options.max !== undefined && num > options.max) {
    return { valid: false, error: `Must be at most ${options.max}` };
  }

  return { valid: true };
}

/**
 * Validate API key format (basic check)
 */
export function validateApiKey(value: string): { valid: boolean; error?: string } {
  if (!value || !value.trim()) {
    return { valid: true }; // API key is optional
  }

  // Basic format check: should be reasonably long and contain alphanumeric chars
  const trimmed = value.trim();
  if (trimmed.length < 8) {
    return { valid: false, error: 'API key seems too short' };
  }

  // Check for obviously invalid characters
  if (!/^[a-zA-Z0-9_\-./+=]+$/.test(trimmed)) {
    return { valid: false, error: 'API key contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validate directory path
 */
export function validatePath(value: string): { valid: boolean; error?: string } {
  if (!value || !value.trim()) {
    return { valid: true }; // Optional
  }

  // Basic path validation - no obviously invalid chars
  const trimmed = value.trim();
  if (/[<>:"|?*]/.test(trimmed)) {
    return { valid: false, error: 'Path contains invalid characters' };
  }

  return { valid: true };
}
