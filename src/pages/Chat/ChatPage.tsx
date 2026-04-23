// Chat Page - Full screen chat interface with Hermes Agent
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { streamChatRealtime, checkHermesApiHealth, respondApproval, type ChatMessage } from '../../services/hermesChat';
import { useSessionStore, useNavigationStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { ZapIcon, UserIcon, BotIcon, AlertIcon, PlayIcon, StopIcon, TokenIcon, ThinkingIcon, PlusIcon, ClockIcon } from '../../components';
import { logger } from '../../lib/logger';
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

// Chat Tabs Navigation Component (cc-haha style)
interface ChatTabsProps {
  onNewChat: () => void;
}

const ChatTabs: React.FC<ChatTabsProps> = ({ onNewChat }) => {
  const { openTabs, activeTabId, switchTab, closeTab } = useNavigationStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState);
    return () => el.removeEventListener('scroll', updateScrollState);
  }, [updateScrollState, openTabs.length]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -180 : 180, behavior: 'smooth' });
  };

  if (openTabs.length === 0) {
    return null;
  }

  return (
    <div className="chat-tabs-bar">
      {canScrollLeft && (
        <button onClick={() => scroll('left')} className="chat-tabs-scroll-btn">
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
      )}

      <div ref={scrollRef} className="chat-tabs-container">
        {openTabs.map((tab) => (
          <div
            key={tab.id}
            className={`chat-tab ${activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => switchTab(tab.id)}
          >
            {tab.type === 'new' ? (
              <span className="chat-tab-icon new">✨</span>
            ) : (
              <span className="chat-tab-icon session">💬</span>
            )}
            <span className="chat-tab-title">{tab.title}</span>
            <button
              className="chat-tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        ))}
      </div>

      {canScrollRight && (
        <button onClick={() => scroll('right')} className="chat-tabs-scroll-btn">
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      )}

      <button className="chat-tab-new" onClick={onNewChat} title="新建会话">
        <span className="material-symbols-outlined">add</span>
      </button>
    </div>
  );
};

// Extended message type with thinking and stats
interface ExtendedChatMessage extends ChatMessage {
  thinking?: string;
  reasoning?: string;  // Real-time reasoning from agent
  tools?: ToolCallInfo[];  // Tool calls during this message
  thinkingTime?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  isStreaming?: boolean;
}

// Tool call information
interface ToolCallInfo {
  name: string;
  event_type: string;
  preview?: string;
  args?: Record<string, unknown>;
  duration?: number;
  is_error?: boolean;
}

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

// Single Tool Item Component (used inside ToolsBlock)
const ToolItem: React.FC<{ tool: ToolCallInfo; isStreaming?: boolean }> = ({ tool, isStreaming }) => {
  const isRunning = !tool.duration && !tool.is_error && isStreaming;
  const icon = TOOL_ICONS[tool.name] || 'build';

  return (
    <div className={`tool-item ${tool.is_error ? 'error' : 'success'}`}>
      <span className="material-symbols-outlined tool-item-icon">{icon}</span>
      <span className="tool-item-name">{tool.name}</span>
      {tool.preview && (
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
  initialMessages?: ExtendedChatMessage[];
}

export const ChatPage: React.FC<ChatPageProps> = ({
  sessionId,
  sessionTitle: _sessionTitle,
  initialMessages = [],
}) => {
  const { t } = useTranslation();
  const HERMES_COMMANDS = getHermesCommands(t);

  // Get messages from session store if we have a sessionId
  const sessionMessages = useSessionStore((s) => s.messages);
  const fetchMessages = useSessionStore((s) => s.fetchMessages);
  const updateSessionActivity = useSessionStore((s) => s.updateSessionActivity);

  // Navigation store for tabs
  const { chatContext } = useNavigationStore();

  const [messages, setMessages] = useState<ExtendedChatMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState(sessionId);
  const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState(HERMES_COMMANDS);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [pendingApproval, setPendingApproval] = useState<{ id: string; command: string; description: string; allow_permanent: boolean; choices: string[] } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const isStoppedRef = useRef<boolean>(false); // Flag to track if user stopped

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef<boolean>(true);

  // Use activeTabId from navigation store if available
  const effectiveSessionId = chatContext?.sessionId || sessionId;

  // Load session messages when effectiveSessionId changes
  useEffect(() => {
    if (!effectiveSessionId) {
      // Clear messages when no session
      setMessages([]);
      return;
    }

    // Skip new session tabs (they start with "new_")
    if (effectiveSessionId.startsWith('new_')) {
      setMessages([]);
      return;
    }

    logger.component('ChatPage', 'effectiveSessionId changed:', effectiveSessionId);

    // Use fetchMessages which checks cache first
    fetchMessages(effectiveSessionId).catch((err) => {
      logger.error('[ChatPage] Failed to load session:', err);
    });
  }, [effectiveSessionId]); // Only depend on effectiveSessionId to prevent infinite loops

  // Update messages when sessionMessages changes (separate effect)
  useEffect(() => {
    if (effectiveSessionId && sessionMessages.length > 0) {
      const convertedMessages: ExtendedChatMessage[] = sessionMessages.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
        timestamp: msg.timestamp,
        reasoning: msg.reasoning, // Preserve reasoning from database
        tools: msg.tool_calls?.map(tc => ({
          name: tc.name,
          event_type: 'tool.completed',
          args: tc.args,
          duration: 0,
        })),
      }));
      setMessages(convertedMessages);
      logger.component('ChatPage', 'Updated messages from store:', convertedMessages.length);
    }
  }, [sessionMessages]); // Only depend on sessionMessages

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
  }, [messages]);

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
    if (!inputValue.trim() || isLoading || isStreaming) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    setIsLoading(true);
    setIsRunning(true);
    setThinkingStartTime(Date.now());
    isStoppedRef.current = false; // Reset stop flag

    // Add user message immediately
    const newUserMessage: ExtendedChatMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, newUserMessage]);

    // Add streaming placeholder message
    const streamingMessage: ExtendedChatMessage = {
      role: 'assistant',
      content: '',
      thinking: t('chat.thinking'),
      isStreaming: true,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, streamingMessage]);

    try {
      const historyForApi = messages.slice(-20);

      await streamChatRealtime(
        userMessage,
        currentSessionId,
        historyForApi,
        {
          onStatus: (_status, msg) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            // Update thinking message with status
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              if (lastMsg.role === 'assistant' && lastMsg.isStreaming) {
                newMessages[newMessages.length - 1] = {
                  ...lastMsg,
                  thinking: msg,
                };
              }
              return newMessages;
            });
          },
          onChunk: (_chunk, accumulated) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            setIsStreaming(true);
            // Update streaming message content progressively
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              if (lastMsg.role === 'assistant') {
                newMessages[newMessages.length - 1] = {
                  ...lastMsg,
                  content: accumulated,
                  thinking: undefined, // Clear thinking once content starts
                };
              }
              return newMessages;
            });
          },
          onReasoning: (text, _accumulated) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            // Update reasoning/thinking display
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              if (lastMsg.role === 'assistant' && lastMsg.isStreaming) {
                newMessages[newMessages.length - 1] = {
                  ...lastMsg,
                  reasoning: (lastMsg.reasoning || '') + text,
                };
              }
              return newMessages;
            });
          },
          onTool: (tool) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            console.log('[ChatPage] Tool call:', tool);
            // Add tool call to message
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              if (lastMsg.role === 'assistant') {
                const tools = lastMsg.tools || [];
                newMessages[newMessages.length - 1] = {
                  ...lastMsg,
                  tools: [...tools, tool],
                  thinking: undefined, // Clear thinking when tool is called
                };
              }
              return newMessages;
            });
          },
          onUsage: (usage) => {
            if (isStoppedRef.current || !isMountedRef.current) return;
            // Update message with token info
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              if (lastMsg.role === 'assistant') {
                newMessages[newMessages.length - 1] = {
                  ...lastMsg,
                  inputTokens: usage.prompt_tokens,
                  outputTokens: usage.completion_tokens,
                  totalTokens: usage.total_tokens,
                };
              }
              return newMessages;
            });
          },
          onComplete: (content, newSessionId, usage) => {
            if (!isMountedRef.current) return;
            const thinkingTime = thinkingStartTime ? Math.round((Date.now() - thinkingStartTime) / 1000) : 0;
            setIsStreaming(false);
            setIsLoading(false);
            setIsRunning(false);
            setThinkingStartTime(null);

            // Finalize the message - preserve reasoning and tools from streaming message
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              const assistantMessage: ExtendedChatMessage = {
                role: 'assistant',
                content: content,
                reasoning: lastMsg?.reasoning, // Preserve reasoning
                tools: lastMsg?.tools, // Preserve tools
                thinkingTime: thinkingTime,
                inputTokens: usage?.prompt_tokens,
                outputTokens: usage?.completion_tokens,
                totalTokens: usage?.total_tokens,
                timestamp: new Date().toISOString(),
              };
              newMessages[newMessages.length - 1] = assistantMessage;
              return newMessages;
            });

            // Update session activity in the list (for real-time sorting)
            if (effectiveSessionId && !effectiveSessionId.startsWith('new_')) {
              updateSessionActivity(effectiveSessionId);
            }

            // If new session was created, refresh the session list
            if (newSessionId) {
              // Refresh sessions list to include the new session
              useSessionStore.getState().refreshSessions();
              if (!currentSessionId) {
                setCurrentSessionId(newSessionId);
              }
            }
          },
          onError: (error) => {
            if (!isMountedRef.current) return;
            logger.error('[ChatPage] Stream error:', error);
            setIsStreaming(false);
            setIsLoading(false);
            setIsRunning(false);
            setThinkingStartTime(null);

            // Handle error message - error could be Error object, string, or object
            let errorMessage = 'Unknown error';
            if (error instanceof Error) {
              errorMessage = error.message || 'Unknown error';
            } else if (typeof error === 'string') {
              errorMessage = error;
            } else if (error && typeof error === 'object') {
              errorMessage = JSON.stringify(error);
            }

            const errorMsg: ExtendedChatMessage = {
              role: 'assistant',
              content: `${t('chat.error')}: ${errorMessage}\n\n${t('chat.ensureGateway')}。\n\n${t('chat.runCommand')}: hermes gateway`,
              timestamp: new Date().toISOString(),
            };

            setMessages(prev => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1] = errorMsg;
              return newMessages;
            });
          },
          onApproval: (approval) => {
            if (!isMountedRef.current) return;
            console.log('[ChatPage] Approval request:', approval);
            logger.debug('[ChatPage] Approval request:', approval);
            // Show approval dialog
            setPendingApproval(approval);
          },
        }
      );
    } catch (error) {
      if (!isMountedRef.current) return;
      logger.error('[ChatPage] Error:', error);
      const errorMessage: ExtendedChatMessage = {
        role: 'assistant',
        content: `${t('chat.error')}: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = errorMessage;
        return newMessages;
      });
      setIsLoading(false);
      setIsStreaming(false);
      setIsRunning(false);
      setThinkingStartTime(null);
    }
  }, [inputValue, isLoading, isStreaming, messages, currentSessionId, thinkingStartTime]);

  // Stop running
  const handleStop = () => {
    isStoppedRef.current = true; // Set stop flag
    setIsLoading(false);
    setIsStreaming(false);
    setIsRunning(false);
    setThinkingStartTime(null);

    // Update the last message to show it was stopped
    setMessages(prev => {
      const newMessages = [...prev];
      const lastMsg = newMessages[newMessages.length - 1];
      if (lastMsg.role === 'assistant' && lastMsg.isStreaming) {
        newMessages[newMessages.length - 1] = {
          ...lastMsg,
          isStreaming: false,
          content: lastMsg.content || t('chat.stopped'),
        };
      }
      return newMessages;
    });
  };

  // Handle approval response
  const handleApprovalResponse = async (choice: 'once' | 'session' | 'always' | 'deny') => {
    if (!pendingApproval) return;

    console.log('[ChatPage] Approval response:', choice);
    try {
      await respondApproval(pendingApproval.id, choice);
    } catch (error) {
      logger.error('[ChatPage] Failed to send approval response:', error);
    }
    setPendingApproval(null);
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
      {/* Tabs Bar */}
      <ChatTabs onNewChat={() => {
        // Generate a new session ID
        const newId = `new_${Date.now()}`;
        const { openTab } = useNavigationStore.getState();
        openTab(newId, '新会话', 'new');
      }} />

      {/* Messages */}
      <div className="chat-page-messages">
        {messages.length === 0 && !isStreaming && (
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
        {messages.map((msg, idx) => {
          // Check if message has any visible content
          const { cleanContent } = msg.content ? parseToolJson(msg.content) : { cleanContent: '' };
          const hasVisibleContent = cleanContent || msg.reasoning || (msg.tools && msg.tools.length > 0) || msg.thinking;

          // Skip rendering if no visible content
          if (!hasVisibleContent) return null;

          // Find the previous visible message to determine grouping
          let prevVisibleIdx = idx - 1;
          while (prevVisibleIdx >= 0) {
            const prevMsg = messages[prevVisibleIdx];
            const prevClean = prevMsg.content ? parseToolJson(prevMsg.content).cleanContent : '';
            if (prevClean || prevMsg.reasoning || (prevMsg.tools && prevMsg.tools.length > 0) || prevMsg.thinking) {
              break;
            }
            prevVisibleIdx--;
          }

          const isFirstInGroup = prevVisibleIdx < 0 || messages[prevVisibleIdx].role !== msg.role;

          return (
            <div key={idx} className={`chat-message ${msg.role} ${msg.isStreaming ? 'streaming' : ''} ${!isFirstInGroup ? 'grouped' : ''}`}>
              {isFirstInGroup && (
                <div className="message-avatar">
                  {msg.role === 'user' ? <UserIcon size={16} /> : <BotIcon size={16} />}
                </div>
              )}
              <div className="message-content">
              {/* Thinking indicator for assistant messages */}
              {msg.role === 'assistant' && msg.thinking && (
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
                <ThinkingBlock content={msg.reasoning} isActive={msg.isStreaming} />
              )}
              {/* Tool calls display - collapsible block */}
              {msg.role === 'assistant' && msg.tools && msg.tools.length > 0 && (
                <ToolsBlock tools={msg.tools} isStreaming={msg.isStreaming} />
              )}
              {/* Pending approval - inline card */}
              {msg.role === 'assistant' && msg.isStreaming && pendingApproval && (
                <PermissionCard
                  approval={pendingApproval}
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
              {msg.role === 'assistant' && !msg.isStreaming && (msg.thinkingTime || msg.totalTokens) && msg.content && (
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
                  disabled={isLoading}
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
                className={`run-action-btn ${isRunning ? 'running' : ''}`}
                onClick={isRunning ? handleStop : handleSendMessage}
                disabled={!isRunning && !inputValue.trim()}
              >
                {isRunning ? <StopIcon size={14} /> : <PlayIcon size={14} />}
                <span>{isRunning ? t('chat.stop') : t('chat.run')}</span>
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
