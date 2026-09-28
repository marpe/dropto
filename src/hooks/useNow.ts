import { useEffect, useState } from 'react';

/** The current time, updated every `intervalMs` while `isActive`, for text like "Idle for 10 s". */
export function useNow(intervalMs: number, isActive = true): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, isActive]);

  return nowMs;
}
