// Skeleton loading components for improved loading UX
import React from 'react';
import './Skeleton.css';

export interface SkeletonProps {
  /** Width of the skeleton (CSS value) */
  width?: string;
  /** Height of the skeleton (CSS value) */
  height?: string;
  /** Variant style */
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  /** Additional CSS class */
  className?: string;
  /** Animation style */
  animation?: 'pulse' | 'wave' | 'none';
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Base Skeleton component for loading states.
 * Use specific variants below for common patterns.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  variant = 'text',
  className = '',
  animation = 'pulse',
  style: customStyle,
}) => {
  const classes = [
    'skeleton',
    `skeleton-${variant}`,
    animation !== 'none' ? `skeleton-${animation}` : '',
    className,
  ].filter(Boolean).join(' ');

  const style: React.CSSProperties = { ...customStyle };
  if (width) style.width = width;
  if (height) style.height = height;

  return <span className={classes} style={style} />;
};

// ---- Preset Skeleton Components ----

/** Skeleton for text lines */
export const SkeletonText: React.FC<{
  lines?: number;
  lineHeight?: string;
  lastLineWidth?: string;
  className?: string;
}> = ({ lines = 1, lineHeight = '1em', lastLineWidth = '60%', className }) => {
  return (
    <div className={`skeleton-text-container ${className || ''}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          height={lineHeight}
          width={i === lines - 1 && lines > 1 ? lastLineWidth : '100%'}
          style={{ marginBottom: i < lines - 1 ? '0.5em' : 0 }}
        />
      ))}
    </div>
  );
};

/** Skeleton for avatar/profile image */
export const SkeletonAvatar: React.FC<{
  size?: string;
  className?: string;
}> = ({ size = '40px', className }) => {
  return (
    <Skeleton
      variant="circular"
      width={size}
      height={size}
      className={className}
    />
  );
};

/** Skeleton for card component */
export const SkeletonCard: React.FC<{
  hasHeader?: boolean;
  hasAvatar?: boolean;
  lines?: number;
  className?: string;
}> = ({ hasHeader = true, hasAvatar = false, lines = 3, className }) => {
  return (
    <div className={`skeleton-card ${className || ''}`}>
      {hasHeader && (
        <div className="skeleton-card-header">
          {hasAvatar && <SkeletonAvatar size="32px" />}
          <div className="skeleton-card-header-text">
            <Skeleton variant="text" width="40%" height="1.2em" />
            <Skeleton variant="text" width="60%" height="0.9em" />
          </div>
        </div>
      )}
      <div className="skeleton-card-content">
        <SkeletonText lines={lines} />
      </div>
    </div>
  );
};

/** Skeleton for list items */
export const SkeletonList: React.FC<{
  count?: number;
  hasAvatar?: boolean;
  className?: string;
}> = ({ count = 3, hasAvatar = false, className }) => {
  return (
    <div className={`skeleton-list ${className || ''}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-list-item">
          {hasAvatar && <SkeletonAvatar size="36px" />}
          <div className="skeleton-list-item-content">
            <Skeleton variant="text" width="70%" height="1em" />
            <Skeleton variant="text" width="50%" height="0.85em" />
          </div>
        </div>
      ))}
    </div>
  );
};

/** Skeleton for table */
export const SkeletonTable: React.FC<{
  rows?: number;
  columns?: number;
  className?: string;
}> = ({ rows = 5, columns = 4, className }) => {
  return (
    <div className={`skeleton-table ${className || ''}`}>
      {/* Header */}
      <div className="skeleton-table-header">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} variant="text" height="1em" width="80%" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="skeleton-table-row">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              variant="text"
              height="1em"
              width={colIndex === 0 ? '90%' : '70%'}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

/** Skeleton for stat card */
export const SkeletonStatCard: React.FC<{
  className?: string;
}> = ({ className }) => {
  return (
    <div className={`skeleton-stat-card ${className || ''}`}>
      <Skeleton variant="rounded" width="40px" height="40px" />
      <div className="skeleton-stat-content">
        <Skeleton variant="text" width="60%" height="1.8em" />
        <Skeleton variant="text" width="80%" height="0.9em" />
      </div>
    </div>
  );
};
