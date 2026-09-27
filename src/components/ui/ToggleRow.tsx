import React from 'react';

interface ToggleRowProps {
  label: string;
  description?: string;
  isChecked: boolean;
  onChange: (isChecked: boolean) => void;
  /** Extra controls that belong to this option (e.g. the PIN field), shown while it is on */
  children?: React.ReactNode;
}

/** A labelled on/off option; the label row is the click target, any extra controls sit below it. */
export const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, isChecked, onChange, children }) => (
  <div className="rounded-xl border border-border-2 transition-colors has-[label:hover]:bg-surface-2">
    <label className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <span className="text-sm font-medium text-text-2 block">{label}</span>
        {description && <span className="text-xs leading-snug text-text-5 block mt-0.5">{description}</span>}
      </div>
      <input type="checkbox" checked={isChecked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 shrink-0" />
    </label>
    {isChecked && children && <div className="px-3 pb-3">{children}</div>}
  </div>
);
