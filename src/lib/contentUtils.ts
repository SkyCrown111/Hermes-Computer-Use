/**
 * Content normalization utilities for chat message display.
 * Strips tool output dumps, JSON fragments, and other noise from message content.
 */

// Pre-compiled regex patterns for JSON tool output removal (applied once per normalization)
const JSON_TOOL_PATTERNS: RegExp[] = [
  /^\s*\{"success":\s*(?:true|false).*\}\s*$/gm,
  /^\s*\{"output":\s*".*$/gm,
  /^\s*\{"bytes_written":\s*\d+.*$/gm,
  /^\s*\{"total_count":.*$/gm,
  /^\s*\{"total_lines":\s*\d+.*$/gm,
  /^\s*\{"file_size":\s*\d+.*$/gm,
  /^\s*\{"content":\s*".*"total_lines".*$/gm,
  /^\s*\{"content":\s*".*"file_size".*$/gm,
  /^\s*\{"content":\s*".*"_warning".*$/gm,
  /^\s*\{"content":\s*".*"is_binary".*$/gm,
  /^\s*\{"session_id":.*"pid".*$/gm,
  /^\s*"total_lines":\s*\d+.*$/gm,
  /^\s*"file_size":\s*\d+.*$/gm,
  /^\s*"truncated":\s*(?:true|false).*$/gm,
  /^\s*"hint":\s*"[^"]*".*$/gm,
  /^\s*"is_binary":\s*(?:true|false).*$/gm,
  /^\s*"is_image":\s*(?:true|false).*$/gm,
  /^\s*"files_modified":\s*\[.*$/gm,
  /^\s*"lint":\s*\{.*$/gm,
  /^\s*"_warning":\s*"[^"]*".*$/gm,
];

// Malformed Markdown link pattern
const MALFORMED_MD_LINK = /\[[a-zA-Z_][\w.]*\]\(https?:\/\/[\w.]+\)/g;

// File content dump pattern (line-number prefixed)
const FILE_LINE_DUMP = /^\s*\d+\|.*$/gm;

/**
 * Normalize message content for display.
 * Strips escape sequences, tool output dumps, and JSON noise.
 */
export function normalizeContent(content: string): string {
  if (!content) return '';
  let clean = content;
  // Order matters: process \\\\ (escaped backslash) before \\\\n etc.
  clean = clean.replace(/\\\\n/g, '\n');
  clean = clean.replace(/\\\\r/g, '\r');
  clean = clean.replace(/\\\\t/g, '\t');
  clean = clean.replace(/\\"/g, '"');
  clean = clean.replace(/\r\n/g, '\n');
  clean = clean.replace(/\r/g, '\n');
  clean = clean.replace(/\n{3,}/g, '\n\n');

  // Remove tool output dumps embedded in content
  const stripped = clean.trim();
  if (stripped.startsWith('{') && (
    stripped.includes('"total_lines"') ||
    stripped.includes('"file_size"') ||
    stripped.includes('"bytes_written"') ||
    stripped.includes('"files_modified"') ||
    stripped.includes('"_warning"') ||
    stripped.includes('"is_binary"') ||
    stripped.includes('"dirs_created"')
  )) {
    return '';
  }

  // Apply pre-compiled JSON tool output patterns
  for (const pattern of JSON_TOOL_PATTERNS) {
    clean = clean.replace(pattern, '');
  }

  // File content dumps with line numbers
  clean = clean.replace(FILE_LINE_DUMP, '');

  // Malformed Markdown links (reset lastIndex since we reuse the regex)
  MALFORMED_MD_LINK.lastIndex = 0;
  clean = clean.replace(MALFORMED_MD_LINK, '');

  return clean.trim();
}
