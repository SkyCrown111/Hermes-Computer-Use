import type { SessionSearchResponse } from './constants';

// Cache for parsed results to avoid re-parsing identical content
const parseCache = new Map<string, {
  cleanContent: string;
  errors: Array<{ error: string }>;
  sessionSearchResults: SessionSearchResponse | null;
}>();
const MAX_CACHE_SIZE = 100;

/**
 * Parse various JSON formats from tool outputs.
 * Only extract errors - other JSON is part of tool execution and should be removed.
 *
 * Performance optimizations:
 * - Uses caching to avoid re-parsing identical content
 * - Pre-compiled regex patterns
 * - Early termination for empty content
 */
export function parseToolJson(content: string): {
  cleanContent: string;
  errors: Array<{ error: string }>;
  sessionSearchResults: SessionSearchResponse | null;
} {
  // Fast path for empty content
  if (!content || content.trim() === '') {
    return { cleanContent: '', errors: [], sessionSearchResults: null };
  }

  // Check cache first
  const cached = parseCache.get(content);
  if (cached) {
    return cached;
  }

  const errors: Array<{ error: string }> = [];
  let sessionSearchResults: SessionSearchResponse | null = null;
  let cleanContent = content;

  // Pre-compiled regex patterns - combined for single pass
  const toolOutputPatterns = [
    /^npm error.*$/gm,
    /^npm\s+error\s+at async.*$/gm,
    /^npm\s+error\s+\{.*$/gm,
    /^npm\s+error\s+\}.*$/gm,
    /^npm\s+error\s+errno.*$/gm,
    /^npm\s+error\s+code.*$/gm,
    /^npm\s+error\s+syscall.*$/gm,
    /^npm\s+error\s+path.*$/gm,
    /^npm\s+error\s+dest.*$/gm,
    /^npm\s+error\s+The operation.*$/gm,
    /^npm\s+error\s+It is likely.*$/gm,
    /^npm\s+error\s+If you believe.*$/gm,
    /^npm\s+error\s+permissions.*$/gm,
    /^npm\s+error\s+the command.*$/gm,
    /^npm\s+error\s+A complete log.*$/gm,
    /^npm\s+error$/gm,
    /^-rwxrwxrwx.*$/gm,
    /^drwxrwxrwx.*$/gm,
    /^total\s+\d+.*$/gm,
    /^生成.*架构图.*$/gm,
    /^架构图生成完成.*$/gm,
    /^继续检查状态.*$/gm,
    /^Tool result:.*$/gm,
    /^Running tool:.*$/gm,
    /^Executing:.*$/gm,
  ];

  // Apply all patterns in a single loop
  for (const pattern of toolOutputPatterns) {
    cleanContent = cleanContent.replace(pattern, '');
  }
  cleanContent = cleanContent.trim();

  // Remove JSON-like structures that start with {"output": or {"bytes_written":
  // Use [\s\S] to match any character including newlines
  cleanContent = cleanContent.replace(/\{"output":\s*"[\s\S]*?",\s*"exit_code"/g, '').trim();
  cleanContent = cleanContent.replace(/\{"bytes_written":\s*\d+[\s\S]*?\}/g, '').trim();
  cleanContent = cleanContent.replace(/\{"success":\s*(true|false)[\s\S]*?"screenshot_path"[\s\S]*?\}/g, '').trim();
  cleanContent = cleanContent.replace(/"exit_code":\s*\d+/g, '').trim();
  cleanContent = cleanContent.replace(/"error":\s*(null|"[^"]*")/g, '').trim();

  // Remove remaining JSON fragments
  cleanContent = cleanContent.replace(/\{[\s\S]*?"output"[\s\S]*?\}/g, '').trim();

  // Helper to find matching closing brace
  const findJsonEnd = (str: string, start: number): number => {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let j = start; j < str.length; j++) {
      const char = str[j];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
      } else if (!inString) {
        if (char === '{') depth++;
        else if (char === '}') {
          depth--;
          if (depth === 0) return j;
        }
      }
    }
    return -1;
  };

  // Process all JSON objects in content
  let i = 0;
  let iterations = 0;
  const maxIterations = 100; // Prevent infinite loops

  while (i < cleanContent.length && iterations < maxIterations) {
    iterations++;

    if (cleanContent[i] === '{') {
      const endIdx = findJsonEnd(cleanContent, i);

      if (endIdx > 0) {
        const jsonStr = cleanContent.slice(i, endIdx + 1);

        try {
          const parsed = JSON.parse(jsonStr);

          // Determine if this JSON should be removed
          let shouldRemove = false;

          // Error JSON - extract error message
          if (parsed.success === false) {
            let errorMsg = 'Unknown error';
            if (typeof parsed.error === 'string') {
              errorMsg = parsed.error;
            } else if (parsed.error && typeof parsed.error === 'object') {
              errorMsg = parsed.error.message || JSON.stringify(parsed.error);
            }
            errors.push({ error: errorMsg });
            shouldRemove = true;
          }
          // Session search results - keep for special display
          else if (parsed.success && parsed.results && Array.isArray(parsed.results)) {
            sessionSearchResults = parsed as SessionSearchResponse;
            shouldRemove = true;
          }
          // Tool execution outputs - always remove
          else if (
            parsed.output !== undefined ||
            parsed.exit_code !== undefined ||
            parsed.screenshot_path ||
            parsed.note ||
            parsed.bytes_written ||
            parsed.dirs_created ||
            parsed.success === true ||
            parsed.job_id ||
            parsed.jobs ||
            parsed.targets ||
            parsed.count !== undefined ||
            parsed.api_calls ||
            parsed.tool_trace ||
            parsed.duration_seconds ||
            parsed.file_path !== undefined ||
            parsed.content !== undefined ||
            parsed.result !== undefined ||
            parsed.data !== undefined ||
            parsed.response !== undefined ||
            parsed.status === 'completed' ||
            parsed.status === 'running' ||
            parsed.tool_name !== undefined ||
            parsed.tool_result !== undefined
          ) {
            shouldRemove = true;
          }

          if (shouldRemove) {
            // Use slice-based removal instead of replace() to avoid matching
            // the same JSON string at a different position
            cleanContent = (cleanContent.slice(0, i) + cleanContent.slice(endIdx + 1)).trim();
            // Don't reset i — content after the removed block shifted into this position
            continue;
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    }
    i++;
  }

  // Clean up remaining artifacts
  cleanContent = cleanContent
    .replace(/^\s*,\s*"[^"]+"\s*:\s*[\d[{][^\n]*$/gm, '')
    .replace(/\}\s*\{/g, '\n')
    .replace(/\}\s*,\s*"[^"]+"\s*:\s*[\d[{]/g, '}')
    .replace(/\[\s*\{[^}]*"tool"[^}]*\}[\s\S]*?\]/g, '')
    .replace(/,\s*\d+\s*,\s*\}/g, '')
    .replace(/,\s*\}/g, '}')
    .replace(/\{\s*\}/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/^\s*\d+\s*,?\s*$/gm, '')
    .replace(/,\s*$/gm, '')
    // Generic pattern: Remove any malformed Markdown links [variable.path](http://variable.path)
    .replace(/\[[a-zA-Z_][\w.]*\]\(https?:\/\/[\w.]+\)/g, '')
    // More specific: variable-like patterns with dots
    .replace(/\[(?:msg|e|errors|sessionSearchResults|data|result|response|item|row|val|key|obj|arr|str|num|idx|index|count|len|length)[\w.]*\]\(https?:\/\/[\w.]+\)/gi, '')
    // JSON tool output lines - remove entire lines that are pure JSON outputs
    .replace(/^\s*\{"success":\s*(true|false).*\}\s*$/gm, '')
    .replace(/^\s*\{"output":\s*".*$/gm, '')
    .replace(/^\s*\{"bytes_written":\s*\d+.*$/gm, '')
    .replace(/^\s*\{"total_count":.*$/gm, '')
    .replace(/^\s*\{"content":\s*".*"total_lines".*$/gm, '')
    .replace(/^\s*\{"session_id":.*"pid".*$/gm, '')
    // JSON fragments like ": 0, "error": null}"
    .replace(/^:\s*\d+,\s*"error":\s*(null|"[^"]*")\s*\}\s*$/gm, '')
    .replace(/^:\s*\d+,\s*"error":.*"exit_code_meaning".*$/gm, '')
    // Lines that are just JSON array continuations
    .replace(/^\s*,\s*\{"name":.*$/gm, '')
    .replace(/^\s*,\s*\{"session_id":.*$/gm, '')
    // Truncated JSON
    .replace(/^\s*\{"total_count"\s*$/gm, '')
    .replace(/^\s*\{"output"\s*$/gm, '')
    // File content dumps - lines with line number prefixes like " 501|"
    .replace(/^\s*\d+\|\s*\d+\|.*$/gm, '')
    .replace(/^\s*\d+\|.*$/gm, '')
    // JSON metadata lines (from file read outputs)
    .replace(/^\s*"[^"]+":\s*[^,}\n]+,?\s*$/gm, '')
    .replace(/"total_lines":\s*\d+/g, '')
    .replace(/"file_size":\s*\d+/g, '')
    .replace(/"truncated":\s*(true|false)/g, '')
    .replace(/"hint":\s*"[^"]*"/g, '')
    .replace(/"is_binary":\s*(true|false)/g, '')
    .replace(/"is_image":\s*(true|false)/g, '')
    .trim();

  const result = { cleanContent, errors, sessionSearchResults };

  // Cache the result (with size limit)
  if (parseCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry (first key)
    const firstKey = parseCache.keys().next().value;
    if (firstKey) parseCache.delete(firstKey);
  }
  parseCache.set(content, result);

  return result;
}
