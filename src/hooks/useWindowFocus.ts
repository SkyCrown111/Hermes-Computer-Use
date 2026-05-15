import { useEffect } from 'react';

export function useWindowFocus(callback: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return undefined;

    const handleFocus = () => {
      callback();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [callback, enabled]);
}
