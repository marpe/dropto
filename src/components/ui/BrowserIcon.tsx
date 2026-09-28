import React from 'react';
import { Globe } from 'lucide-react';
import { siFirefoxbrowser, siGooglechrome, siOpera, siSafari } from 'simple-icons';
import type { SimpleIcon } from 'simple-icons';
import { cn } from '../../utils/cn';

// Names as describeDevice reports them; Edge and Samsung Internet have no logo in simple-icons
const LOGOS: Record<string, SimpleIcon> = {
  Chrome: siGooglechrome,
  Firefox: siFirefoxbrowser,
  Safari: siSafari,
  Opera: siOpera,
};

interface BrowserIconProps {
  browser: string | null;
  className?: string;
}

/** A browser's logo in the current text colour, with its name as the tooltip; a globe for any other browser. */
export const BrowserIcon: React.FC<BrowserIconProps> = ({ browser, className }) => {
  const logo = browser ? LOGOS[browser] : undefined;
  const label = browser ?? 'Unknown browser';
  if (!logo) {
    return (
      <Globe className={cn('w-3.5 h-3.5 shrink-0', className)} aria-label={label}>
        <title>{label}</title>
      </Globe>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={label} className={cn('w-3.5 h-3.5 shrink-0', className)}>
      <title>{label}</title>
      <path d={logo.path} />
    </svg>
  );
};
