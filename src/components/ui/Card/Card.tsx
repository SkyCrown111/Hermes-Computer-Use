import React from 'react';
import { BaseComponentProps } from '../../../types';
import './Card.css';

export interface CardProps extends BaseComponentProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  noPadding?: boolean;
  glass?: boolean;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  icon,
  actions,
  noPadding = false,
  glass = true,
  className = '',
  children,
}) => {
  const classes = [
    'card',
    glass ? 'card-glass' : '',
    noPadding ? 'card-no-padding' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {(title || actions) && (
        <div className="card-header">
          <div className="card-header-left">
            {icon && <span className="card-icon">{icon}</span>}
            <div className="card-title-group">
              {title && <h3 className="card-title">{title}</h3>}
              {subtitle && <p className="card-subtitle">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className="card-content">{children}</div>
    </div>
  );
};

export interface CardGridProps extends BaseComponentProps {
  columns?: number;
  gap?: 'sm' | 'md' | 'lg';
}

export const CardGrid: React.FC<CardGridProps> = ({
  columns = 2,
  gap = 'md',
  className = '',
  children,
}) => {
  const gapClasses = {
    sm: 'card-grid-gap-sm',
    md: 'card-grid-gap-md',
    lg: 'card-grid-gap-lg',
  };

  return (
    <div
      className={`card-grid ${gapClasses[gap]} ${className}`}
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {children}
    </div>
  );
};
