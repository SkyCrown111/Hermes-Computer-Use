import React, { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { FileIcon, FileTextIcon, PlusIcon, SendIcon, StopIcon, XIcon } from '../ui/Icons';
import { logger } from '../../lib/logger';

export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  content: string;
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

const MAX_TEXTAREA_HEIGHT = 200;

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

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  ({ onSendMessage, onStop, isStreaming, hasPendingInput, disabled }, ref) => {
    const { t } = useTranslation();
    const hermesCommands = useMemo(() => getHermesCommands(t), [t]);

    const [inputValue, setInputValue] = useState('');
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [showCommands, setShowCommands] = useState(false);
    const [filteredCommands, setFilteredCommands] = useState(hermesCommands);
    const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
    const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const addMenuRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      triggerSend: (text: string) => {
        setInputValue(text);
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      },
    }));

    useEffect(() => {
      inputRef.current?.focus();
    }, []);

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

    useEffect(() => {
      if (!showCommands || !dropdownRef.current) return;
      const items = dropdownRef.current.querySelectorAll('[data-cmd-item]');
      items[selectedCommandIndex]?.scrollIntoView({ block: 'nearest' });
    }, [selectedCommandIndex, showCommands]);

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
        const filtered = hermesCommands.filter(cmd => cmd.command.toLowerCase().startsWith(query));
        setFilteredCommands(filtered);
        setShowCommands(filtered.length > 0);
        setSelectedCommandIndex(0);
      } else {
        setShowCommands(false);
      }
    }, [hermesCommands, resizeTextarea]);

    const insertCommand = useCallback((command: string) => {
      setInputValue(`${command} `);
      setShowCommands(false);
      requestAnimationFrame(() => {
        resizeTextarea();
        inputRef.current?.focus();
      });
    }, [resizeTextarea]);

    const handleSend = useCallback(() => {
      if (!inputValue.trim()) return;
      const text = inputValue.trim();
      const files = attachedFiles;
      setInputValue('');
      setAttachedFiles([]);
      setShowCommands(false);
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
      onSendMessage(text, files);
    }, [attachedFiles, inputValue, onSendMessage]);

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
      e.target.value = '';
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
    }, [filteredCommands, handleSend, insertCommand, selectedCommandIndex, showCommands]);

    const canSend = !disabled && inputValue.trim().length > 0;
    const showStop = isStreaming && !hasPendingInput;
    const activeCommand = inputValue.startsWith('/') ? filteredCommands[selectedCommandIndex] : null;
    const showFooter = inputValue.startsWith('/') || attachedFiles.length > 0 || isStreaming || !!hasPendingInput;

    return (
      <div className="chat-input-area">
        <div className="chat-input-shell">
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

          {attachedFiles.length > 0 && (
            <div className="chat-input-files">
              {attachedFiles.map((file, idx) => (
                <span key={`${file.name}-${idx}`} className="file-chip">
                  <span className="file-icon" aria-hidden="true">
                    {file.isText ? <FileTextIcon size={12} /> : <FileIcon size={12} />}
                  </span>
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

          <div className="chat-input-container">
            <div className="chat-input-main">
              <div className="chat-input-editor">
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
              </div>
            </div>

            <div className="chat-input-footer">
              <div className="chat-input-footer-left">
                <div ref={addMenuRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="action-btn chat-composer-btn"
                    onClick={() => setShowAddMenu(prev => !prev)}
                    disabled={isStreaming || disabled}
                    title={t('chat.addFile')}
                    aria-label={t('chat.addFile')}
                  >
                    <PlusIcon size={14} />
                  </button>

                  {showAddMenu && (
                    <div className="add-menu-popup">
                      <button
                        type="button"
                        className="add-menu-item"
                        onClick={() => { fileInputRef.current?.click(); setShowAddMenu(false); }}
                      >
                        <span className="add-menu-item-icon"><FileTextIcon size={14} /></span>
                        {t('chat.addFile')}
                      </button>
                      <button
                        type="button"
                        className="add-menu-item"
                        onClick={() => { imageInputRef.current?.click(); setShowAddMenu(false); }}
                      >
                        <span className="add-menu-item-icon"><FileIcon size={14} /></span>
                        {t('chat.addImage')}
                      </button>
                      <button
                        type="button"
                        className="add-menu-item"
                        onClick={() => { setInputValue('/'); setShowCommands(true); setShowAddMenu(false); requestAnimationFrame(() => inputRef.current?.focus()); }}
                      >
                        <span className="add-menu-item-icon add-menu-command-icon">/</span>
                        {t('chat.slashCommands')}
                      </button>
                    </div>
                  )}
                </div>

                {showFooter && (
                  <div className="chat-input-metadata">
                    {inputValue.startsWith('/') && (
                      <span className="chat-input-badge">
                        <span className="chat-input-badge-mark">/</span>
                        <span className="chat-input-badge-text">{activeCommand?.command ?? '/'}</span>
                      </span>
                    )}
                    {attachedFiles.length > 0 && (
                      <span className="chat-input-badge">
                        <FileTextIcon size={12} />
                        <span className="chat-input-badge-text">{attachedFiles.length}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="chat-input-trailing">
                {(isStreaming || hasPendingInput) && (
                  <span className={`chat-input-presence${isStreaming ? ' streaming' : ''}${hasPendingInput ? ' pending' : ''}`} />
                )}
                {showStop ? (
                  <button
                    type="button"
                    className="action-btn stop chat-send-btn"
                    onClick={onStop}
                    title={t('chat.stop')}
                    aria-label={t('chat.stop')}
                  >
                    <StopIcon size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="action-btn send chat-send-btn"
                    onClick={handleSend}
                    disabled={!canSend}
                    title={t('chat.run')}
                    aria-label={t('chat.run')}
                  >
                    <SendIcon size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

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
