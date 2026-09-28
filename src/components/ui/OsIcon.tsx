import React from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { siAndroid, siApple, siGooglechrome, siLinux } from 'simple-icons';
import type { FormFactor } from '../../types/transfer';
import { cn } from '../../utils/cn';

// Plain panes rather than a brand mark: simple-icons carries no Windows logo
const WINDOWS_PATH = 'M3 3h8.5v8.5H3zM12.5 3H21v8.5h-8.5zM3 12.5h8.5V21H3zM12.5 12.5H21V21h-8.5z';

// Names as describeDevice reports them
const PATHS: Record<string, string> = {
  Windows: WINDOWS_PATH,
  macOS: siApple.path,
  iPhone: siApple.path,
  iPad: siApple.path,
  Android: siAndroid.path,
  Linux: siLinux.path,
  ChromeOS: siGooglechrome.path,
};

const FALLBACKS: Record<FormFactor, typeof Monitor> = { phone: Smartphone, tablet: Tablet, desktop: Monitor };

const FORM_FACTOR_NAMES: Record<FormFactor, string> = { phone: 'phone', tablet: 'tablet', desktop: 'computer' };

interface OsIconProps {
  system: string | null;
  formFactor?: FormFactor;
  className?: string;
}

/** The operating system's logo in the current text colour; the tooltip also says what kind of device it is. */
export const OsIcon: React.FC<OsIconProps> = ({ system, formFactor, className }) => {
  const label = [system ?? 'Unknown system', formFactor && FORM_FACTOR_NAMES[formFactor]].filter(Boolean).join(' ');
  const path = system ? PATHS[system] : undefined;
  if (!path) {
    const Fallback = FALLBACKS[formFactor ?? 'desktop'];
    return (
      <Fallback className={cn('w-4 h-4 shrink-0', className)} role="img" aria-label={label}>
        <title>{label}</title>
      </Fallback>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={label} className={cn('w-4 h-4 shrink-0', className)}>
      <title>{label}</title>
      <path d={path} />
    </svg>
  );
};
