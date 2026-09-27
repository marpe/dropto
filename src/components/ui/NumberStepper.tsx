import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { IconButton } from './IconButton';

interface NumberStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

/** A small whole number picked with − / + (e.g. how many people download at once). */
export const NumberStepper: React.FC<NumberStepperProps> = ({ label, value, min, max, onChange }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-xs text-text-4">{label}</span>
    <div className="flex items-center gap-1 rounded-xl border border-border-2 bg-surface-2 p-0.5">
      <IconButton title="Fewer" size="sm" disabled={value <= min} onClick={() => onChange(value - 1)} className="disabled:opacity-40 disabled:pointer-events-none">
        <Minus className="w-4 h-4" />
      </IconButton>
      <output aria-label={label} className="w-7 text-center text-sm font-bold tabular-nums text-text-1">
        {value}
      </output>
      <IconButton title="More" size="sm" disabled={value >= max} onClick={() => onChange(value + 1)} className="disabled:opacity-40 disabled:pointer-events-none">
        <Plus className="w-4 h-4" />
      </IconButton>
    </div>
  </div>
);
