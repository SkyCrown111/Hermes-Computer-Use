// Toast Notification Component
import React, { useState, useCallback } from 'react';
import { useToastStore, type Toast } from '../../../stores/toastStore';
import { useTranslation } from '../../../hooks/useTranslation';
import { CheckIcon, AlertIcon, XIcon } from '../Icons';
import './Toast.css';

// Map toast type to icon color class
const typeClass: Record<string, string> = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

// Render icon based on toast type
const ToastIcon: React.FC<{ type: Toast['type'] }> = ({ type }) => {
  const cls = typeClass[type] || 'info';
  if (type === 'success') return <CheckIcon size={18} className={`toast-icon ${cls}`} />;
  if (type === 'error') return <AlertIcon size={18} className={`toast-icon ${cls}`} />;
  if (type === 'warning') return <AlertIcon size={18} className={`toast-icon ${cls}`} />;
  return <AlertIcon size={18} className={`toast-icon ${cls}`} />;
};

// Individual toast item
const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
  const [removing, setRemoving] = useState(false);
  const removeToast = useToastStore((s) => s.removeToast);
  const { t } = useTranslation();

  const handleDismiss = useCallback(() => {
    setRemoving(true);
    setTimeout(() => removeToast(toast.id), 200); // match CSS transition duration
  }, [toast.id, removeToast]);

  return (
    <div
      className={`toast-item toast-${toast.type} ${removing ? 'removing' : ''}`}
      role="alert"
      aria-live="polite"
    >
      <ToastIcon type={toast.type} />
      <div className="toast-body">
        <div className="toast-title">{toast.title}</div>
        {toast.message && <div className="toast-message">{toast.message}</div>}
      </div>
      <button
        className="toast-dismiss"
        onClick={handleDismiss}
        aria-label={t('toast.dismiss')}
        title={t('toast.dismiss')}
      >
        <XIcon size={14} />
      </button>
    </div>
  );
};

// Toast container — renders all active toasts
export const ToastContainer: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-label="Notifications">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
};
