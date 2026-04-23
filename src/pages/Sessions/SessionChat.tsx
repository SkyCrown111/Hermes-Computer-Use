// Session Chat Interface Component
// Allows continuing a conversation with Hermes Agent

import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage, streamChatMessage, checkHermesApiHealth, type ChatMessage } from '../../services/hermesChat';
import { useTranslation } from '../../hooks/useTranslation';
import type { Session, SessionMessage } from '../../types';
import './SessionChat.css';

// Hermes Agent slash commands - descriptions set in component
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

interface SessionChatProps {
  session: Session;
  initialMessages: SessionMessage[];
  onClose: () => void;
}

export const SessionChat: React.FC<SessionChatProps> = ({
  session,
  initialMessages,
  onClose,
}) => {
  const { t } = useTranslation();
  const HERMES_COMMANDS = getHermesCommands(t);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState(HERMES_COMMANDS);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isStoppedRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Convert SessionMessage to ChatMessage format
  useEffect(() => {
    const converted: ChatMessage[] = initialMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp,
      }));
    setMessages(converted);
  }, [initialMessages]);

  // Check API availability on mount
  useEffect(() => {
    checkHermesApiHealth().then(available => {
      setApiAvailable(available);
      console.log('[SessionChat] Hermes API available:', available);
    });
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

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

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading || isStreaming) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    setIsLoading(true);
    setIsRunning(true);
    isStoppedRef.current = false; // Reset stop flag

    // Add user message immediately
    const newUserMessage: ChatMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, newUserMessage]);

    // Track streaming content
    let accumulatedContent = '';

    try {
      // Try streaming first
      setIsStreaming(true);
      setStreamingContent('');

      const historyForApi = messages.slice(-20); // Last 20 messages for context

      await new Promise<void>((resolve) => {
        streamChatMessage(
          userMessage,
          session.id,
          historyForApi,
          (chunk) => {
            if (isStoppedRef.current) return;
            accumulatedContent += chunk;
            setStreamingContent(accumulatedContent);
          },
          (_sessionId) => {
            if (isStoppedRef.current) return;
            setIsStreaming(false);
            setStreamingContent('');
            const assistantMessage: ChatMessage = {
              role: 'assistant',
              content: accumulatedContent,
              timestamp: new Date().toISOString(),
            };
            setMessages(prev => [...prev, assistantMessage]);
            setIsLoading(false);
            setIsRunning(false);
            resolve();
          },
          (error) => {
            if (isStoppedRef.current) return;
            console.error('[SessionChat] Stream error:', error);
            setIsStreaming(false);
            // Fallback to non-streaming
            sendChatMessage(userMessage, session.id, historyForApi)
              .then(({ response }) => {
                const assistantMessage: ChatMessage = {
                  role: 'assistant',
                  content: response,
                  timestamp: new Date().toISOString(),
                };
                setMessages(prev => [...prev, assistantMessage]);
              })
              .catch(err => {
                console.error('[SessionChat] Fallback error:', err);
                const errorMsg = err instanceof Error ? err.message : String(err);
                const errorMessage: ChatMessage = {
                  role: 'assistant',
                  content: `Error: ${errorMsg || 'Unknown error'}. Please check if Hermes Gateway is running.`,
                  timestamp: new Date().toISOString(),
                };
                setMessages(prev => [...prev, errorMessage]);
              })
              .finally(() => {
                setIsLoading(false);
                setIsRunning(false);
                resolve();
              });
          }
        );
      });
    } catch (error) {
      console.error('[SessionChat] Error:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${errorMsg || 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsLoading(false);
      setIsStreaming(false);
      setIsRunning(false);
    }
  };

  // Stop running
  const handleStop = () => {
    isStoppedRef.current = true;
    setIsLoading(false);
    setIsStreaming(false);
    setIsRunning(false);
    setStreamingContent('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="session-chat-overlay" onClick={onClose}>
      <div className="session-chat-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-info">
            <h2>💬 {t('sessions.continue')}</h2>
            <span className="chat-session-id">{session.id.slice(0, 12)}...</span>
          </div>
          <div className="chat-header-actions">
            {apiAvailable === false && (
              <span className="api-status offline">⚠️ API {t('dashboard.offline')}</span>
            )}
            {apiAvailable === true && (
              <span className="api-status online">✅ API {t('dashboard.online')}</span>
            )}
            <button className="chat-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">
              <p>{t('common.noData')}, {t('chat.startConversation').toLowerCase()}</p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.role}`}>
              <div className="message-avatar">
                {msg.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="message-bubble">
                <div className="message-text">{msg.content}</div>
                {msg.timestamp && (
                  <div className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isStreaming && streamingContent && (
            <div className="chat-message assistant streaming">
              <div className="message-avatar">🤖</div>
              <div className="message-bubble">
                <div className="message-text">{streamingContent}</div>
              </div>
            </div>
          )}
          {isLoading && !isStreaming && (
            <div className="chat-message assistant loading">
              <div className="message-avatar">🤖</div>
              <div className="message-bubble">
                <div className="message-text">
                  <span className="typing-indicator">{t('chat.thinking')}</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="chat-input-area">
          {/* Attached Files */}
          {attachedFiles.length > 0 && (
            <div className="attached-files">
              {attachedFiles.map((file, idx) => (
                <div key={idx} className="attached-file">
                  <span className="file-icon">📄</span>
                  <span className="file-name">{file}</span>
                  <button
                    className="file-remove"
                    onClick={() => removeAttachedFile(idx)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input Container */}
          <div className="input-container">
            {/* Add Button (Left) */}
            <div className="add-button-wrapper" ref={addMenuRef}>
              <button
                className="add-button"
                onClick={() => setShowAddMenu(!showAddMenu)}
                disabled={isLoading}
              >
                +
              </button>
              {showAddMenu && (
                <div className="add-menu">
                  <button
                    className="add-menu-item"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <span className="menu-icon">📁</span>
                    <span>{t('chat.addFile')}</span>
                  </button>
                  <button
                    className="add-menu-item"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <span className="menu-icon">🖼️</span>
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
                    <span className="menu-icon">⚡</span>
                    <span>{t('chat.slashCommands')}</span>
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>

            {/* Textarea */}
            <div className="textarea-wrapper">
              <textarea
                ref={inputRef}
                className="chat-input"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={t('chat.inputPlaceholder')}
                rows={3}
                disabled={apiAvailable === false}
              />

              {/* Slash Commands Dropdown */}
              {showCommands && (
                <div className="commands-dropdown">
                  {filteredCommands.map((cmd) => (
                    <button
                      key={cmd.command}
                      className="command-item"
                      onClick={() => insertCommand(cmd.command)}
                    >
                      <span className="command-name">{cmd.command}</span>
                      <span className="command-desc">{cmd.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Run/Stop Button (Right) */}
            <button
              className={`run-button ${isRunning ? 'running' : ''}`}
              onClick={isRunning ? handleStop : handleSendMessage}
              disabled={!isRunning && (!inputValue.trim() || apiAvailable === false)}
            >
              {isRunning ? (
                <span className="stop-icon">■</span>
              ) : (
                <span className="run-icon">▶</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
