import { describe, it, expect } from 'vitest';
import { isToolDirectInvocable } from '../ipcToolPolicy';

describe('ipcToolPolicy', () => {
  it('blocks terminal and write tools', () => {
    expect(isToolDirectInvocable('terminal')).toBe(false);
    expect(isToolDirectInvocable('write_file')).toBe(false);
    expect(isToolDirectInvocable('apply_patch')).toBe(false);
  });

  it('allows read and search tools', () => {
    expect(isToolDirectInvocable('web_search')).toBe(true);
    expect(isToolDirectInvocable('read_file')).toBe(true);
  });
});
