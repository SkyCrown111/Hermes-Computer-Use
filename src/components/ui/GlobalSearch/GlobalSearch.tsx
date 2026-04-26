// Global Search Overlay — triggered by Ctrl+Shift+F
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigationStore, useSessionStore } from '../../../stores';
import { useTranslation } from '../../../hooks/useTranslation';
import { SearchIcon } from '../Icons';
import { logger } from '../../../lib/logger';
import './GlobalSearch.css';

interface SearchResult {
  id: string;
  title: string;
  description: string;
  category: string;
  action: () => void;
}

export const GlobalSearch: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { t } = useTranslation();

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
    setSelectedIndex(0);
  }, []);

  // Fetch search results from Tauri backend
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    // Search across sessions — this searches session names locally
    // Full-text search would require a Tauri command
    try {
      const sessions = useSessionStore.getState().sessions;
      const qLower = q.toLowerCase();
      const filtered = sessions
        .filter(s =>
          (s.chat_name || '').toLowerCase().includes(qLower) ||
          s.id.includes(qLower) ||
          (s.model || '').toLowerCase().includes(qLower)
        )
        .slice(0, 10)
        .map(s => ({
          id: s.id,
          title: s.chat_name || `Session ${s.id.slice(0, 8)}`,
          description: `${s.model} · ${s.platform}`,
          category: t('nav.sessions'),
          action: () => useNavigationStore.getState().openTab(s.id, s.chat_name || s.id.slice(0, 8), 'session'),
        }));
      setResults(filtered);
    } catch (err) {
      logger.error('[GlobalSearch] Search failed:', err);
      setResults([]);
    }
  }, [t]);

  // Global Ctrl+Shift+F listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
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

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      results[selectedIndex].action();
      close();
    }
  };

  if (!isOpen) return null;

  // Group results by category
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});

  return (
    <div
      className="globalsearch-overlay"
      onClick={close}
      role="presentation"
    >
      <div
        className="globalsearch"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('shortcuts.globalSearch')}
      >
        <div className="globalsearch-header">
          <span className="globalsearch-icon" aria-hidden="true"><SearchIcon size={18} /></span>
          <input
            ref={inputRef}
            type="text"
            className="globalsearch-input"
            placeholder={t('sessions.search')}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            aria-label={t('shortcuts.globalSearch')}
            aria-autocomplete="list"
            aria-controls="search-results"
            aria-activedescendant={results[selectedIndex] ? `search-result-${results[selectedIndex].id}` : undefined}
          />
          <span className="globalsearch-hint" aria-hidden="true">ESC {t('shortcuts.toClose')}</span>
        </div>
        <div
          ref={listRef}
          className="globalsearch-results"
          id="search-results"
          role="listbox"
          aria-label={t('shortcuts.searchMessages')}
        >
          {Object.keys(grouped).length > 0 ? (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="globalsearch-group" role="group" aria-label={category}>
                <div className="globalsearch-group-title" aria-hidden="true">{category}</div>
                {items.map((r) => {
                  const globalIdx = results.indexOf(r);
                  return (
                    <div
                      key={r.id}
                      id={`search-result-${r.id}`}
                      className={`globalsearch-item ${globalIdx === selectedIndex ? 'globalsearch-item-selected' : ''}`}
                      onClick={() => { r.action(); close(); }}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      role="option"
                      aria-selected={globalIdx === selectedIndex}
                      tabIndex={-1}
                    >
                      <div className="globalsearch-item-title">{r.title}</div>
                      <div className="globalsearch-item-desc">{r.description}</div>
                    </div>
                  );
                })}
              </div>
            ))
          ) : query.trim() ? (
            <div className="globalsearch-empty" role="status">{t('common.noData')}</div>
          ) : (
            <div className="globalsearch-empty" role="status">{t('sessions.search')}</div>
          )}
        </div>
      </div>
    </div>
  );
};
