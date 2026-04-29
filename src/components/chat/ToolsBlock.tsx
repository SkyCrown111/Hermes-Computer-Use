import React, { useState, memo } from 'react';
import type { ToolCallInfo } from '../../stores/chatStore';
import { ToolItem } from './ToolItem';

interface ToolsBlockProps {
  tools: ToolCallInfo[];
  isStreaming?: boolean;
}

const ToolsBlockComponent: React.FC<ToolsBlockProps> = ({ tools, isStreaming }) => {
  const [expanded, setExpanded] = useState(false);

  // Count running/completed tools
  const runningCount = tools.filter(t => !t.duration && !t.is_error && isStreaming).length;
  const completedCount = tools.filter(t => t.duration).length;
  const errorCount = tools.filter(t => t.is_error).length;

  // Single tool - show simple card
  if (tools.length === 1) {
    return (
      <div className="tool-card">
        <ToolItem tool={tools[0]} isStreaming={isStreaming} />
      </div>
    );
  }

  // Multiple tools - show collapsible block
  return (
    <div className="tools-block">
      <button
        onClick={() => setExpanded(v => !v)}
        className="tools-block-header"
      >
        <span className="material-symbols-outlined tools-block-icon">build</span>
        <span className="tools-block-title">Tool Calls</span>
        <span className="tools-block-count">{tools.length}</span>
        <span className="tools-block-spacer" />
        {runningCount > 0 && (
          <span className="tools-block-status running">{runningCount} running</span>
        )}
        {completedCount > 0 && (
          <span className="tools-block-status">{completedCount} done</span>
        )}
        {errorCount > 0 && (
          <span className="tools-block-status error">{errorCount} failed</span>
        )}
        <span className="material-symbols-outlined tools-block-expand">
          {expanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {expanded && (
        <div className="tools-block-content">
          {tools.map((tool, idx) => (
            <ToolItem key={idx} tool={tool} isStreaming={isStreaming} />
          ))}
        </div>
      )}
    </div>
  );
};

// Memoize to prevent re-renders when parent message updates but tools haven't changed
export const ToolsBlock = memo(ToolsBlockComponent);
