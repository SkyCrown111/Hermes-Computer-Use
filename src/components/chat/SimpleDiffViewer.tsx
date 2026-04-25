import React from 'react';

interface SimpleDiffViewerProps {
  oldStr: string;
  newStr: string;
  filePath?: string;
}

export const SimpleDiffViewer: React.FC<SimpleDiffViewerProps> = ({ oldStr, newStr, filePath }) => {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  // Simple line-by-line diff
  const diffLines: Array<{ type: 'context' | 'add' | 'remove'; oldNum?: number; newNum?: number; content: string }> = [];
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    const oldLine = oldLines[oldIdx];
    const newLine = newLines[newIdx];

    if (oldIdx >= oldLines.length) {
      // Only new lines left
      diffLines.push({ type: 'add', newNum: newIdx + 1, content: newLine });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      // Only old lines left
      diffLines.push({ type: 'remove', oldNum: oldIdx + 1, content: oldLine });
      oldIdx++;
    } else if (oldLine === newLine) {
      // Context line
      diffLines.push({ type: 'context', oldNum: oldIdx + 1, newNum: newIdx + 1, content: oldLine });
      oldIdx++;
      newIdx++;
    } else {
      // Check if this is a modification
      diffLines.push({ type: 'remove', oldNum: oldIdx + 1, content: oldLine });
      diffLines.push({ type: 'add', newNum: newIdx + 1, content: newLine });
      oldIdx++;
      newIdx++;
    }
  }

  // Count additions and deletions
  const additions = diffLines.filter(l => l.type === 'add').length;
  const deletions = diffLines.filter(l => l.type === 'remove').length;

  return (
    <div className="diff-viewer">
      {filePath && (
        <div className="diff-header">
          <span className="diff-file-path">{filePath.split('/').pop()}</span>
          <div className="diff-stats">
            <span className="diff-add">+{additions}</span>
            <span className="diff-remove">-{deletions}</span>
          </div>
        </div>
      )}
      <div className="diff-content">
        {diffLines.slice(0, 20).map((line, idx) => (
          <div key={idx} className={`diff-line ${line.type}`}>
            {line.oldNum !== undefined && <span className="diff-line-num old">{line.oldNum}</span>}
            {line.newNum !== undefined && <span className="diff-line-num new">{line.newNum}</span>}
            <span className="diff-line-marker">{line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}</span>
            <span className="diff-line-content">{line.content}</span>
          </div>
        ))}
        {diffLines.length > 20 && (
          <div className="diff-more">... {diffLines.length - 20} more lines</div>
        )}
      </div>
    </div>
  );
};
