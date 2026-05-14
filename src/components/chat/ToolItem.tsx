import React, { useState, useMemo, memo } from 'react';
import type { ToolCallInfo } from '../../stores/chatStore';
import { TOOL_ICONS } from './constants';
import { SimpleDiffViewer } from './SimpleDiffViewer';

interface ToolItemProps {
  tool: ToolCallInfo;
  isStreaming?: boolean;
}

const ToolItemComponent: React.FC<ToolItemProps> = ({ tool, isStreaming }) => {
  const [expanded, setExpanded] = useState(false);
  const isRunning = !tool.duration && !tool.is_error && isStreaming;
  const icon = TOOL_ICONS[tool.name] || 'build';

  // Check if this is an Edit/Write tool with diff content
  const args = tool.args as Record<string, unknown> | undefined;
  const filePath = args?.file_path as string | undefined;
  const oldString = args?.old_string as string | undefined;
  const newString = args?.new_string as string | undefined;
  const content = args?.content as string | undefined;

  const isDiffTool = (tool.name === 'edit_file' || tool.name === 'write_file' || tool.name === 'Edit' || tool.name === 'Write') &&
    (oldString !== undefined || newString !== undefined || content !== undefined);

  const hasExpandableContent = isDiffTool || (args && Object.keys(args).length > 0);

  // Build a compact args summary for the preview line
  const argsSummary = useMemo(() => {
    if (!args) return '';
    const keys = Object.keys(args);
    if (keys.length === 0) return '';
    // Show first string value as preview
    for (const k of keys) {
      const v = args[k];
      if (typeof v === 'string' && v.length > 0 && k !== 'old_string' && k !== 'new_string' && k !== 'content') {
        const preview = v.length > 60 ? v.slice(0, 60) + '...' : v;
        return `${k}: ${preview}`;
      }
    }
    return keys.join(', ');
  }, [args]);

  return (
    <div className={`tool-item ${tool.is_error ? 'error' : 'success'}`}>
      <div
        className="tool-item-header"
        onClick={() => hasExpandableContent && setExpanded(!expanded)}
        {...(hasExpandableContent ? { role: 'button', tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } } } : {})}
      >
        <span className="material-symbols-outlined tool-item-icon">{icon}</span>
        <span className="tool-item-name">{tool.name}</span>
        {filePath && (
          <span className="tool-item-file">{filePath.split('/').pop()}</span>
        )}
        {!filePath && argsSummary && (
          <span className="tool-item-preview">{argsSummary}</span>
        )}
        {!filePath && !argsSummary && tool.preview && (
          <span className="tool-item-preview">{tool.preview.slice(0, 50)}{tool.preview.length > 50 ? '...' : ''}</span>
        )}
        <span className="tool-item-spacer" />
        {isRunning && (
          <span className="tool-item-status running">
            <span className="material-symbols-outlined spinning">sync</span>
            running
          </span>
        )}
        {!isRunning && !tool.is_error && (
          <span className="tool-item-status success">
            <span className="material-symbols-outlined">check_circle</span>
            {tool.duration && `${tool.duration.toFixed(0)}ms`}
          </span>
        )}
        {tool.is_error && (
          <span className="tool-item-status error">
            <span className="material-symbols-outlined">error</span>
            failed
          </span>
        )}
        {hasExpandableContent && (
          <span className="material-symbols-outlined tool-item-expand">
            {expanded ? 'expand_less' : 'expand_more'}
          </span>
        )}
      </div>
      {/* Expandable content */}
      {expanded && (
        <div className="tool-item-body">
          {isDiffTool ? (
            <div className="tool-diff-container">
              {tool.name === 'Edit' || tool.name === 'edit_file' ? (
                <SimpleDiffViewer oldStr={oldString || ''} newStr={newString || ''} filePath={filePath} />
              ) : (
                <SimpleDiffViewer oldStr="" newStr={content || ''} filePath={filePath} />
              )}
            </div>
          ) : args ? (
            <pre className="tool-item-args">{JSON.stringify(args, null, 2)}</pre>
          ) : null}
        </div>
      )}
    </div>
  );
};

// Memoize to prevent re-renders when parent tools list updates but this tool hasn't changed
export const ToolItem = memo(ToolItemComponent);
