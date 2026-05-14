import React, { memo, useMemo } from 'react';
import { AlertIcon } from '../ui/Icons';
import { useTranslation } from '../../hooks/useTranslation';

interface ToolErrorCardProps {
  error: string;
}

const ToolErrorCardComponent: React.FC<ToolErrorCardProps> = ({ error }) => {
  const { t } = useTranslation();
  const { title, details } = useMemo(() => {
    if (error.includes('vision analysis')) {
      const match = error.match(/Error during vision analysis:\s*(.+)/);
      if (match) {
        const innerError = match[1];
        if (innerError.includes('image_url is only supported')) {
          return {
            title: t('message.visionError'),
            details:
              'The current model does not support image_url input. Please switch to a vision-capable model.',
          };
        }
        return {
          title: t('message.visionError'),
          details: innerError.slice(0, 200),
        };
      }
    }

    if (error.includes('page.evaluate:')) {
      const match = error.match(/page\.evaluate:\s*(.+)/);
      return {
        title: t('message.browserScriptError'),
        details: match?.[1] || error,
      };
    }

    return {
      title: t('message.toolError'),
      details: error.length > 300 ? `${error.slice(0, 300)}...` : error,
    };
  }, [error, t]);

  return (
    <div className="tool-error-card">
      <div className="tool-error-header">
        <span className="tool-error-icon"><AlertIcon size={16} /></span>
        <span className="tool-error-title">{title}</span>
      </div>
      <div className="tool-error-details">
        <code>{details}</code>
      </div>
    </div>
  );
};

export const ToolErrorCard = memo(ToolErrorCardComponent);
