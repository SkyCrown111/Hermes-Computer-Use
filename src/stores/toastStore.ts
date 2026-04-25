// Toast Notification Store
// Lightweight queue-based toast system for operation feedback

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration: number; // ms, 0 = sticky
  createdAt: number;
}

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 4000;

let toastCounter = 0;
const nextToastId = () => `toast-${++toastCounter}-${Date.now()}`;

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id' | 'createdAt'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = nextToastId();
    const newToast: Toast = {
      ...toast,
      id,
      createdAt: Date.now(),
    };

    set((s) => {
      const next = [...s.toasts, newToast];
      // Keep max 5, remove oldest if exceeded
      while (next.length > MAX_TOASTS) {
        next.shift();
      }
      return { toasts: next };
    });

    // Auto-dismiss if duration > 0
    if (toast.duration > 0) {
      setTimeout(() => {
        const { toasts } = get();
        if (toasts.some((t) => t.id === id)) {
          get().removeToast(id);
        }
      }, toast.duration);
    }

    return id;
  },

  removeToast: (id) => {
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    }));
  },

  clearToasts: () => {
    set({ toasts: [] });
  },
}));

// Convenience functions for common toast types
export const toast = {
  success: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'success', title, message, duration: duration ?? DEFAULT_DURATION }),

  error: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'error', title, message, duration: duration ?? 6000 }),

  warning: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'warning', title, message, duration: duration ?? 5000 }),

  info: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: 'info', title, message, duration: duration ?? DEFAULT_DURATION }),

  // Sticky toast — must be manually dismissed
  sticky: (title: string, message?: string, type?: ToastType) =>
    useToastStore.getState().addToast({ type: type ?? 'info', title, message, duration: 0 }),

  dismiss: (id: string) =>
    useToastStore.getState().removeToast(id),

  clearAll: () =>
    useToastStore.getState().clearToasts(),
};
