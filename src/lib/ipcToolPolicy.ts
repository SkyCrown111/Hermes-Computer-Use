/**
 * Mirrors Rust `is_tool_direct_invocable` for browser-side filtering and messaging.
 */
const BLOCKED_EXACT = new Set([
  'run_terminal_cmd',
  'run_terminal',
  'terminal',
  'execute_shell',
  'shell',
  'bash',
  'computer_use',
  'computer',
  'write_file',
  'edit_file',
  'delete_file',
  'apply_patch',
  'create_file',
  'run_command',
]);

const BLOCKED_FRAGMENTS = [
  'terminal',
  'shell',
  'bash',
  'execute',
  'exec_',
  'write_',
  'delete_',
  'remove_',
  'patch',
  'computer_use',
];

export function isToolDirectInvocable(toolName: string): boolean {
  const name = toolName.trim();
  if (!name) return false;
  const lower = name.toLowerCase();
  if (BLOCKED_EXACT.has(lower)) return false;
  return !BLOCKED_FRAGMENTS.some((frag) => lower.includes(frag));
}
