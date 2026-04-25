import React, { forwardRef } from 'react';
import { BaseComponentProps, Size } from '../../../types';
import './Input.css';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>, BaseComponentProps {
  label?: string;
  error?: string;
  hint?: string;
  size?: Size;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

const sizeClasses: Record<Size, string> = {
  sm: 'input-sm',
  md: 'input-md',
  lg: 'input-lg',
  xl: 'input-xl',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      size = 'md',
      icon,
      iconPosition = 'left',
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
    const hasError = !!error;
    const messageId = `${inputId}-message`;

    const wrapperClasses = [
      'input-wrapper',
      sizeClasses[size],
      hasError ? 'input-error' : '',
      icon ? `input-with-icon input-icon-${iconPosition}` : '',
      className,
    ].filter(Boolean).join(' ');

    return (
      <div className="input-container">
        {label && (
          <label htmlFor={inputId} className="input-label">
            {label}
          </label>
        )}
        <div className={wrapperClasses}>
          {icon && <span className="input-icon" aria-hidden="true">{icon}</span>}
          <input
            ref={ref}
            id={inputId}
            className="input-field"
            aria-invalid={hasError}
            aria-describedby={(error || hint) ? messageId : undefined}
            {...props}
          />
        </div>
        {(error || hint) && (
          <p id={messageId} className={`input-message ${hasError ? 'input-message-error' : ''}`} role={hasError ? 'alert' : undefined}>
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, BaseComponentProps {
  label?: string;
  error?: string;
  hint?: string;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      hint,
      resize = 'vertical',
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;
    const hasError = !!error;
    const messageId = `${textareaId}-message`;

    return (
      <div className="input-container">
        {label && (
          <label htmlFor={textareaId} className="input-label">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`textarea-field ${hasError ? 'input-error' : ''} ${className}`}
          style={{ resize }}
          aria-invalid={hasError}
          aria-describedby={(error || hint) ? messageId : undefined}
          {...props}
        />
        {(error || hint) && (
          <p id={messageId} className={`input-message ${hasError ? 'input-message-error' : ''}`} role={hasError ? 'alert' : undefined}>
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
