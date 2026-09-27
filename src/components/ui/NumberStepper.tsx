import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { IconButton } from './IconButton';

interface NumberStepperProps {
  /** Names the value for assistive tech; the visible label sits wherever the stepper is used */
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

/** A small whole number picked with − / + (e.g. how many people download at once). */
export const NumberStepper: React.FC<NumberStepperProps> = ({ label, value, min, max, onChange }) => (
  <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border-2 bg-surface-2 p-0.5">
    <IconButton title="Fewer" size="sm" disabled={value <= min} onClick={() => onChange(value - 1)}>
      <Minus className="w-4 h-4" />
    </IconButton>
    <output aria-label={label} className="w-7 text-center text-sm font-bold tabular-nums text-text-1">
      {value}
    </output>
    <IconButton title="More" size="sm" disabled={value >= max} onClick={() => onChange(value + 1)}>
      <Plus className="w-4 h-4" />
    </IconButton>
  </div>
);
