import React, { useState, memo } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '../ui/Icons';

interface ThinkingBlockProps {
  content: string;
  isActive?: boolean;
  label?: string;
  thinkingTime?: number;
  previewLength?: number;
}

const ThinkingBlockComponent: React.FC<ThinkingBlockProps> = ({
  content,
  isActive,
  label = 'Thinking',
  thinkingTime,
  previewLength = 80,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!content) return null;

  const normalizedPreview = content.replace(/\n/g, ' ');
  const preview =
    normalizedPreview.length > previewLength
      ? `${normalizedPreview.slice(0, previewLength)}...`
      : normalizedPreview;

  return (
    <div className={`thinking-block ${expanded ? 'expanded' : ''}`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="thinking-toggle"
        type="button"
      >
        <span className="thinking-arrow">
          {expanded ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
        </span>
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
        {thinkingTime != null && thinkingTime > 0 && (
          <span className="thinking-time">{(thinkingTime / 1000).toFixed(1)}s</span>
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
