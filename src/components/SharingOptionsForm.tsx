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
  /** Called with each complete change; the PIN only once typing is done (blur or Enter) */
  onChange: (options: SharingOptions) => void;
}

interface PinFieldProps {
  pin: string;
  onCommit: (pin: string) => void;
}

/**
 * The link is live while this is edited, so a half-typed PIN must never apply: the draft is committed
 * on blur or Enter, and clearing the field keeps the current PIN (turning the switch off removes it).
 */
const PinField: React.FC<PinFieldProps> = ({ pin, onCommit }) => {
  const [draft, setDraft] = useState(pin);

  const commit = () => {
    const next = draft.trim();
    if (next === '' || next === pin) {
      setDraft(pin);
      return;
    }
    onCommit(next);
  };

  return (
    <TextInput
      name="pin"
      data-testid="pin-input"
      inputMode="numeric"
      autoComplete="off"
      maxLength={6}
      placeholder="e.g. 4821"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
      className="text-center font-mono text-sm tracking-widest bg-surface-2"
    />
  );
};

/** Who may connect (an optional PIN, and whether even people with the link must be accepted by hand) and how many. */
export const SharingOptionsForm: React.FC<SharingOptionsFormProps> = ({ options, onChange }) => (
  <div className="space-y-3">
    <ToggleRow
      label="Require a PIN"
      description="Receivers must enter it before they can see the files"
      isChecked={options.pin !== ''}
      onChange={(isEnabled) => onChange({ ...options, pin: isEnabled ? generatePin() : '' })}
    >
      <div className="flex items-center gap-2">
        {/* A new PIN from outside (e.g. the button) replaces any draft */}
        <PinField key={options.pin} pin={options.pin} onCommit={(pin) => onChange({ ...options, pin })} />
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
