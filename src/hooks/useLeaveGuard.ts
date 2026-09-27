import { useEffect } from 'react';

function confirmLeave(event: BeforeUnloadEvent) {
  // preventDefault is the standard trigger; returnValue covers older Chromium/Safari
  event.preventDefault();
  event.returnValue = '';
}

/** Makes the browser ask before closing or reloading the tab while `isActive`, e.g. mid-transfer. */
export function useLeaveGuard(isActive: boolean) {
  useEffect(() => {
    if (!isActive) {
      return;
    }
    window.addEventListener('beforeunload', confirmLeave);
    return () => window.removeEventListener('beforeunload', confirmLeave);
  }, [isActive]);
}
