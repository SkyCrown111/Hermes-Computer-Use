// Global Command Palette — triggered by Ctrl+K
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigationStore } from '../../../stores';
import { logger } from '../../../lib/logger';
import './CommandPalette.css';

interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  action: () => void;
}

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setActiveItem, openChat } = useNavigationStore();

  const commands: Command[] = [
    { id: 'new-chat', label: 'New Chat', icon: '💬', action: () => openChat() },
    { id: 'dashboard', label: 'Go to Dashboard', icon: '🏠', action: () => setActiveItem('dashboard') },
    { id: 'sessions', label: 'Go to Sessions', icon: '💬', action: () => setActiveItem('sessions') },
    { id: 'skills', label: 'Go to Skills', icon: '🎯', action: () => setActiveItem('skills') },
    { id: 'tasks', label: 'Go to Tasks', icon: '⏰', action: () => setActiveItem('tasks') },
    { id: 'gateway', label: 'Go to Gateway', icon: '🌐', action: () => setActiveItem('gateway') },
    { id: 'monitor', label: 'Go to Monitor', icon: '📊', action: () => setActiveItem('monitor') },
    { id: 'memory', label: 'Go to Memory', icon: '🧠', action: () => setActiveItem('memory') },
    { id: 'platforms', label: 'Go to Platforms', icon: '🔌', action: () => setActiveItem('platforms') },
    { id: 'settings', label: 'Go to Settings', icon: '⚙️', action: () => setActiveItem('settings') },
    { id: 'preferences', label: 'Go to Preferences', icon: '🎨', action: () => setActiveItem('preferences') },
    { id: 'files', label: 'Go to Files', icon: '📁', action: () => setActiveItem('files') },
  ];

  // Filter commands by query
  const filtered = query
    ? commands.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
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
    <div className="command-palette-overlay" onClick={close}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <div className="command-palette-header">
          <span className="command-palette-icon">⌘</span>
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Type a command..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="command-palette-results">
          {filtered.length > 0 ? (
            filtered.map((cmd, i) => (
              <div
                key={cmd.id}
                className={`command-item ${i === selectedIndex ? 'command-item-selected' : ''}`}
                onClick={() => execute(cmd)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="command-icon">{cmd.icon}</span>
                <div className="command-info">
                  <span className="command-label">{cmd.label}</span>
                  {cmd.description && <span className="command-desc">{cmd.description}</span>}
                </div>
              </div>
            ))
          ) : (
            <div className="command-empty">No matching commands</div>
          )}
        </div>
      </div>
    </div>
  );
};
