// Toast Store Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useToastStore, toast } from '../toastStore';

describe('ToastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('addToast', () => {
    it('should add a toast with generated id and createdAt', () => {
      const id = useToastStore.getState().addToast({
        type: 'success',
        title: 'Test Toast',
        duration: 5000,
      });

      const state = useToastStore.getState();
      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0].id).toBe(id);
      expect(state.toasts[0].title).toBe('Test Toast');
      expect(state.toasts[0].createdAt).toBeGreaterThan(0);
    });

    it('should limit toasts to MAX_TOASTS (5)', () => {
      for (let i = 0; i < 7; i++) {
        useToastStore.getState().addToast({
          type: 'info',
          title: `Toast ${i}`,
          duration: 0,
        });
      }

      const state = useToastStore.getState();
      expect(state.toasts).toHaveLength(5);
      // Oldest toasts should be removed
      expect(state.toasts[0].title).toBe('Toast 2');
    });

    it('should auto-dismiss toast after duration', () => {
      useToastStore.getState().addToast({
        type: 'success',
        title: 'Auto dismiss',
        duration: 1000,
      });

      expect(useToastStore.getState().toasts).toHaveLength(1);

      vi.advanceTimersByTime(1000);

      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('should not auto-dismiss sticky toast (duration: 0)', () => {
      useToastStore.getState().addToast({
        type: 'warning',
        title: 'Sticky',
        duration: 0,
      });

      vi.advanceTimersByTime(10000);

      expect(useToastStore.getState().toasts).toHaveLength(1);
    });
  });

  describe('removeToast', () => {
    it('should remove toast by id', () => {
      const id = useToastStore.getState().addToast({
        type: 'error',
        title: 'Error',
        duration: 0,
      });

      useToastStore.getState().removeToast(id);

      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('should not affect other toasts', () => {
      const id1 = useToastStore.getState().addToast({
        type: 'info',
        title: 'Toast 1',
        duration: 0,
      });
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Toast 2',
        duration: 0,
      });

      useToastStore.getState().removeToast(id1);

      const state = useToastStore.getState();
      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0].title).toBe('Toast 2');
    });
  });

  describe('clearToasts', () => {
    it('should remove all toasts', () => {
      useToastStore.getState().addToast({ type: 'success', title: '1', duration: 0 });
      useToastStore.getState().addToast({ type: 'error', title: '2', duration: 0 });

      useToastStore.getState().clearToasts();

      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });

  describe('convenience functions', () => {
    it('toast.success should add success toast', () => {
      toast.success('Success!', 'Details');
      const state = useToastStore.getState();
      expect(state.toasts[0].type).toBe('success');
      expect(state.toasts[0].title).toBe('Success!');
      expect(state.toasts[0].message).toBe('Details');
    });

    it('toast.error should add error toast with longer duration', () => {
      toast.error('Error!', 'Details');
      const state = useToastStore.getState();
      expect(state.toasts[0].type).toBe('error');
      expect(state.toasts[0].duration).toBe(6000);
    });

    it('toast.sticky should add toast with duration 0', () => {
      toast.sticky('Sticky!', 'Details', 'warning');
      const state = useToastStore.getState();
      expect(state.toasts[0].duration).toBe(0);
      expect(state.toasts[0].type).toBe('warning');
    });

    it('toast.dismiss should remove toast by id', () => {
      const id = toast.success('Test');
      toast.dismiss(id);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it('toast.clearAll should clear all toasts', () => {
      toast.success('1');
      toast.error('2');
      toast.clearAll();
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });
});

import { afterEach } from 'vitest';
