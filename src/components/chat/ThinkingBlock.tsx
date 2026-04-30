import React, { useState, memo } from 'react';

interface ThinkingBlockProps {
  content: string;
  isActive?: boolean;
  label?: string;
}

const ThinkingBlockComponent: React.FC<ThinkingBlockProps> = ({ content, isActive, label = 'Thinking' }) => {
  const [expanded, setExpanded] = useState(false);
  const preview = content.length > 80 ? content.slice(0, 80).replace(/\n/g, ' ') + '...' : content.replace(/\n/g, ' ');

  return (
    <div className={`thinking-block ${expanded ? 'expanded' : ''}`}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="thinking-toggle"
      >
        <span className="thinking-arrow">{expanded ? '▾' : '▸'}</span>
        <span className="thinking-label">
          {label}
          {isActive && (
            <span className="thinking-dots">
              <span />
              <span />
              <span />
            </span>
          )}
        </span>
        {!expanded && preview && (
          <span className="thinking-preview">{preview}</span>
        )}
      </button>
      {expanded && (
        <div className="thinking-content">
          <pre>{content}</pre>
          {isActive && <span className="thinking-cursor" />}
        </div>
      )}
    </div>
  );
};

export const ThinkingBlock = memo(ThinkingBlockComponent);
