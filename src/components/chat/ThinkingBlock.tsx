import React, { useState } from 'react';

interface ThinkingBlockProps {
  content: string;
  isActive?: boolean;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ content, isActive }) => {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split('\n').filter(l => l.trim());
  const firstLine = lines[0]?.replace(/\s+/g, ' ').trim() || '';
  const preview = firstLine.length > 80 ? firstLine.slice(0, 80) + '...' : firstLine;

  return (
    <div className="thinking-block-wrapper">
      <button
        onClick={() => setExpanded(v => !v)}
        className="thinking-block-toggle"
      >
        <span className="thinking-block-arrow">{expanded ? '▾' : '▸'}</span>
        <span className="thinking-block-label">
          思考过程
          {isActive && <span className="thinking-dots-animate" />}
        </span>
        {!expanded && preview && (
          <span className="thinking-block-preview">{preview}</span>
        )}
      </button>
      {expanded && (
        <div className="thinking-block-content">
          {content}
          {isActive && <span className="thinking-cursor" />}
        </div>
      )}
    </div>
  );
};
