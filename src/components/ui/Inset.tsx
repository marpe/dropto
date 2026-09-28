import React from 'react';
import { cn } from '../../utils/cn';

interface InsetProps {
  children: React.ReactNode;
  className?: string;
}

/** Content that is not a section (a notice, the link bar…), kept in line with the sections' padding. */
export const Inset: React.FC<InsetProps> = ({ children, className }) => (
  <div className={cn('px-4 sm:px-5 sm:py-4', className)}>{children}</div>
);
