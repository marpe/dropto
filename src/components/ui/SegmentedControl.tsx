import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** A row of mutually exclusive choices where the selected one is filled with the brand colour. */
export function SegmentedControl<T extends string>({ options, value, onChange, className }: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex p-1 rounded-xl bg-surface-3 border border-border-2',
        className
      )}
    >
      {options.map(({ value: optionValue, label, icon: Icon }) => (
        <button
          key={optionValue}
          type="button"
          onClick={() => onChange(optionValue)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-[color,background-color]',
            optionValue === value
              ? 'bg-brand-500 text-text-on-accent'
              : 'text-text-4 hover:text-text-1'
          )}
        >
          {Icon && <Icon className="w-3.5 h-3.5" />}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
