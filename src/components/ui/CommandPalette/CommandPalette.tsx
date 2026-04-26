// Global Command Palette — triggered by Ctrl+K
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigationStore } from '../../../stores';
import { useTranslation } from '../../../hooks/useTranslation';
import { logger } from '../../../lib/logger';
import './CommandPalette.css';

interface Command {
  id: string;
  labelKey: string;
  descriptionKey?: string;
  icon?: string;
  action: () => void;
}

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { setActiveItem, openChat } = useNavigationStore();
  const { t } = useTranslation();

  const commands: Command[] = [
    { id: 'new-chat', labelKey: 'shortcuts.newChat', icon: '>>', action: () => openChat() },
    { id: 'dashboard', labelKey: 'nav.home', icon: '[]', action: () => setActiveItem('dashboard') },
    { id: 'sessions', labelKey: 'nav.sessions', icon: '><', action: () => setActiveItem('sessions') },
    { id: 'skills', labelKey: 'nav.skills', icon: '()', action: () => setActiveItem('skills') },
    { id: 'tasks', labelKey: 'nav.tasks', icon: '{}', action: () => setActiveItem('tasks') },
    { id: 'gateway', labelKey: 'gateway.title', icon: '<>', action: () => setActiveItem('gateway') },
    { id: 'monitor', labelKey: 'nav.monitor', icon: '~~', action: () => setActiveItem('monitor') },
    { id: 'memory', labelKey: 'nav.memory', icon: '##', action: () => setActiveItem('memory') },
    { id: 'platforms', labelKey: 'nav.platforms', icon: '||', action: () => setActiveItem('platforms') },
    { id: 'settings', labelKey: 'nav.settings', icon: '**', action: () => setActiveItem('settings') },
    { id: 'preferences', labelKey: 'nav.preferences', icon: '++', action: () => setActiveItem('preferences') },
    { id: 'files', labelKey: 'nav.files', icon: '[]', action: () => setActiveItem('files') },
  ];

  // Filter commands by query
  const filtered = query
    ? commands.filter(c =>
        t(c.labelKey).toLowerCase().includes(query.toLowerCase()) ||
        c.id.includes(query.toLowerCase())
      )
    : commands;

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const execute = useCallback((cmd: Command) => {
    logger.component('CommandPalette', 'Executing:', cmd.id);
    cmd.action();
    close();
  }, [close]);

  // Global Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      execute(filtered[selectedIndex]);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="command-palette-overlay"
      onClick={close}
      role="presentation"
    >
      <div
        className="command-palette"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('shortcuts.commandPalette')}
      >
        <div className="command-palette-header">
          <span className="command-palette-icon" aria-hidden="true">⌘</span>
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder={t('common.search')}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            aria-label={t('common.search')}
            aria-autocomplete="list"
            aria-controls="command-list"
            aria-activedescendant={filtered[selectedIndex] ? `cmd-${filtered[selectedIndex].id}` : undefined}
          />
        </div>
        <div
          ref={listRef}
          className="command-palette-results"
          role="listbox"
          id="command-list"
          aria-label={t('shortcuts.navigateCommands')}
        >
          {filtered.length > 0 ? (
            filtered.map((cmd, i) => (
              <div
                key={cmd.id}
                id={`cmd-${cmd.id}`}
                className={`command-item ${i === selectedIndex ? 'command-item-selected' : ''}`}
                onClick={() => execute(cmd)}
                onMouseEnter={() => setSelectedIndex(i)}
                role="option"
                aria-selected={i === selectedIndex}
                tabIndex={-1}
              >
                <span className="command-icon" aria-hidden="true">{cmd.icon}</span>
                <div className="command-info">
                  <span className="command-label">{t(cmd.labelKey)}</span>
                  {cmd.descriptionKey && <span className="command-desc">{t(cmd.descriptionKey)}</span>}
                </div>
              </div>
            ))
          ) : (
            <div className="command-empty" role="status">{t('common.noData')}</div>
          )}
        </div>
      </div>
    </div>
  );
};
