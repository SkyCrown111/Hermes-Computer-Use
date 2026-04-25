import React, { useEffect, useCallback } from 'react';
import './Lightbox.css';

interface LightboxProps {
  src: string;
  alt?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const Lightbox: React.FC<LightboxProps> = ({ src, alt, isOpen, onClose }) => {
  // Close on escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="lightbox-overlay" onClick={handleBackdropClick}>
      <button
        className="lightbox-close"
        onClick={onClose}
        aria-label="Close image preview"
      >
        <span className="material-symbols-outlined">close</span>
      </button>
      <div className="lightbox-content">
        <img
          src={src}
          alt={alt || ''}
          className="lightbox-image"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      {alt && (
        <div className="lightbox-caption">
          {alt}
        </div>
      )}
    </div>
  );
};
