import React from 'react';

interface ToggleRowProps {
  label: string;
  description?: string;
  isChecked: boolean;
  onChange: (isChecked: boolean) => void;
  /** Extra controls that belong to this option (e.g. the PIN field), shown while it is on */
  children?: React.ReactNode;
}

/**
 * A labelled on/off option; the label row is the click target, any extra controls sit below it.
 * The control is a native checkbox drawn as a switch, so forms, labels and keyboard use keep working.
 */
export const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, isChecked, onChange, children }) => (
  <div className="rounded-xl border border-border-2 transition-colors has-[label:hover]:bg-surface-2 has-checked:border-brand-500/40">
    <label className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <span className="text-sm font-medium text-text-2 block">{label}</span>
        {description && <span className="text-xs leading-snug text-text-5 block mt-0.5">{description}</span>}
      </div>
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => onChange(e.target.checked)}
        className="relative shrink-0 appearance-none w-9 h-5 rounded-full bg-surface-4 transition-colors checked:bg-accent before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:before:translate-x-4 motion-reduce:before:transition-none"
      />
    </label>
    {isChecked && children && (
      <div className="px-3 pb-3 transition-[opacity,transform] duration-200 starting:opacity-0 starting:-translate-y-1">
        {children}
      </div>
    )}
  </div>
);
