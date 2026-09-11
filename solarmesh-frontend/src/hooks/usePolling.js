import { useEffect, useRef } from 'react';

/**
 * Hook for controlled polling with interval and immediate trigger
 */
export const usePolling = (callback, intervalMs = 5000, enabled = true) => {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    // Run once immediately
    savedCallback.current();

    const id = setInterval(() => {
      savedCallback.current();
    }, intervalMs);

    return () => clearInterval(id);
  }, [intervalMs, enabled]);
};

export default usePolling;
