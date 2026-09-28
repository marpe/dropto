import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from './IconButton';

interface AppBarProps {
  title: string;
  /** Makes the title a button, e.g. back to the start page */
  onTitleClick?: () => void;
  /** Shows a back arrow (e.g. from receiving back to sending) */
  onBack?: () => void;
  backLabel?: string;
  /** Icon buttons on the right, e.g. settings */
  actions?: React.ReactNode;
}

/**
 * The screen title bar: pinned under the status bar on a phone (clear of the notch), the toolbar at the
 * top of the utility panel on desktop.
 */
export const AppBar: React.FC<AppBarProps> = ({ title, onTitleClick, onBack, backLabel = 'Back', actions }) => (
  <header className="sticky top-0 z-30 flex items-center gap-1 h-[calc(3rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] px-2 bg-background/85 backdrop-blur-md border-b border-border-1 sm:border-0 sm:static sm:h-12 sm:pt-0 sm:px-0 sm:backdrop-blur-none">
    {onBack ? (
      <IconButton title={backLabel} onClick={onBack}>
        <ChevronLeft className="w-5 h-5" />
      </IconButton>
    ) : (
      <span className="w-2" />
    )}
    <h1 className="flex-1 min-w-0 truncate text-base sm:text-sm font-semibold text-text-1">
      {onTitleClick ? (
        <button type="button" onClick={onTitleClick} className="max-w-full truncate rounded-md px-1 -mx-1">
          {title}
        </button>
      ) : (
        title
      )}
    </h1>
    {actions}
  </header>
);
