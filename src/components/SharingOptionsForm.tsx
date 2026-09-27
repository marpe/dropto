import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToggleRow } from './ui/ToggleRow';
import { TextInput } from './ui/TextInput';
import { IconButton } from './ui/IconButton';
import { NumberStepper } from './ui/NumberStepper';
import type { SharingOptions } from '../types/sharing';
import { generatePin } from '../utils/pin';
import { MAX_SIMULTANEOUS, MIN_SIMULTANEOUS } from '../utils/sharingMemory';

interface SharingOptionsFormProps {
  options: SharingOptions;
  onChange: (options: SharingOptions) => void;
}

/**
 * Who may connect (an optional PIN, and whether even people with the link must be accepted by hand)
 * and how many. Render it inside a <form>: an enabled PIN is `required`, so submitting stops at an empty one.
 */
export const SharingOptionsForm: React.FC<SharingOptionsFormProps> = ({ options, onChange }) => {
  // The switch can be on while the PIN field is cleared, so it is not derived from the PIN alone
  const [isPinEnabled, setIsPinEnabled] = useState(options.pin !== '');

  const togglePin = (isEnabled: boolean) => {
    setIsPinEnabled(isEnabled);
    onChange({ ...options, pin: isEnabled ? generatePin() : '' });
  };

  return (
    <div className="space-y-3">
      <ToggleRow
        label="Require a PIN"
        description="Receivers must enter it before they can see the files"
        isChecked={isPinEnabled}
        onChange={togglePin}
      >
        <div className="flex items-center gap-2">
          <TextInput
            name="pin"
            data-testid="pin-input"
            inputMode="numeric"
            autoComplete="off"
            required
            maxLength={6}
            placeholder="e.g. 4821"
            value={options.pin}
            onChange={(e) => onChange({ ...options, pin: e.target.value })}
            className="text-center font-mono text-sm tracking-widest bg-surface-2"
          />
          <IconButton title="New PIN" onClick={() => onChange({ ...options, pin: generatePin() })}>
            <RefreshCw className="w-4 h-4" />
          </IconButton>
        </div>
      </ToggleRow>
      <ToggleRow
        label="Ask me before anyone connects"
        description="Otherwise people with the link join straight away. Anyone typing the room code always needs your OK."
        isChecked={options.requireApproval}
        onChange={(requireApproval) => onChange({ ...options, requireApproval })}
      />
      <ToggleRow
        label="Let several people download"
        description="Otherwise the link works for one download, then stops working."
        isChecked={options.allowMultiple}
        onChange={(allowMultiple) => onChange({ ...options, allowMultiple })}
      >
        <NumberStepper
          label="Downloading at the same time (others wait in line)"
          value={options.maxSimultaneous}
          min={MIN_SIMULTANEOUS}
          max={MAX_SIMULTANEOUS}
          onChange={(maxSimultaneous) => onChange({ ...options, maxSimultaneous })}
        />
      </ToggleRow>
    </div>
  );
};
