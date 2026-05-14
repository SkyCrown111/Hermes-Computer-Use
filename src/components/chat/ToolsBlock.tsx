import React, { memo } from 'react';
import type { ToolCallInfo } from '../../stores/chatStore';
import { ToolItem } from './ToolItem';

interface ToolsBlockProps {
  tools: ToolCallInfo[];
  isStreaming?: boolean;
}

/**
 * Claude Code style: each tool renders as an individual collapsible card.
 * No wrapping container — just a list of individual ToolItem cards.
 */
const ToolsBlockComponent: React.FC<ToolsBlockProps> = ({ tools, isStreaming }) => {
  return (
    <div className="tools-block">
      {tools.map((tool, idx) => (
        <ToolItem key={idx} tool={tool} isStreaming={isStreaming} />
      ))}
    </div>
  );
};

export const ToolsBlock = memo(ToolsBlockComponent);
