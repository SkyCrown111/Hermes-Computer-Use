import React, { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { PlusIcon, PlayIcon, StopIcon, XIcon } from '../ui/Icons';
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

interface ChatInputProps {
  onSendMessage: (text: string, attachedFiles: AttachedFile[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  hasPendingInput?: boolean;
  disabled?: boolean;
}

// ---- Constants ----

const MAX_TEXTAREA_HEIGHT = 200; // px, matches CSS max-height

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
  ({ onSendMessage, onStop, isStreaming, hasPendingInput, disabled }, ref) => {
    const { t } = useTranslation();
    const HERMES_COMMANDS = useMemo(() => getHermesCommands(t), [t]);

    // ---- State ----
    const [inputValue, setInputValue] = useState('');
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [showCommands, setShowCommands] = useState(false);
    const [filteredCommands, setFilteredCommands] = useState(HERMES_COMMANDS);
    const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
    const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

    // ---- Refs ----
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const addMenuRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // ---- Imperative handle ----
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

    // Close menus on outside click
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
          setShowAddMenu(false);
        }
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          setShowCommands(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Scroll selected dropdown item into view
    useEffect(() => {
      if (!showCommands || !dropdownRef.current) return;
      const items = dropdownRef.current.querySelectorAll('[data-cmd-item]');
      items[selectedCommandIndex]?.scrollIntoView({ block: 'nearest' });
    }, [selectedCommandIndex, showCommands]);

    // ---- Handlers ----

    const resizeTextarea = useCallback(() => {
      const el = inputRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setInputValue(value);
      requestAnimationFrame(resizeTextarea);

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
    }, [HERMES_COMMANDS, resizeTextarea]);

    const insertCommand = useCallback((command: string) => {
      setInputValue(command + ' ');
      setShowCommands(false);
      inputRef.current?.focus();
    }, []);

    const handleSend = useCallback(() => {
      if (!inputValue.trim()) return;

      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }

      const text = inputValue.trim();
      const files = attachedFiles;
      setInputValue('');
      setAttachedFiles([]);
      onSendMessage(text, files);
    }, [inputValue, attachedFiles, onSendMessage]);

    const readFileAsContent = useCallback((file: File): Promise<AttachedFile> => {
      return new Promise((resolve, reject) => {
        const isText = file.type.startsWith('text/') || [
          '.md', '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html',
          '.yml', '.yaml', '.toml', '.xml', '.svg', '.env', '.gitignore',
          '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.sh', '.bash',
          '.txt', '.csv', '.log',
        ].some(ext => file.name.toLowerCase().endsWith(ext));

        const reader = new FileReader();
        reader.onload = () => resolve({
          name: file.name,
          type: file.type,
          size: file.size,
          content: reader.result as string,
          isText,
        });
        reader.onerror = () => reject(reader.error);

        if (isText) {
          reader.readAsText(file);
        } else {
          reader.readAsDataURL(file);
        }
      });
    }, []);

    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) {
        try {
          const fileData = await Promise.all(Array.from(files).map(readFileAsContent));
          setAttachedFiles(prev => [...prev, ...fileData]);
        } catch (err) {
          logger.error('[ChatInput] Failed to read files:', err);
        }
      }
      setShowAddMenu(false);
    }, [readFileAsContent]);

    const removeAttachedFile = useCallback((index: number) => {
      setAttachedFiles(prev => prev.filter((_, i) => i !== index));
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (showCommands && filteredCommands.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedCommandIndex(prev => (prev + 1) % filteredCommands.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedCommandIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
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
    }, [showCommands, filteredCommands, selectedCommandIndex, insertCommand, handleSend]);

    // ---- Derived ----
    const canSend = inputValue.trim().length > 0;
    const showStop = isStreaming && !hasPendingInput;

    // ---- Render ----
    return (
      <div className="chat-input-area">
        {/* Inner container with relative positioning for dropdowns */}
        <div style={{ position: 'relative' }}>
          {/* Slash Command Dropdown */}
          {showCommands && filteredCommands.length > 0 && (
            <div className="chat-input-dropdown" ref={dropdownRef} role="listbox">
              {filteredCommands.map((cmd, index) => (
                <div
                  key={cmd.command}
                  data-cmd-item
                  className={`cmd-item ${index === selectedCommandIndex ? 'selected' : ''}`}
                  role="option"
                  aria-selected={index === selectedCommandIndex}
                  tabIndex={-1}
                  onClick={() => insertCommand(cmd.command)}
                  onMouseEnter={() => setSelectedCommandIndex(index)}
                >
                  <span className="cmd-name">{cmd.command}</span>
                  <span className="cmd-desc">{cmd.description}</span>
                </div>
              ))}
            </div>
          )}

          {/* Attached Files */}
          {attachedFiles.length > 0 && (
            <div className="chat-input-files">
              {attachedFiles.map((file, idx) => (
                <span key={idx} className="file-chip">
                  <span className="file-icon">{file.isText ? '📄' : '🖼'}</span>
                  <span className="file-name">{file.name}</span>
                  <button
                    className="file-remove"
                    onClick={() => removeAttachedFile(idx)}
                    aria-label={`Remove ${file.name}`}
                  >
                    <XIcon size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Main Input Container */}
          <div className="chat-input-container" ref={containerRef}>
            {/* Textarea */}
            <textarea
              ref={inputRef}
              className="chat-textarea"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.inputPlaceholder')}
              rows={1}
              disabled={disabled}
            />

            {/* Action Buttons */}
            <div className="chat-input-actions">
              {/* Add File Button */}
              <div ref={addMenuRef} style={{ position: 'relative' }}>
                <button
                  className="action-btn"
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  disabled={isStreaming || disabled}
                  title={t('chat.addFile')}
                  aria-label={t('chat.addFile')}
                >
                  <PlusIcon size={14} />
                </button>

                {showAddMenu && (
                  <div className="add-menu-popup">
                    <button
                      className="add-menu-item"
                      onClick={() => { fileInputRef.current?.click(); setShowAddMenu(false); }}
                    >
                      <span>📄</span> {t('chat.addFile')}
                    </button>
                    <button
                      className="add-menu-item"
                      onClick={() => { imageInputRef.current?.click(); setShowAddMenu(false); }}
                    >
                      <span>🖼</span> {t('chat.addImage')}
                    </button>
                    <button
                      className="add-menu-item"
                      onClick={() => { setInputValue('/'); inputRef.current?.focus(); setShowAddMenu(false); }}
                    >
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>/</span> {t('chat.slashCommands')}
                    </button>
                  </div>
                )}
              </div>

              {/* Send / Stop Button */}
              {showStop ? (
                <button
                  className="action-btn stop"
                  onClick={onStop}
                  title={t('chat.stop')}
                  aria-label={t('chat.stop')}
                >
                  <StopIcon size={14} />
                </button>
              ) : (
                <button
                  className="action-btn send"
                  onClick={handleSend}
                  disabled={!canSend}
                  title={t('chat.run')}
                  aria-label={t('chat.run')}
                  style={{ opacity: canSend ? 1 : 0.4, cursor: canSend ? 'pointer' : 'default' }}
                >
                  <PlayIcon size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Hidden File Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <input
          ref={imageInputRef}
          type="file"
          multiple
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>
    );
  }
);

ChatInput.displayName = 'ChatInput';
