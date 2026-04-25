import type { SessionSearchResponse } from './constants';

/**
 * Parse various JSON formats from tool outputs.
 * Only extract errors - other JSON is part of tool execution and should be removed.
 */
export function parseToolJson(content: string): {
  cleanContent: string;
  errors: Array<{ error: string }>;
  sessionSearchResults: SessionSearchResponse | null;
} {
  const errors: Array<{ error: string }> = [];
  let sessionSearchResults: SessionSearchResponse | null = null;
  let cleanContent = content;

  // Pre-process: remove lines that look like tool output (npm errors, file listings, etc.)
  // These are typically multi-line outputs that don't form valid JSON
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
    /^-rwxrwxrwx.*$/gm,  // file listings
    /^drwxrwxrwx.*$/gm,  // directory listings
    /^total\s+\d+.*$/gm, // ls totals
    /^生成.*架构图.*$/gm, // Chinese generation messages
    /^架构图生成完成.*$/gm,
    /^继续检查状态.*$/gm,
    /^Tool result:.*$/gm, // Tool result lines
    /^Running tool:.*$/gm, // Tool execution messages
    /^Executing:.*$/gm, // Command execution messages
  ];

  for (const pattern of toolOutputPatterns) {
    cleanContent = cleanContent.replace(pattern, '').trim();
  }

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
    .replace(/^\s*,\s*"[^"]+"\s*:\s*[\d\[\{][^\n]*$/gm, '')
    .replace(/\}\s*\{/g, '\n') // Separate adjacent JSON objects
    .replace(/\}\s*,\s*"[^"]+"\s*:\s*[\d\[\{]/g, '}')
    .replace(/\[\s*\{[^}]*"tool"[^}]*\}[\s\S]*?\]/g, '')
    // Clean up JSON fragments like "0, }" or ", }"
    .replace(/,\s*\d+\s*,\s*\}/g, '')
    .replace(/,\s*\}/g, '}')
    .replace(/\{\s*\}/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/^\s*\d+\s*,?\s*$/gm, '')
    .replace(/,\s*$/gm, '')
    .trim();

  return { cleanContent, errors, sessionSearchResults };
}
