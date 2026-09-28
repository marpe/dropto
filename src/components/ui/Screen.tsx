import React from 'react';
import { cn } from '../../utils/cn';

interface ScreenProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * One screen of a flow (files, link, transfer, done…). Give it a `key` naming the screen: a new key
 * remounts it, so the enter animation plays on every step change but not on updates within a step.
 */
export const Screen: React.FC<ScreenProps> = ({ children, className }) => (
  <div
    className={cn(
      // Grouped sections on a phone; one panel divided by hairlines on desktop
      'w-full flex flex-col gap-4 motion-safe:animate-screen-in motion-reduce:animate-fade-in',
      className
    )}
  >
    {children}
  </div>
);
