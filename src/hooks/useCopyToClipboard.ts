import { useEffect, useRef, useState } from 'react';

/** Copies text and exposes a "copied" flag that resets after `resetMs`; stays false if the write is refused. */
export function useCopyToClipboard(resetMs = 2000) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copy = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
      return false;
    }
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), resetMs);
    return true;
  };

  return [copied, copy] as const;
}
