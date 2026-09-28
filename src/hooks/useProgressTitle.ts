import { useEffect, useRef } from 'react';
import { BRAND } from '../branding';

/** Shows transfer progress in the tab title while `percent` is set; restores the original afterwards. */
export function useProgressTitle(percent: number | null) {
  const originalTitleRef = useRef<string | null>(null);
  const roundedPercent = percent === null ? null : Math.round(percent);

  useEffect(() => {
    if (roundedPercent === null) {
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
        originalTitleRef.current = null;
      }
      return;
    }
    originalTitleRef.current ??= document.title;
    document.title = `(${roundedPercent}%) ${BRAND.name} — Transferring`;
  }, [roundedPercent]);

  useEffect(
    () => () => {
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
      }
    },
    []
  );
}
