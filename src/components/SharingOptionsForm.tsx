import React, { useState } from 'react';
import { ToggleRow } from './ui/ToggleRow';
import { TextInput } from './ui/TextInput';
import type { SharingOptions } from '../hooks/useSenderSession';

interface SharingOptionsFormProps {
  options: SharingOptions;
  onChange: (options: SharingOptions) => void;
}

/** Who may connect: an optional PIN, and whether even people with the link must be accepted by hand. */
export const SharingOptionsForm: React.FC<SharingOptionsFormProps> = ({ options, onChange }) => {
  // The switch can be on while the PIN is still empty, so it is not derived from the PIN alone
  const [isPinEnabled, setIsPinEnabled] = useState(options.pin !== '');

  const togglePin = (isEnabled: boolean) => {
    setIsPinEnabled(isEnabled);
    if (!isEnabled) {
      onChange({ ...options, pin: '' });
    }
  };

  return (
    <div className="space-y-3">
      <ToggleRow
        label="Require a PIN"
        description="Receivers must enter it before they can see the files"
        isChecked={isPinEnabled}
        onChange={togglePin}
      >
        <TextInput
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          placeholder="e.g. 1234"
          value={options.pin}
          onChange={(e) => onChange({ ...options, pin: e.target.value })}
          className="text-center font-mono text-sm tracking-widest bg-surface-2"
        />
      </ToggleRow>
      <ToggleRow
        label="Ask me before anyone connects"
        description="Otherwise people with the link join straight away. Anyone typing the room code always needs your OK."
        isChecked={options.requireApproval}
        onChange={(requireApproval) => onChange({ ...options, requireApproval })}
      />
    </div>
  );
};
