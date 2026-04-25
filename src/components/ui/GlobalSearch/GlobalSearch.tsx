// Global Search Overlay — triggered by Ctrl+Shift+F
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigationStore } from '../../../stores';
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
      const { useSessionStore } = await import('../../../stores');
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
          category: 'Sessions',
          action: () => useNavigationStore.getState().openTab(s.id, s.chat_name || s.id.slice(0, 8), 'session'),
        }));
      setResults(filtered);
    } catch (err) {
      logger.error('[GlobalSearch] Search failed:', err);
      setResults([]);
    }
  }, []);

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
    <div className="globalsearch-overlay" onClick={close}>
      <div className="globalsearch" onClick={e => e.stopPropagation()}>
        <div className="globalsearch-header">
          <span className="globalsearch-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="globalsearch-input"
            placeholder="Search sessions, messages..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
          />
          <span className="globalsearch-hint">ESC to close</span>
        </div>
        <div className="globalsearch-results">
          {Object.keys(grouped).length > 0 ? (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="globalsearch-group">
                <div className="globalsearch-group-title">{category}</div>
                {items.map((r) => {
                  const globalIdx = results.indexOf(r);
                  return (
                    <div
                      key={r.id}
                      className={`globalsearch-item ${globalIdx === selectedIndex ? 'globalsearch-item-selected' : ''}`}
                      onClick={() => { r.action(); close(); }}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                    >
                      <div className="globalsearch-item-title">{r.title}</div>
                      <div className="globalsearch-item-desc">{r.description}</div>
                    </div>
                  );
                })}
              </div>
            ))
          ) : query.trim() ? (
            <div className="globalsearch-empty">No results found</div>
          ) : (
            <div className="globalsearch-empty">Type to search sessions...</div>
          )}
        </div>
      </div>
    </div>
  );
};
