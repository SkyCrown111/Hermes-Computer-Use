import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { PlusIcon, PlayIcon, StopIcon, HourglassIcon, XIcon } from '../ui/Icons';
import { logger } from '../../lib/logger';

// ---- Types ----

export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  content: string; // text content or base64
  isText: boolean;
}

export interface ChatInputHandle {
  triggerSend: (text: string) => void;
}

interface PendingMessage {
  text: string;
  files: AttachedFile[];
}

interface ChatInputProps {
  onSendMessage: (text: string, attachedFiles: AttachedFile[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

// ---- Constants ----

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

// ---- Component ----

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  ({ onSendMessage, onStop, isStreaming }, ref) => {
    const { t } = useTranslation();
    const HERMES_COMMANDS = getHermesCommands(t);

    // ---- State ----
    const [inputValue, setInputValue] = useState('');
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [showCommands, setShowCommands] = useState(false);
    const [filteredCommands, setFilteredCommands] = useState(HERMES_COMMANDS);
    const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
    const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
    const [pendingMessage, setPendingMessage] = useState<PendingMessage | null>(null);

    // ---- Refs ----
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const addMenuRef = useRef<HTMLDivElement>(null);

    // ---- Imperative handle for parent (handleRegenerate) ----
    useImperativeHandle(ref, () => ({
      triggerSend: (text: string) => {
        setInputValue(text);
        inputRef.current?.focus();
      },
    }));

    // ---- Effects ----

    // Focus input on mount
    useEffect(() => {
      inputRef.current?.focus();
    }, []);

    // Send pending message when streaming ends
    useEffect(() => {
      if (!isStreaming && pendingMessage) {
        logger.debug('[ChatInput] Streaming ended, sending pending message');
        onSendMessage(pendingMessage.text, pendingMessage.files);
        setPendingMessage(null);
      }
    }, [isStreaming, pendingMessage, onSendMessage]);

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

    // ---- Handlers ----

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

    const insertCommand = (command: string) => {
      setInputValue(command + ' ');
      setShowCommands(false);
      inputRef.current?.focus();
    };

    const handleSend = () => {
      if (!inputValue.trim()) return;

      // If streaming, queue the message to be sent when streaming ends
      if (isStreaming) {
        logger.debug('[ChatInput] Streaming in progress, queuing message');
        setPendingMessage({ text: inputValue.trim(), files: attachedFiles });
        setInputValue('');
        setAttachedFiles([]);
        return;
      }

      onSendMessage(inputValue.trim(), attachedFiles);
      setInputValue('');
      setAttachedFiles([]);
    };

    const readFileAsContent = (file: File): Promise<AttachedFile> => {
      return new Promise((resolve, reject) => {
        const isText = file.type.startsWith('text/') || [
          '.md', '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html',
          '.yml', '.yaml', '.toml', '.xml', '.svg', '.env', '.gitignore',
          '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.sh', '.bash',
          '.txt', '.csv', '.log',
        ].some(ext => file.name.toLowerCase().endsWith(ext));

        if (isText) {
          const reader = new FileReader();
          reader.onload = () => resolve({
            name: file.name,
            type: file.type,
            size: file.size,
            content: reader.result as string,
            isText: true,
          });
          reader.onerror = () => reject(reader.error);
          reader.readAsText(file);
        } else {
          // For non-text files, read as base64 for potential image display
          const reader = new FileReader();
          reader.onload = () => resolve({
            name: file.name,
            type: file.type,
            size: file.size,
            content: reader.result as string,
            isText: false,
          });
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }
      });
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) {
        const filePromises = Array.from(files).map(f => readFileAsContent(f));
        try {
          const fileData = await Promise.all(filePromises);
          setAttachedFiles(prev => [...prev, ...fileData]);
        } catch (err) {
          logger.error('[ChatInput] Failed to read files:', err);
        }
      }
      setShowAddMenu(false);
    };

    const removeAttachedFile = (index: number) => {
      setAttachedFiles(prev => prev.filter((_, i) => i !== index));
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
        handleSend();
      }
    };

    // ---- Render ----

    return (
      <div className="chat-input-wrapper">
        <div className="chat-input-container">
          {/* Slash Commands Dropdown */}
          {showCommands && (
            <div className="slash-commands-dropdown">
              <div className="slash-commands-list">
                {filteredCommands.map((cmd, index) => (
                  <div
                    key={cmd.command}
                    className={`slash-command-item ${index === selectedCommandIndex ? 'selected' : ''}`}
                    onClick={() => insertCommand(cmd.command)}
                  >
                    <span className="slash-command-name">{cmd.command}</span>
                    <span className="slash-command-desc">{cmd.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attached Files */}
          {attachedFiles.length > 0 && (
            <div className="attached-files">
              {attachedFiles.map((file, idx) => (
                <div key={idx} className="attached-file-item">
                  <span className="attached-file-name">{file.name}</span>
                  <button
                    className="remove-file-btn"
                    onClick={() => removeAttachedFile(idx)}
                  >
                    <XIcon size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Pending Message Indicator */}
          {pendingMessage && (
            <div className="pending-message-indicator">
              <span className="pending-icon"><HourglassIcon size={14} /></span>
              <span className="pending-text">{t('chat.messageQueued')}</span>
              <button
                className="cancel-pending-btn"
                onClick={() => setPendingMessage(null)}
                title={t('common.cancel')}
              >
                <XIcon size={14} />
              </button>
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
                  disabled={isStreaming}
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
                        imageInputRef.current?.click();
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
                className={`run-action-btn ${isStreaming ? 'running' : ''}`}
                onClick={isStreaming ? onStop : handleSend}
                disabled={!isStreaming && !inputValue.trim()}
              >
                {isStreaming ? <StopIcon size={14} /> : <PlayIcon size={14} />}
                <span>{isStreaming ? t('chat.stop') : t('chat.run')}</span>
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
          {/* Hidden Image Input - only accepts images */}
          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>
      </div>
    );
  }
);

ChatInput.displayName = 'ChatInput';
