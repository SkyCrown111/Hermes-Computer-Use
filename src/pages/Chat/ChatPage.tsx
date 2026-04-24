// Chat Page - Full screen chat interface with Hermes Agent
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { streamChatRealtime, checkHermesApiHealth, respondApproval } from '../../services/hermesChat';
import { useSessionStore, useNavigationStore, useChatStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { ZapIcon, UserIcon, BotIcon, AlertIcon, PlayIcon, StopIcon, TokenIcon, ThinkingIcon, PlusIcon, ClockIcon } from '../../components';
import { logger } from '../../lib/logger';
import type { ChatMessage, ToolCallInfo } from '../../stores/chatStore';
import './ChatPage.css';

// Hermes Agent slash commands - descriptions will be set in component
const getHermesCommands = (t: (key: string) => string) => [
  { command: '/help', description: t('chat.cmd.help') },
  { command: '/status', description: t('chat.cmd.status') },
  { command: '/clear', description: t('chat.cmd.clear') },
  { command: '/export', description: t('chat.cmd.export') },
  { command: '/model', description: t('chat.cmd.model') },
  { command: '/skill', description: t('chat.cmd.skill') },
  { command: '/memory', description: t('chat.cmd.memory') },
  { command: '/task', description: t('chat.cmd.task') },
  { command: '/file', description: t('chat.cmd.file') },
  { command: '/search', description: t('chat.cmd.search') },
];

// Collapsible Thinking Block Component
const ThinkingBlock: React.FC<{ content: string; isActive?: boolean }> = ({ content, isActive }) => {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split('\n').filter(l => l.trim());
  const firstLine = lines[0]?.replace(/\s+/g, ' ').trim() || '';
  const preview = firstLine.length > 80 ? firstLine.slice(0, 80) + '...' : firstLine;

  return (
    <div className="thinking-block-wrapper">
      <button
        onClick={() => setExpanded(v => !v)}
        className="thinking-block-toggle"
      >
        <span className="thinking-block-arrow">{expanded ? '▾' : '▸'}</span>
        <span className="thinking-block-label">
          思考过程
          {isActive && <span className="thinking-dots-animate" />}
        </span>
        {!expanded && preview && (
          <span className="thinking-block-preview">{preview}</span>
        )}
      </button>
      {expanded && (
        <div className="thinking-block-content">
          {content}
          {isActive && <span className="thinking-cursor" />}
        </div>
      )}
    </div>
  );
};

// Simple Diff Viewer Component
const SimpleDiffViewer: React.FC<{ oldStr: string; newStr: string; filePath?: string }> = ({ oldStr, newStr, filePath }) => {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  // Simple line-by-line diff
  const diffLines: Array<{ type: 'context' | 'add' | 'remove'; oldNum?: number; newNum?: number; content: string }> = [];
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    const oldLine = oldLines[oldIdx];
    const newLine = newLines[newIdx];

    if (oldIdx >= oldLines.length) {
      // Only new lines left
      diffLines.push({ type: 'add', newNum: newIdx + 1, content: newLine });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      // Only old lines left
      diffLines.push({ type: 'remove', oldNum: oldIdx + 1, content: oldLine });
      oldIdx++;
    } else if (oldLine === newLine) {
      // Context line
      diffLines.push({ type: 'context', oldNum: oldIdx + 1, newNum: newIdx + 1, content: oldLine });
      oldIdx++;
      newIdx++;
    } else {
      // Check if this is a modification
      diffLines.push({ type: 'remove', oldNum: oldIdx + 1, content: oldLine });
      diffLines.push({ type: 'add', newNum: newIdx + 1, content: newLine });
      oldIdx++;
      newIdx++;
    }
  }

  // Count additions and deletions
  const additions = diffLines.filter(l => l.type === 'add').length;
  const deletions = diffLines.filter(l => l.type === 'remove').length;

  return (
    <div className="diff-viewer">
      {filePath && (
        <div className="diff-header">
          <span className="diff-file-path">{filePath.split('/').pop()}</span>
          <div className="diff-stats">
            <span className="diff-add">+{additions}</span>
            <span className="diff-remove">-{deletions}</span>
          </div>
        </div>
      )}
      <div className="diff-content">
        {diffLines.slice(0, 20).map((line, idx) => (
          <div key={idx} className={`diff-line ${line.type}`}>
            {line.oldNum !== undefined && <span className="diff-line-num old">{line.oldNum}</span>}
            {line.newNum !== undefined && <span className="diff-line-num new">{line.newNum}</span>}
            <span className="diff-line-marker">{line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}</span>
            <span className="diff-line-content">{line.content}</span>
          </div>
        ))}
        {diffLines.length > 20 && (
          <div className="diff-more">... {diffLines.length - 20} more lines</div>
        )}
      </div>
    </div>
  );
};

// Single Tool Item Component (used inside ToolsBlock)
const ToolItem: React.FC<{ tool: ToolCallInfo; isStreaming?: boolean }> = ({ tool, isStreaming }) => {
  const [showDiff, setShowDiff] = useState(false);
  const isRunning = !tool.duration && !tool.is_error && isStreaming;
  const icon = TOOL_ICONS[tool.name] || 'build';

  // Check if this is an Edit/Write tool with diff content
  const args = tool.args as Record<string, unknown> | undefined;
  const filePath = args?.file_path as string | undefined;
  const oldString = args?.old_string as string | undefined;
  const newString = args?.new_string as string | undefined;
  const content = args?.content as string | undefined;

  const canShowDiff = (tool.name === 'edit_file' || tool.name === 'write_file' || tool.name === 'Edit' || tool.name === 'Write') &&
    (oldString !== undefined || newString !== undefined || content !== undefined);

  return (
    <div className={`tool-item ${tool.is_error ? 'error' : 'success'}`}>
      <div className="tool-item-header" onClick={() => canShowDiff && setShowDiff(!showDiff)}>
        <span className="material-symbols-outlined tool-item-icon">{icon}</span>
        <span className="tool-item-name">{tool.name}</span>
        {filePath && (
          <span className="tool-item-file">{filePath.split('/').pop()}</span>
        )}
        {tool.preview && !filePath && (
          <span className="tool-item-preview">{tool.preview.slice(0, 50)}{tool.preview.length > 50 ? '...' : ''}</span>
        )}
        <span className="tool-item-spacer" />
        {isRunning && (
          <span className="tool-item-status running">运行中...</span>
        )}
        {!isRunning && !tool.is_error && (
          <span className="tool-item-status success">
            <span className="material-symbols-outlined">check</span>
            {tool.duration && `${tool.duration.toFixed(0)}ms`}
          </span>
        )}
        {tool.is_error && (
          <span className="tool-item-status error">
            <span className="material-symbols-outlined">error</span>
            失败
          </span>
        )}
        {canShowDiff && (
          <span className="material-symbols-outlined tool-item-expand">
            {showDiff ? 'expand_less' : 'expand_more'}
          </span>
        )}
      </div>
      {/* Diff viewer for Edit/Write tools */}
      {showDiff && canShowDiff && (
        <div className="tool-diff-container">
          {tool.name === 'Edit' || tool.name === 'edit_file' ? (
            <SimpleDiffViewer oldStr={oldString || ''} newStr={newString || ''} filePath={filePath} />
          ) : (
            <SimpleDiffViewer oldStr="" newStr={content || ''} filePath={filePath} />
          )}
        </div>
      )}
    </div>
  );
};

// Collapsible Tools Block Component (multiple tools in one expandable block)
const ToolsBlock: React.FC<{ tools: ToolCallInfo[]; isStreaming?: boolean }> = ({ tools, isStreaming }) => {
  const [expanded, setExpanded] = useState(false);

  // Count running/completed tools
  const runningCount = tools.filter(t => !t.duration && !t.is_error && isStreaming).length;
  const completedCount = tools.filter(t => t.duration).length;
  const errorCount = tools.filter(t => t.is_error).length;

  // Single tool - show simple card
  if (tools.length === 1) {
    return (
      <div className="tool-card">
        <ToolItem tool={tools[0]} isStreaming={isStreaming} />
      </div>
    );
  }

  // Multiple tools - show collapsible block
  return (
    <div className="tools-block">
      <button
        onClick={() => setExpanded(v => !v)}
        className="tools-block-header"
      >
        <span className="material-symbols-outlined tools-block-icon">build</span>
        <span className="tools-block-title">工具调用</span>
        <span className="tools-block-count">{tools.length} 个</span>
        <span className="tools-block-spacer" />
        {runningCount > 0 && (
          <span className="tools-block-status running">{runningCount} 运行中</span>
        )}
        {completedCount > 0 && (
          <span className="tools-block-status">{completedCount} 完成</span>
        )}
        {errorCount > 0 && (
          <span className="tools-block-status error">{errorCount} 错误</span>
        )}
        <span className="material-symbols-outlined tools-block-expand">
          {expanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {expanded && (
        <div className="tools-block-content">
          {tools.map((tool, idx) => (
            <ToolItem key={idx} tool={tool} isStreaming={isStreaming} />
          ))}
        </div>
      )}
    </div>
  );
};

// Inline Permission Card Component
const PermissionCard: React.FC<{
  approval: { id: string; command: string; description: string; allow_permanent: boolean };
  onRespond: (choice: 'once' | 'session' | 'always' | 'deny') => void;
}> = ({ approval, onRespond }) => {
  const [showCommand, setShowCommand] = useState(false);

  return (
    <div className="permission-card">
      <div className="permission-card-header">
        <div className="permission-card-icon">
          <span className="material-symbols-outlined">shield</span>
        </div>
        <div className="permission-card-title">
          <span className="permission-card-label">需要确认</span>
          <span className="permission-card-desc">{approval.description}</span>
        </div>
        <span className="permission-card-badge">
          <span className="permission-pulse" />
          等待确认
        </span>
      </div>
      <div className="permission-card-body">
        <div className="permission-command-preview">
          <code>{approval.command.slice(0, 100)}{approval.command.length > 100 ? '...' : ''}</code>
        </div>
        {approval.command.length > 100 && (
          <button
            className="permission-show-more"
            onClick={() => setShowCommand(v => !v)}
          >
            <span className="material-symbols-outlined">{showCommand ? 'expand_less' : 'expand_more'}</span>
            {showCommand ? '收起' : '查看完整命令'}
          </button>
        )}
        {showCommand && (
          <pre className="permission-command-full">{approval.command}</pre>
        )}
      </div>
      <div className="permission-card-actions">
        <button className="permission-btn allow" onClick={() => onRespond('once')}>
          <span className="material-symbols-outlined">check</span>
          允许
        </button>
        <button className="permission-btn session" onClick={() => onRespond('session')}>
          <span className="material-symbols-outlined">verified</span>
          本次会话
        </button>
        {approval.allow_permanent && (
          <button className="permission-btn always" onClick={() => onRespond('always')}>
            <span className="material-symbols-outlined">done_all</span>
            永久
          </button>
        )}
        <button className="permission-btn deny" onClick={() => onRespond('deny')}>
          <span className="material-symbols-outlined">close</span>
          拒绝
        </button>
      </div>
    </div>
  );
};

// Tool icons mapping
const TOOL_ICONS: Record<string, string> = {
  terminal: 'terminal',
  search_files: 'search',
  read_file: 'description',
  write_file: 'edit_document',
  edit_file: 'edit_note',
  glob: 'search',
  grep: 'find_in_page',
  web_search: 'travel_explore',
  web_fetch: 'cloud_download',
  skill: 'auto_awesome',
};

// Session search result type
interface SessionSearchResult {
  session_id: string;
  title: string | null;
  source: string;
  started_at: number;
  last_active: number;
  message_count: number;
  preview: string;
}

interface SessionSearchResponse {
  success: boolean;
  mode: string;
  results: SessionSearchResult[];
  count: number;
  message: string;
}

// Parse various JSON formats from tool outputs
// Only extract errors - other JSON is part of tool execution and should be removed
function parseToolJson(content: string): {
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
            parsed.duration_seconds
          ) {
            shouldRemove = true;
          }

          if (shouldRemove) {
            cleanContent = cleanContent.replace(jsonStr, '').trim();
            i = 0; // Restart from beginning after modification
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

// Tool Error Card Component - for displaying tool execution errors
const ToolErrorCard: React.FC<{ error: string }> = ({ error }) => {
  // Parse various error formats for cleaner display
  const parseError = (errorMsg: string): { title: string; details: string } => {
    // Vision analysis error
    if (errorMsg.includes('vision analysis')) {
      const match = errorMsg.match(/Error during vision analysis:\s*(.+)/);
      if (match) {
        // Try to extract the actual error message from nested JSON
        const innerError = match[1];
        if (innerError.includes('image_url is only supported')) {
          return {
            title: '视觉分析错误',
            details: '当前模型不支持图片分析 (image_url)，请使用支持视觉的模型',
          };
        }
        return {
          title: '视觉分析错误',
          details: innerError.slice(0, 200),
        };
      }
    }
    // Playwright page.evaluate error
    if (errorMsg.includes('page.evaluate:')) {
      const match = errorMsg.match(/page\.evaluate:\s*(.+)/);
      return {
        title: '浏览器脚本执行错误',
        details: match?.[1] || errorMsg,
      };
    }
    // Generic error - truncate if too long
    return {
      title: '工具执行错误',
      details: errorMsg.length > 300 ? errorMsg.slice(0, 300) + '...' : errorMsg,
    };
  };

  const { title, details } = parseError(error);

  return (
    <div className="tool-error-card">
      <div className="tool-error-header">
        <span className="material-symbols-outlined tool-error-icon">error</span>
        <span className="tool-error-title">{title}</span>
      </div>
      <div className="tool-error-details">
        <code>{details}</code>
      </div>
    </div>
  );
};

// Session Search Results Card Component
const SessionSearchCard: React.FC<{
  result: SessionSearchResult;
  onClick: () => void;
}> = ({ result, onClick }) => {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="session-search-card" onClick={onClick}>
      <div className="session-search-card-header">
        <span className="session-search-card-icon">💬</span>
        <span className="session-search-card-title">
          {result.title || `会话 ${result.session_id.slice(0, 8)}`}
        </span>
        <span className="session-search-card-count">{result.message_count} 条消息</span>
      </div>
      <div className="session-search-card-preview">{result.preview}</div>
      <div className="session-search-card-meta">
        <span className="session-search-card-source">{result.source}</span>
        <span className="session-search-card-time">{formatDate(result.last_active)}</span>
      </div>
    </div>
  );
};

interface ChatPageProps {
  sessionId?: string;
  sessionTitle?: string;
}

export const ChatPage: React.FC<ChatPageProps> = ({
  sessionId,
  sessionTitle: _sessionTitle,
}) => {
  const { t } = useTranslation();
  const HERMES_COMMANDS = getHermesCommands(t);

  // Navigation store for tabs
  const { chatContext, activeTabId } = useNavigationStore();
  const effectiveSessionId = chatContext?.sessionId || sessionId || activeTabId;

  // Chat store - use stable selectors for each primitive value
  // This avoids object recreation issues that cause infinite loops
  const sessionMessages = useChatStore((s) => s.sessions[effectiveSessionId || '']?.messages);
  const sessionStreamingText = useChatStore((s) => s.sessions[effectiveSessionId || '']?.streamingText);
  const sessionIsStreaming = useChatStore((s) => s.sessions[effectiveSessionId || '']?.isStreaming);
  const sessionIsThinking = useChatStore((s) => s.sessions[effectiveSessionId || '']?.isThinking);
  const sessionThinkingText = useChatStore((s) => s.sessions[effectiveSessionId || '']?.thinkingText);
  const sessionReasoningText = useChatStore((s) => s.sessions[effectiveSessionId || '']?.reasoningText);
  const sessionStreamingTools = useChatStore((s) => s.sessions[effectiveSessionId || '']?.streamingTools);
  const sessionPendingPermission = useChatStore((s) => s.sessions[effectiveSessionId || '']?.pendingPermission);
  const sessionTokenUsage = useChatStore((s) => s.sessions[effectiveSessionId || '']?.tokenUsage);

  // Build session state with stable references
  // Use primitive values for dependencies to avoid object reference issues
  const sessionState = useMemo(() => ({
    messages: sessionMessages ?? [],
    streamingText: sessionStreamingText ?? '',
    isStreaming: sessionIsStreaming ?? false,
    isThinking: sessionIsThinking ?? false,
    thinkingText: sessionThinkingText ?? '',
    reasoningText: sessionReasoningText ?? '',
    streamingTools: sessionStreamingTools ?? [],
    pendingPermission: sessionPendingPermission ?? null,
    tokenUsage: sessionTokenUsage ?? { input_tokens: 0, output_tokens: 0 },
  }), [
    // Use stable primitive values for comparison
    sessionMessages,
    sessionStreamingText,
    sessionIsStreaming,
    sessionIsThinking,
    sessionThinkingText,
    sessionReasoningText,
    sessionStreamingTools,
    sessionPendingPermission,
    sessionTokenUsage,
  ]);

  const {
    addMessage,
    updateMessage,
    setStreaming,
    setStreamingText,
    setThinking,
    appendReasoningText,
    clearReasoningText,
    addStreamingTool,
    clearStreamingTools,
    setPendingPermission: setChatPendingPermission,
    clearPendingPermission,
    setTokenUsage,
    loadMessages,
  } = useChatStore();

  // Session store for loading history from server
  const fetchMessagesFromServer = useSessionStore((s) => s.fetchMessages);
  const updateSessionActivity = useSessionStore((s) => s.updateSessionActivity);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const sessionsRefreshKey = useSessionStore((s) => s.refreshKey);

  // Load sessions list when component mounts or refreshKey changes
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions, sessionsRefreshKey]);

  // Local UI state (not per-session)
  const [inputValue, setInputValue] = useState('');
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState(HERMES_COMMANDS);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const isStoppedRef = useRef<boolean>(false);
  const accumulatedContentRef = useRef<string>('');

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef<boolean>(true);

  // Load session messages from server when effectiveSessionId changes
  useEffect(() => {
    if (!effectiveSessionId) return;

    // Skip new session tabs (they start with "new_")
    if (effectiveSessionId.startsWith('new_')) return;

    // Check if we already have messages loaded in chatStore for this session
    const existingMessages = useChatStore.getState().sessions[effectiveSessionId]?.messages;
    if (existingMessages && existingMessages.length > 0) {
      logger.component('ChatPage', 'Already have messages in chatStore for:', effectiveSessionId);
      return;
    }

    // Load from server - use returned messages directly to avoid stale closure issues
    logger.component('ChatPage', 'Loading messages for:', effectiveSessionId);
    fetchMessagesFromServer(effectiveSessionId).then((serverMessages) => {
      // Use returned messages directly instead of getCachedMessages
      if (serverMessages && serverMessages.length > 0) {
        const convertedMessages: ChatMessage[] = serverMessages.map((msg) => ({
          id: `msg-${Date.now()}-${Math.random()}`,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: msg.timestamp,
          reasoning: msg.reasoning,
          tools: msg.tool_calls?.map(tc => ({
            name: tc.name,
            event_type: 'tool.completed',
            args: tc.args,
            duration: 0,
          })),
        }));
        loadMessages(effectiveSessionId, convertedMessages);
        logger.component('ChatPage', 'Loaded', convertedMessages.length, 'messages for session:', effectiveSessionId);
      } else {
        logger.component('ChatPage', 'No messages found for session:', effectiveSessionId);
      }
    }).catch((err) => {
      logger.error('[ChatPage] Failed to load session:', err);
    });
  }, [effectiveSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check API availability on mount
  useEffect(() => {
    checkHermesApiHealth().then(available => {
      setApiAvailable(available);
      logger.component('ChatPage', 'Hermes API available:', available);
    });
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessionState.messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle slash command filtering
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Check for slash command
    if (value.startsWith('/')) {
      const query = value.toLowerCase();
      const filtered = HERMES_COMMANDS.filter(cmd =>
        cmd.command.toLowerCase().startsWith(query)
      );
      setFilteredCommands(filtered);
      setShowCommands(filtered.length > 0);
      setSelectedCommandIndex(0);
    } else {
      setShowCommands(false);
    }
  };

  // Insert command
  const insertCommand = (command: string) => {
    setInputValue(command + ' ');
    setShowCommands(false);
    inputRef.current?.focus();
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const fileNames = Array.from(files).map(f => f.name);
      setAttachedFiles(prev => [...prev, ...fileNames]);
    }
    setShowAddMenu(false);
  };

  // Remove attached file
  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = useCallback(async () => {
    // Get current streaming state from store directly to avoid stale closure
    const currentIsStreaming = useChatStore.getState().sessions[effectiveSessionId || '']?.isStreaming;
    if (!inputValue.trim() || !effectiveSessionId || currentIsStreaming) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    setThinkingStartTime(Date.now());
    isStoppedRef.current = false;
    accumulatedContentRef.current = '';

    // Clear previous streaming state
    setStreamingText(effectiveSessionId, '');
    clearReasoningText(effectiveSessionId);
    clearStreamingTools(effectiveSessionId);

    // Add user message to chatStore
    addMessage(effectiveSessionId, {
      role: 'user',
      content: userMessage,
    });

    // Add streaming placeholder message
    addMessage(effectiveSessionId, {
      role: 'assistant',
      content: '',
    });

    // Set streaming state
    setStreaming(effectiveSessionId, true);
    setThinking(effectiveSessionId, true, t('chat.thinking'));

    try {
      // Get current messages from store directly to avoid stale closure
      const currentMessages = useChatStore.getState().sessions[effectiveSessionId]?.messages || [];
      const historyForApi = currentMessages.slice(-20);

      await streamChatRealtime(
        userMessage,
        effectiveSessionId,
        historyForApi,
        {
          onStatus: (_status, msg) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            // Get current session ID from navigation store (in case tab was switched)
            const currentTabId = useNavigationStore.getState().activeTabId;
            if (currentTabId) setThinking(currentTabId, true, msg);
          },
          onChunk: (_chunk, accumulated) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            // Get current session ID from navigation store (in case tab was switched)
            const currentTabId = useNavigationStore.getState().activeTabId;
            if (currentTabId) {
              setStreamingText(currentTabId, accumulated);
              setThinking(currentTabId, false);
            }
          },
          onReasoning: (text, _accumulated) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            // Get current session ID from navigation store (in case tab was switched)
            const currentTabId = useNavigationStore.getState().activeTabId;
            if (currentTabId) {
              appendReasoningText(currentTabId, text);
              setThinking(currentTabId, false); // Stop showing "thinking" when reasoning starts
            }
          },
          onTool: (tool) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            console.log('[ChatPage] Tool call:', tool);
            // Get current session ID from navigation store (in case tab was switched)
            const currentTabId = useNavigationStore.getState().activeTabId;
            if (currentTabId) {
              addStreamingTool(currentTabId, tool); // Only add to streaming display during streaming
              setThinking(currentTabId, false);
            }
          },
          onUsage: (usage) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            // Get current session ID from navigation store (in case tab was switched)
            const currentTabId = useNavigationStore.getState().activeTabId;
            if (currentTabId) {
              setTokenUsage(currentTabId, {
                input_tokens: usage.prompt_tokens,
                output_tokens: usage.completion_tokens,
              });
            }
          },
          onComplete: (content, newSessionId, usage) => {
            if (!isMountedRef.current) return;
            const thinkingTime = thinkingStartTime ? Math.round((Date.now() - thinkingStartTime) / 1000) : 0;

            // Determine the correct session ID to use
            // If a new session was created from a "new_" tab, use the new session ID
            const targetSessionId = (effectiveSessionId.startsWith('new_') && newSessionId)
              ? newSessionId
              : effectiveSessionId;

            setStreaming(targetSessionId, false);
            setThinking(targetSessionId, false);
            setThinkingStartTime(null);

            // Use accumulated content if event content is empty
            const finalContent = content || accumulatedContentRef.current;

            // Get the reasoning text and tools from the current store state
            const currentSession = useChatStore.getState().sessions[targetSessionId];
            const currentReasoningText = currentSession?.reasoningText || '';
            const currentStreamingTools = currentSession?.streamingTools || [];

            // Get the last message ID from the current store state (not closure)
            const currentMessages = currentSession?.messages;
            const lastMessage = currentMessages?.[currentMessages.length - 1];
            if (lastMessage) {
              updateMessage(targetSessionId, lastMessage.id, {
                content: finalContent,
                reasoning: currentReasoningText,
                tools: currentStreamingTools, // Save streaming tools to message
                thinkingTime,
                inputTokens: usage?.prompt_tokens,
                outputTokens: usage?.completion_tokens,
                totalTokens: usage?.total_tokens,
              });
            }

            // Clear streaming state after saving to message
            setStreamingText(targetSessionId, '');
            clearReasoningText(targetSessionId);
            clearStreamingTools(targetSessionId);

            // Update session activity in the list
            if (targetSessionId && !targetSessionId.startsWith('new_')) {
              updateSessionActivity(targetSessionId);
            }

            // If new session was created, refresh the session list
            if (newSessionId) {
              useSessionStore.getState().refreshSessions();
            }
          },
          onError: (error) => {
            if (!isMountedRef.current) return;
            logger.error('[ChatPage] Stream error:', error);

            // Get the current session ID from navigation store (in case it was replaced)
            const currentTabId = useNavigationStore.getState().activeTabId;
            const targetSessionId = currentTabId || effectiveSessionId;

            setStreaming(targetSessionId, false);
            setThinking(targetSessionId, false);
            setThinkingStartTime(null);

            let errorMessage = 'Unknown error';
            if (error instanceof Error) {
              errorMessage = error.message || 'Unknown error';
            } else if (typeof error === 'string') {
              errorMessage = error;
            } else if (error && typeof error === 'object') {
              errorMessage = JSON.stringify(error);
            }

            // Get the last message ID from the current store state (not closure)
            const currentMessages = useChatStore.getState().sessions[targetSessionId]?.messages;
            const lastMessage = currentMessages?.[currentMessages.length - 1];
            if (lastMessage) {
              updateMessage(targetSessionId, lastMessage.id, {
                content: `${t('chat.error')}: ${errorMessage}\n\n${t('chat.ensureGateway')}。\n\n${t('chat.runCommand')}: hermes gateway`,
              });
            }
          },
          onApproval: (approval) => {
            if (!isMountedRef.current) return;
            console.log('[ChatPage] Approval request:', approval);
            // Get current session ID from navigation store (in case tab was switched)
            const currentTabId = useNavigationStore.getState().activeTabId;
            if (currentTabId) setChatPendingPermission(currentTabId, approval);
          },
          onSessionCreated: (newSessionId) => {
            if (!isMountedRef.current) return;
            console.log('[ChatPage] Session created:', newSessionId);

            // Get current tab ID from navigation store (in case tab was switched)
            const currentTabId = useNavigationStore.getState().activeTabId;

            // If current tab is a temporary "new_" tab, replace it with the real session ID
            if (currentTabId && currentTabId.startsWith('new_')) {
              // First migrate messages from old ID to new ID
              useChatStore.getState().migrateSession(currentTabId, newSessionId);
              // Then update the tab
              useNavigationStore.getState().replaceTabId(currentTabId, newSessionId);
            }

            // Optimistically add session to list immediately
            // Don't call refreshSessions here - onComplete will handle it
            useSessionStore.getState().addSessionOptimistic(newSessionId);
          },
        }
      );
    } catch (error) {
      if (!isMountedRef.current) return;
      logger.error('[ChatPage] Error:', error);
      setStreaming(effectiveSessionId, false);
      setThinking(effectiveSessionId, false);
      setThinkingStartTime(null);

      // Get the last message ID from the current store state (not closure)
      const currentMessages = useChatStore.getState().sessions[effectiveSessionId]?.messages;
      const lastMessage = currentMessages?.[currentMessages.length - 1];
      if (lastMessage) {
        updateMessage(effectiveSessionId, lastMessage.id, {
          content: `${t('chat.error')}: ${(error as Error).message}`,
        });
      }
    }
  }, [inputValue, effectiveSessionId, addMessage, updateMessage, setStreaming, setStreamingText, setThinking, appendReasoningText, clearReasoningText, clearStreamingTools, addStreamingTool, setTokenUsage, setChatPendingPermission, thinkingStartTime, t, updateSessionActivity, fetchSessions]);

  // Stop running
  const handleStop = () => {
    // Get current session ID from navigation store (in case tab was switched)
    const currentTabId = useNavigationStore.getState().activeTabId;
    const targetSessionId = currentTabId || effectiveSessionId;
    if (!targetSessionId) return;

    isStoppedRef.current = true;
    setStreaming(targetSessionId, false);
    setThinking(targetSessionId, false);
    setThinkingStartTime(null);

    // Get the last message from the current store state (not closure)
    const currentMessages = useChatStore.getState().sessions[targetSessionId]?.messages;
    const lastMessage = currentMessages?.[currentMessages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      updateMessage(targetSessionId, lastMessage.id, {
        content: lastMessage.content || t('chat.stopped'),
      });
    }
  };

  // Handle approval response
  const handleApprovalResponse = async (choice: 'once' | 'session' | 'always' | 'deny') => {
    // Get current pending permission from store directly to avoid stale closure
    const currentPendingPermission = useChatStore.getState().sessions[effectiveSessionId || '']?.pendingPermission;
    if (!effectiveSessionId || !currentPendingPermission) return;

    console.log('[ChatPage] Approval response:', choice);
    try {
      await respondApproval(currentPendingPermission.id, choice);
    } catch (error) {
      logger.error('[ChatPage] Failed to send approval response:', error);
    }
    clearPendingPermission(effectiveSessionId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Slash command navigation
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredCommands[selectedCommandIndex];
        if (selected) insertCommand(selected.command);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowCommands(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="chat-page">
      {/* Messages */}
      <div className="chat-page-messages">
        {sessionState.messages.length === 0 && !sessionState.isStreaming && (
          <div className="chat-welcome">
            <div className="chat-welcome-icon"><ZapIcon size={48} /></div>
            <h2>{t('chat.title')}</h2>
            <p>{t('chat.startConversation')}</p>
            {apiAvailable === false && (
              <div className="chat-welcome-warning">
                <p><AlertIcon size={16} /> {t('chat.gatewayNotRunning')}</p>
                <code>hermes gateway</code>
              </div>
            )}
          </div>
        )}
        {sessionState.messages.map((msg, idx) => {
          // Check if message has any visible content
          const { cleanContent } = msg.content ? parseToolJson(msg.content) : { cleanContent: '' };
          const hasVisibleContent = cleanContent || msg.reasoning || (msg.tools && msg.tools.length > 0) || msg.thinking;

          // Skip rendering if no visible content
          if (!hasVisibleContent) return null;

          // Find the previous visible message to determine grouping
          let prevVisibleIdx = idx - 1;
          while (prevVisibleIdx >= 0) {
            const prevMsg = sessionState.messages[prevVisibleIdx];
            const prevClean = prevMsg.content ? parseToolJson(prevMsg.content).cleanContent : '';
            if (prevClean || prevMsg.reasoning || (prevMsg.tools && prevMsg.tools.length > 0) || prevMsg.thinking) {
              break;
            }
            prevVisibleIdx--;
          }

          const isFirstInGroup = prevVisibleIdx < 0 || sessionState.messages[prevVisibleIdx].role !== msg.role;
          const isStreamingMsg = idx === sessionState.messages.length - 1 && sessionState.isStreaming;

          return (
            <div key={idx} className={`chat-message ${msg.role} ${isStreamingMsg ? 'streaming' : ''} ${!isFirstInGroup ? 'grouped' : ''}`}>
              {isFirstInGroup && (
                <div className="message-avatar">
                  {msg.role === 'user' ? <UserIcon size={16} /> : <BotIcon size={16} />}
                </div>
              )}
              <div className="message-content">
              {/* Thinking indicator for assistant messages - only during streaming */}
              {msg.role === 'assistant' && msg.thinking && isStreamingMsg && (
                <div className="thinking-indicator">
                  <div className="thinking-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="thinking-text"><ThinkingIcon size={14} /> {msg.thinking}</span>
                  {msg.totalTokens && (
                    <span className="thinking-tokens">
                      <TokenIcon size={12} /> {msg.totalTokens.toLocaleString()}
                    </span>
                  )}
                </div>
              )}
              {/* Reasoning display - collapsible thinking block */}
              {msg.role === 'assistant' && msg.reasoning && (
                <ThinkingBlock content={msg.reasoning} isActive={isStreamingMsg} />
              )}
              {/* Tool calls display - collapsible block */}
              {msg.role === 'assistant' && msg.tools && msg.tools.length > 0 && (
                <ToolsBlock tools={msg.tools} isStreaming={isStreamingMsg} />
              )}
              {/* Pending approval - inline card */}
              {msg.role === 'assistant' && isStreamingMsg && sessionState.pendingPermission && (
                <PermissionCard
                  approval={sessionState.pendingPermission}
                  onRespond={handleApprovalResponse}
                />
              )}
              {/* Message content */}
              {msg.content && (() => {
                const { cleanContent, errors, sessionSearchResults } = parseToolJson(msg.content);
                return (
                  <>
                    {cleanContent && <div className="message-text">{cleanContent}</div>}
                    {/* Tool errors display */}
                    {errors.map((err, i) => (
                      <ToolErrorCard key={i} error={err.error} />
                    ))}
                    {/* Session search results display */}
                    {sessionSearchResults && sessionSearchResults.results.length > 0 && (
                      <div className="session-search-results">
                        {sessionSearchResults.results.map((result, i) => (
                          <SessionSearchCard
                            key={i}
                            result={result}
                            onClick={() => {
                              // Open the session in a new tab
                              const { openTab } = useNavigationStore.getState();
                              openTab(result.session_id, result.title || `会话 ${result.session_id.slice(0, 8)}`, 'session');
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
              {/* Stats bar for assistant messages (after completion) */}
              {msg.role === 'assistant' && !isStreamingMsg && (msg.thinkingTime || msg.totalTokens) && msg.content && (
                <div className="message-stats">
                  {msg.thinkingTime && (
                    <span className="stat-item" title={t('chat.thinkingTime')}>
                      <ClockIcon size={12} /> {msg.thinkingTime}s
                    </span>
                  )}
                  {msg.inputTokens && msg.outputTokens && (
                    <span className="stat-item stat-detail" title={t('chat.inputOutput')}>
                      ({t('chat.input')}: {msg.inputTokens.toLocaleString()} / {t('chat.output')}: {msg.outputTokens.toLocaleString()})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          );
        })}

        {/* Streaming state display - shows real-time thinking/streaming */}
        {sessionState.isStreaming && (
          <div className="chat-message assistant streaming">
            <div className="message-avatar">
              <BotIcon size={16} />
            </div>
            <div className="message-content">
              {/* Thinking indicator - show if thinking OR if no content yet */}
              {(sessionState.isThinking || (!sessionState.reasoningText && !sessionState.streamingTools?.length && !sessionState.streamingText)) && (
                <div className="thinking-indicator">
                  <div className="thinking-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="thinking-text">
                    <ThinkingIcon size={14} /> {sessionState.thinkingText || t('chat.thinking')}
                  </span>
                </div>
              )}
              {/* Reasoning display - actual AI reasoning content */}
              {sessionState.reasoningText && (
                <ThinkingBlock content={sessionState.reasoningText} isActive={true} />
              )}
              {/* Tool calls display - show during streaming */}
              {sessionState.streamingTools && sessionState.streamingTools.length > 0 && (
                <ToolsBlock tools={sessionState.streamingTools} isStreaming={true} />
              )}
              {/* Streaming content */}
              {sessionState.streamingText && (
                <div className="message-text">{sessionState.streamingText}</div>
              )}
              {/* Pending approval */}
              {sessionState.pendingPermission && (
                <PermissionCard
                  approval={sessionState.pendingPermission}
                  onRespond={handleApprovalResponse}
                />
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Reference Style */}
      <div className="chat-input-wrapper">
        <div className="chat-input-container">
          {/* Slash Commands Dropdown */}
          {showCommands && (
            <div className="slash-commands-menu">
              <div className="slash-commands-list">
                {filteredCommands.map((cmd, index) => (
                  <button
                    key={cmd.command}
                    className={`slash-command-item ${index === selectedCommandIndex ? 'selected' : ''}`}
                    onClick={() => insertCommand(cmd.command)}
                    onMouseEnter={() => setSelectedCommandIndex(index)}
                  >
                    <span className="slash-command-name">{cmd.command}</span>
                    <span className="slash-command-desc">{cmd.description}</span>
                  </button>
                ))}
              </div>
              <div className="slash-commands-hints">
                <kbd>↑/↓</kbd> <span>{t('chat.navigate')}</span>
                <kbd>Enter</kbd> <span>{t('chat.select')}</span>
                <kbd>Esc</kbd> <span>{t('chat.close')}</span>
              </div>
            </div>
          )}

          {/* Attached Files */}
          {attachedFiles.length > 0 && (
            <div className="attachments-area">
              {attachedFiles.map((file, idx) => (
                <div key={idx} className="attachment-chip">
                  <span className="attachment-icon">📄</span>
                  <span className="attachment-name">{file}</span>
                  <button
                    className="attachment-remove"
                    onClick={() => removeAttachedFile(idx)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={inputRef}
            className="chat-textarea"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.inputPlaceholder')}
            rows={1}
          />

          {/* Bottom Toolbar */}
          <div className="chat-input-toolbar">
            <div className="toolbar-left">
              <div className="add-button-wrapper" ref={addMenuRef}>
                <button
                  className="toolbar-add-btn"
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  disabled={sessionState.isStreaming}
                >
                  <PlusIcon size={18} />
                </button>

                {showAddMenu && (
                  <div className="add-menu-popup">
                    <button
                      className="add-menu-item"
                      onClick={() => {
                        fileInputRef.current?.click();
                        setShowAddMenu(false);
                      }}
                    >
                      <PlusIcon size={16} />
                      <span>{t('chat.addFile')}</span>
                    </button>
                    <button
                      className="add-menu-item"
                      onClick={() => {
                        fileInputRef.current?.click();
                        setShowAddMenu(false);
                      }}
                    >
                      <PlusIcon size={16} />
                      <span>{t('chat.addImage')}</span>
                    </button>
                    <button
                      className="add-menu-item"
                      onClick={() => {
                        setInputValue('/');
                        inputRef.current?.focus();
                        setShowAddMenu(false);
                      }}
                    >
                      <span className="slash-icon">/</span>
                      <span>{t('chat.slashCommands')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="toolbar-right">
              <button
                className={`run-action-btn ${sessionState.isStreaming ? 'running' : ''}`}
                onClick={sessionState.isStreaming ? handleStop : handleSendMessage}
                disabled={!sessionState.isStreaming && !inputValue.trim()}
              >
                {sessionState.isStreaming ? <StopIcon size={14} /> : <PlayIcon size={14} />}
                <span>{sessionState.isStreaming ? t('chat.stop') : t('chat.run')}</span>
              </button>
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>
      </div>
    </div>
  );
};
