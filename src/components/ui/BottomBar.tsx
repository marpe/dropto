import React from 'react';

interface BottomBarProps {
  children: React.ReactNode;
}

/**
 * The screen's main action. On a phone it is pinned above the home indicator, like a native primary
 * button; on desktop it closes off the utility panel, at the panel's smaller button size.
 */
export const BottomBar: React.FC<BottomBarProps> = ({ children }) => (
  <div className="fixed inset-x-0 bottom-0 z-20 grid gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/85 backdrop-blur-md border-t border-border-1 sm:border-0 sm:static sm:z-auto sm:flex sm:justify-end sm:px-0 sm:py-0 sm:backdrop-blur-none *:w-full sm:*:w-auto sm:*:py-2 sm:*:text-sm">
    {children}
  </div>
);
