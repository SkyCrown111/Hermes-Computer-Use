import React from 'react';

interface ToolErrorCardProps {
  error: string;
}

export const ToolErrorCard: React.FC<ToolErrorCardProps> = ({ error }) => {
  // Parse various error formats for cleaner display
  const parseError = (errorMsg: string): { title: string; details: string } => {
    // Vision analysis error
    if (errorMsg.includes('vision analysis')) {
      const match = errorMsg.match(/Error during vision analysis:\s*(.+)/);
      if (match) {
        // Try to extract the actual error message from nested JSON
        const innerError = match[1];
        if (innerError.includes('image_url is only supported')) {
          return {
            title: '视觉分析错误',
            details: '当前模型不支持图片分析 (image_url)，请使用支持视觉的模型',
          };
        }
        return {
          title: '视觉分析错误',
          details: innerError.slice(0, 200),
        };
      }
    }
    // Playwright page.evaluate error
    if (errorMsg.includes('page.evaluate:')) {
      const match = errorMsg.match(/page\.evaluate:\s*(.+)/);
      return {
        title: '浏览器脚本执行错误',
        details: match?.[1] || errorMsg,
      };
    }
    // Generic error - truncate if too long
    return {
      title: '工具执行错误',
      details: errorMsg.length > 300 ? errorMsg.slice(0, 300) + '...' : errorMsg,
    };
  };

  const { title, details } = parseError(error);

  return (
    <div className="tool-error-card">
      <div className="tool-error-header">
        <span className="material-symbols-outlined tool-error-icon">error</span>
        <span className="tool-error-title">{title}</span>
      </div>
      <div className="tool-error-details">
        <code>{details}</code>
      </div>
    </div>
  );
};
