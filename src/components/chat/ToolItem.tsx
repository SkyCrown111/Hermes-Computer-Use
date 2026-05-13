import React, { useState, memo } from 'react';
import type { ToolCallInfo } from '../../stores/chatStore';
import { TOOL_ICONS } from './constants';
import { SimpleDiffViewer } from './SimpleDiffViewer';
import { AlertIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, EditIcon, FileTextIcon, GlobeIcon, SearchIcon, SparklesIcon, TerminalIcon, ToolIcon, DownloadIcon } from '../ui/Icons';

interface ToolItemProps {
  tool: ToolCallInfo;
  isStreaming?: boolean;
}

function renderToolIcon(icon: string) {
  switch (icon) {
    case 'terminal':
      return <TerminalIcon size={14} />;
    case 'search':
    case 'find_in_page':
      return <SearchIcon size={14} />;
    case 'description':
      return <FileTextIcon size={14} />;
    case 'edit_document':
    case 'edit_note':
      return <EditIcon size={14} />;
    case 'travel_explore':
      return <GlobeIcon size={14} />;
    case 'cloud_download':
      return <DownloadIcon size={14} />;
    case 'auto_awesome':
      return <SparklesIcon size={14} />;
    default:
      return <ToolIcon size={14} />;
  }
}

const ToolItemComponent: React.FC<ToolItemProps> = ({ tool, isStreaming }) => {
  const [showDiff, setShowDiff] = useState(false);
  const isRunning = !tool.duration && !tool.is_error && isStreaming;
  const icon = TOOL_ICONS[tool.name] || 'build';

  // Check if this is an Edit/Write tool with diff content
  const args = tool.args as Record<string, unknown> | undefined;
  const filePath = args?.file_path as string | undefined;
  const oldString = args?.old_string as string | undefined;
  const newString = args?.new_string as string | undefined;
  const content = args?.content as string | undefined;

  const canShowDiff = (tool.name === 'edit_file' || tool.name === 'write_file' || tool.name === 'Edit' || tool.name === 'Write') &&
    (oldString !== undefined || newString !== undefined || content !== undefined);

  return (
    <div className={`tool-call-card ${showDiff ? 'expanded' : ''} ${tool.is_error ? 'error' : 'success'}`}>
      <div className="tool-call-header" onClick={() => canShowDiff && setShowDiff(!showDiff)} {...(canShowDiff ? { role: 'button', tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowDiff(!showDiff); } } } : {})}>
        <span className="tool-call-icon">{renderToolIcon(icon)}</span>
        <span className="tool-call-name">{tool.name}</span>
        {filePath && (
          <span className="tool-call-file">{filePath.split('/').pop()}</span>
        )}
        {tool.preview && !filePath && (
          <span className="tool-call-preview">{tool.preview.slice(0, 50)}{tool.preview.length > 50 ? '...' : ''}</span>
        )}
        <span className="tool-call-spacer" />
        {isRunning && (
          <span className="tool-call-status running">Running...</span>
        )}
        {!isRunning && !tool.is_error && (
          <span className="tool-call-status success">
            <CheckIcon size={14} />
            {tool.duration && `${tool.duration.toFixed(0)}ms`}
          </span>
        )}
        {tool.is_error && (
          <span className="tool-call-status error">
            <AlertIcon size={14} />
            Failed
          </span>
        )}
        {canShowDiff && (
          <span className="tool-call-arrow">
            {showDiff ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
          </span>
        )}
      </div>
      {/* Diff viewer for Edit/Write tools */}
      {showDiff && canShowDiff && (
        <div className="tool-call-body">
          {tool.name === 'Edit' || tool.name === 'edit_file' ? (
            <SimpleDiffViewer oldStr={oldString || ''} newStr={newString || ''} filePath={filePath} />
          ) : (
            <SimpleDiffViewer oldStr="" newStr={content || ''} filePath={filePath} />
          )}
        </div>
      )}
    </div>
  );
};

// Memoize to prevent re-renders when parent tools list updates but this tool hasn't changed
export const ToolItem = memo(ToolItemComponent);
