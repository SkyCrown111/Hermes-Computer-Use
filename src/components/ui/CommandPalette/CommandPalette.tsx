import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigationStore } from '../../../stores';
import { useTranslation } from '../../../hooks/useTranslation';
import { logger } from '../../../lib/logger';
import './CommandPalette.css';

interface Command {
  id: string;
  labelKey: string;
  description: string;
  section: 'chat' | 'workspace';
  hint?: string;
  action: () => void;
}

export const OPEN_COMMAND_PALETTE_EVENT = 'hermes:open-command-palette';

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const setActiveItem = useNavigationStore(s => s.setActiveItem);
  const openTab = useNavigationStore(s => s.openTab);
  const { t } = useTranslation();

  const commands: Command[] = useMemo(() => ([
    { id: 'new-chat', labelKey: 'shortcuts.newChat', description: 'Start a fresh conversation workspace', section: 'chat', hint: 'Ctrl N', action: () => openTab(`new_${Date.now()}`, t('shortcuts.newChat'), 'new') },
    { id: 'sessions', labelKey: 'nav.sessions', description: 'Browse recent chats and open threads', section: 'chat', action: () => setActiveItem('sessions') },
    { id: 'dashboard', labelKey: 'nav.home', description: 'View activity, stats, and system overview', section: 'workspace', action: () => setActiveItem('dashboard') },
    { id: 'skills', labelKey: 'nav.skills', description: 'Manage installed skills and runbooks', section: 'workspace', action: () => setActiveItem('skills') },
    { id: 'profiles', labelKey: 'nav.profiles', description: 'Manage Hermes Agent profiles and multi-agent configs', section: 'workspace', action: () => setActiveItem('profiles') },
    { id: 'tasks', labelKey: 'nav.tasks', description: 'Review scheduled tasks and automations', section: 'workspace', action: () => setActiveItem('tasks') },
    { id: 'kanban', labelKey: 'nav.kanban', description: 'Open the task board and track work by status', section: 'workspace', action: () => setActiveItem('kanban') },
    { id: 'gateway', labelKey: 'gateway.title', description: 'Inspect gateway health and routing', section: 'workspace', action: () => setActiveItem('gateway') },
    { id: 'monitor', labelKey: 'nav.monitor', description: 'Watch live runtime activity', section: 'workspace', action: () => setActiveItem('monitor') },
    { id: 'memory', labelKey: 'nav.memory', description: 'Inspect memory state and recalls', section: 'workspace', action: () => setActiveItem('memory') },
    { id: 'platforms', labelKey: 'nav.platforms', description: 'Switch connected execution platforms', section: 'workspace', action: () => setActiveItem('platforms') },
    { id: 'files', labelKey: 'nav.files', description: 'Browse project files and artifacts', section: 'workspace', action: () => setActiveItem('files') },
    { id: 'mcp', labelKey: 'nav.mcp', description: 'Manage MCP servers and connectivity', section: 'workspace', action: () => setActiveItem('mcp') },
    { id: 'settings', labelKey: 'nav.settings', description: 'Edit models, agents, terminal, and providers', section: 'workspace', action: () => setActiveItem('settings') },
    { id: 'preferences', labelKey: 'nav.preferences', description: 'Tune appearance, layout, and notifications', section: 'workspace', action: () => setActiveItem('preferences') },
  ]), [openTab, setActiveItem, t]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((cmd) => {
      const label = t(cmd.labelKey).toLowerCase();
      return label.includes(q) || cmd.id.includes(q) || cmd.description.toLowerCase().includes(q);
    });
  }, [commands, query, t]);

  const grouped = useMemo(() => {
    const groups = [
      { id: 'chat', label: 'Chat', items: filtered.filter(cmd => cmd.section === 'chat') },
      { id: 'workspace', label: 'Workspace', items: filtered.filter(cmd => cmd.section === 'workspace') },
    ];
    return groups.filter(group => group.items.length > 0);
  }, [filtered]);

  const flatItems = useMemo(() => grouped.flatMap(group => group.items), [grouped]);

  const execute = useCallback((cmd: Command) => {
    logger.component('CommandPalette', 'Executing:', cmd.id);
    cmd.action();
    close();
  }, [close]);

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

  useEffect(() => {
    const openHandler = () => setIsOpen(true);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, openHandler);
    return () => window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, openHandler);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatItems[selectedIndex]) {
      e.preventDefault();
      execute(flatItems[selectedIndex]);
    }
  };

  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(0);
    }
  }, [flatItems.length, selectedIndex]);

  if (!isOpen) return null;

  let optionIndex = -1;

  return (
    <div className="command-palette-overlay" onClick={close} role="presentation">
      <div
        className="command-palette"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('shortcuts.commandPalette')}
      >
        <div className="command-palette-header">
          <div className="command-palette-header-copy">
            <span className="command-palette-kicker">Workspace Launcher</span>
            <span className="command-palette-title">Jump anywhere</span>
          </div>
          <span className="command-palette-shortcut">Ctrl K</span>
        </div>
        <div className="command-palette-search">
          <span className="command-palette-icon" aria-hidden="true"><SearchIcon /></span>
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
            aria-activedescendant={flatItems[selectedIndex] ? `cmd-${flatItems[selectedIndex].id}` : undefined}
          />
        </div>
        <div className="command-palette-results" role="listbox" id="command-list" aria-label={t('shortcuts.navigateCommands')}>
          {grouped.length > 0 ? (
            grouped.map((group) => (
              <div key={group.id} className="command-group">
                <div className="command-group-label">{group.label}</div>
                {group.items.map((cmd) => {
                  optionIndex += 1;
                  const isSelected = optionIndex === selectedIndex;
                  return (
                    <div
                      key={cmd.id}
                      id={`cmd-${cmd.id}`}
                      className={`command-item ${isSelected ? 'command-item-selected' : ''}`}
                      onClick={() => execute(cmd)}
                      onMouseEnter={() => setSelectedIndex(optionIndex)}
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={-1}
                    >
                      <div className="command-badge">{t(cmd.labelKey).slice(0, 1).toUpperCase()}</div>
                      <div className="command-info">
                        <div className="command-row">
                          <span className="command-label">{t(cmd.labelKey)}</span>
                          {cmd.hint && <span className="command-hint">{cmd.hint}</span>}
                        </div>
                        <span className="command-desc">{cmd.description}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="command-empty" role="status">{t('common.noData')}</div>
          )}
        </div>
        <div className="command-palette-footer">
          <span>Enter to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
};
