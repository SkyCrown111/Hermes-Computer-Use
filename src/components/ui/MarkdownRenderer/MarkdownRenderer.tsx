import React, { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { Components } from 'react-markdown';
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
  content: string;
  searchQuery?: string;
}

/**
 * Recursively walk React children and apply search highlighting to text nodes.
 * Preserves React elements (code, strong, em, a, etc.) while highlighting
 * matching text content within them.
 */
function highlightNode(node: React.ReactNode, query: string): React.ReactNode {
  if (!query.trim()) return node;

  if (typeof node === 'string') {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = node.split(new RegExp(`(${escaped})`, 'gi'));
    if (parts.length === 1) return node;
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="search-highlight">{part}</mark>
        : part
    );
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    const { children, ...rest } = node.props as { children?: React.ReactNode };
    if (children) {
      return React.cloneElement(node, rest, React.Children.map(children, child => highlightNode(child, query)));
    }
  }

  return node;
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="search-highlight">{part}</mark>
          : part
      )}
    </>
  );
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, searchQuery = '' }) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Fallback for environments without clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  }, []);

  const components: Components = {
    // Code blocks with copy button
    code: ({ className, children, ...props }) => {
      const isInline = !className;
      const codeString = String(children).replace(/\n$/, '');

      if (isInline) {
        return (
          <code className="md-inline-code" {...props}>
            {searchQuery ? <HighlightText text={codeString} query={searchQuery} /> : children}
          </code>
        );
      }

      const language = className?.replace('language-', '') || '';

      return (
        <div className="md-code-block-wrapper">
          <div className="md-code-header">
            {language && <span className="md-code-lang">{language}</span>}
            <button
              className="md-code-copy-btn"
              onClick={() => handleCopy(codeString)}
            >
              {copiedCode === codeString ? (
                <>
                  <span className="material-symbols-outlined md-code-copy-icon">check</span>
                  已复制
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined md-code-copy-icon">content_copy</span>
                  复制
                </>
              )}
            </button>
          </div>
          <pre className="md-code-pre">
            <code className={className} {...props}>{children}</code>
          </pre>
        </div>
      );
    },

    // Paragraph with search highlighting
    p: ({ children }) => {
      if (!searchQuery.trim()) return <p className="md-paragraph">{children}</p>;
      // Recursively highlight text nodes within the paragraph
      const highlighted = React.Children.map(children, child => highlightNode(child, searchQuery));
      return <p className="md-paragraph">{highlighted}</p>;
    },

    // Links open in new tab
    a: ({ href, children, ...props }) => (
      <a
        className="md-link"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    ),

    // Images
    img: ({ src, alt, ...props }) => (
      <img
        className="md-image"
        src={src}
        alt={alt || ''}
        loading="lazy"
        {...props}
      />
    ),

    // Headings
    h1: ({ children, ...props }) => <h1 className="md-h1" {...props}>{children}</h1>,
    h2: ({ children, ...props }) => <h2 className="md-h2" {...props}>{children}</h2>,
    h3: ({ children, ...props }) => <h3 className="md-h3" {...props}>{children}</h3>,
    h4: ({ children, ...props }) => <h4 className="md-h4" {...props}>{children}</h4>,

    // Lists
    ul: ({ children, ...props }) => <ul className="md-ul" {...props}>{children}</ul>,
    ol: ({ children, ...props }) => <ol className="md-ol" {...props}>{children}</ol>,
    li: ({ children, ...props }) => {
      if (!searchQuery.trim()) return <li {...props}>{children}</li>;
      const highlighted = React.Children.map(children, child => highlightNode(child, searchQuery));
      return <li {...props}>{highlighted}</li>;
    },

    // Blockquotes
    blockquote: ({ children, ...props }) => (
      <blockquote className="md-blockquote" {...props}>{children}</blockquote>
    ),

    // Tables
    table: ({ children, ...props }) => (
      <div className="md-table-wrapper">
        <table className="md-table" {...props}>{children}</table>
      </div>
    ),
    thead: ({ children, ...props }) => <thead {...props}>{children}</thead>,
    tbody: ({ children, ...props }) => <tbody {...props}>{children}</tbody>,
    tr: ({ children, ...props }) => <tr className="md-tr" {...props}>{children}</tr>,
    th: ({ children, ...props }) => <th className="md-th" {...props}>{children}</th>,
    td: ({ children, ...props }) => <td className="md-td" {...props}>{children}</td>,

    // Horizontal rule
    hr: () => <hr className="md-hr" />,
  };

  return (
    <div className="markdown-content">
      <ReactMarkdown
        components={components}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
