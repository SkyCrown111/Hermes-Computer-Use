import React, { memo } from 'react';
import { ChatIcon } from '../ui/Icons';
import type { SessionSearchResult } from './constants';

interface SessionSearchCardProps {
  result: SessionSearchResult;
  onClick: () => void;
  selected?: boolean;
  onToggle?: () => void;
}

const SessionSearchCardComponent: React.FC<SessionSearchCardProps> = ({ result, onClick, selected, onToggle }) => {
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
    <div className={`session-search-card ${selected ? 'selected' : ''}`} onClick={onClick}>
      <div className="session-search-card-header">
        {onToggle && (
          <label className="session-search-checkbox" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={!!selected} onChange={() => onToggle()} />
          </label>
        )}
        <span className="session-search-card-icon"><ChatIcon size={14} /></span>
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

// Memoize to prevent re-renders when parent list updates but this card's props haven't changed
export const SessionSearchCard = memo(SessionSearchCardComponent);
