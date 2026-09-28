import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { SharingOptionsForm } from './SharingOptionsForm';
import type { SharingOptions } from '../types/sharing';

interface SharingSettingsProps {
  options: SharingOptions;
  /** People connected right now (downloading, choosing or in line) whom a stricter setting could stop */
  connectedCount: number;
  onUpdate: (options: SharingOptions, applyTo: 'new' | 'now') => void;
  onClose: () => void;
}

/** What got stricter; only these can matter to someone already connected. */
function describeStricterChanges(current: SharingOptions, next: SharingOptions): string[] {
  const changes: string[] = [];
  if (next.pin && next.pin !== current.pin) {
    changes.push(current.pin ? 'New connections need the new PIN.' : 'New connections need a PIN.');
  }
  if (next.requireApproval && !current.requireApproval) {
    changes.push('New connections need your approval.');
  }
  if (next.maxSimultaneous < current.maxSimultaneous) {
    changes.push(
      next.maxSimultaneous === 1 ? 'One person can download at a time.' : `Up to ${next.maxSimultaneous} people can download at a time.`
    );
  }
  return changes;
}

interface StricterChange {
  options: SharingOptions;
  descriptions: string[];
}

/**
 * The live link's settings dialog. Each change applies to new connections at once; a stricter one while
 * people are connected then asks whether to stop them too, so they reconnect under the new rules.
 */
export const SharingSettings: React.FC<SharingSettingsProps> = ({ options, connectedCount, onUpdate, onClose }) => {
  const [stricter, setStricter] = useState<StricterChange | null>(null);

  const change = (next: SharingOptions) => {
    onUpdate(next, 'new');
    const descriptions = describeStricterChanges(options, next);
    if (connectedCount > 0 && descriptions.length > 0) {
      setStricter({ options: next, descriptions });
    }
  };
  const stopCurrent = () => {
    if (stricter) {
      onUpdate(stricter.options, 'now');
    }
    setStricter(null);
  };

  return (
    <>
      <Modal title="Settings" icon={Settings} onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
        <SharingOptionsForm options={options} onChange={change} />
      </Modal>

      {stricter && (
        <ConfirmDialog
          title="Stop current downloads?"
          confirmLabel="Stop"
          tone="danger"
          onConfirm={stopCurrent}
          onCancel={() => setStricter(null)}
        >
          <p>
            {stricter.descriptions.join(' ')} {connectedCount > 1 ? `${connectedCount} people are` : 'Someone is'} still
            connected with the old settings.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
};
