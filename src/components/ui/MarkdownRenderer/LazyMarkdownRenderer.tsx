import React, { Suspense } from 'react';
import type { MarkdownRendererProps } from './MarkdownRenderer';

const MarkdownRendererImpl = React.lazy(async () => {
  const module = await import('./MarkdownRenderer');
  return { default: module.MarkdownRenderer };
});

const MarkdownFallback: React.FC<Pick<MarkdownRendererProps, 'content'>> = ({ content }) => (
  <div
    style={{
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }}
  >
    {content}
  </div>
);

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, searchQuery }) => (
  <Suspense fallback={<MarkdownFallback content={content} />}>
    <MarkdownRendererImpl content={content} searchQuery={searchQuery} />
  </Suspense>
);
