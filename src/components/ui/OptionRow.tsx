import React from 'react';
import { cn } from '../../utils/cn';
import { optionBoxClassName } from './optionRowStyles';

interface OptionRowProps {
  label: string;
  description?: string;
  /** The control on the right, e.g. a NumberStepper */
  control: React.ReactNode;
  /** Highlights the row like a switched-on ToggleRow */
  isActive?: boolean;
}

/** A labelled setting whose control is not a switch (see ToggleRow for on/off options). */
export const OptionRow: React.FC<OptionRowProps> = ({ label, description, control, isActive = false }) => (
  <div className={cn(optionBoxClassName, 'flex items-center justify-between gap-3 p-3', isActive && 'border-brand-500/40')}>
    <div className="min-w-0">
      <span className="text-sm font-medium text-text-2 block">{label}</span>
      {description && <span className="text-xs leading-snug text-text-5 block mt-0.5">{description}</span>}
    </div>
    {control}
  </div>
);
