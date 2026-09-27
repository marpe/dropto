import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { SharingOptionsForm } from './SharingOptionsForm';
import type { SharingOptions } from '../types/sharing';

interface SharingSettingsProps {
  options: SharingOptions;
  /** People connected right now (downloading, choosing or in line) whom a stricter setting could stop */
  connectedCount: number;
  onUpdate: (options: SharingOptions, applyTo: 'new' | 'now') => void;
}

/** What got stricter; only these can matter to someone already connected. */
function describeStricterChanges(current: SharingOptions, next: SharingOptions): string[] {
  const changes: string[] = [];
  if (next.pin && next.pin !== current.pin) {
    changes.push(current.pin ? 'The PIN changes' : 'A PIN becomes required');
  }
  if (next.requireApproval && !current.requireApproval) {
    changes.push('You accept each person before they connect');
  }
  if (current.allowMultiple && !next.allowMultiple) {
    changes.push('Only one person downloads; anyone waiting in line is turned away');
  } else if (next.allowMultiple && next.maxSimultaneous < current.maxSimultaneous) {
    changes.push(`At most ${next.maxSimultaneous} download at the same time`);
  }
  return changes;
}

/**
 * The live link's settings. Each change applies at once; a stricter one while people are connected
 * first asks whether it is for new connections only or should also stop everyone connected now.
 */
export const SharingSettings: React.FC<SharingSettingsProps> = ({ options, connectedCount, onUpdate }) => {
  const [pending, setPending] = useState<SharingOptions | null>(null);
  const stricterChanges = pending ? describeStricterChanges(options, pending) : [];
  const isSeveral = connectedCount > 1;

  const change = (next: SharingOptions) => {
    if (connectedCount > 0 && describeStricterChanges(options, next).length > 0) {
      setPending(next);
    } else {
      onUpdate(next, 'new');
    }
  };
  const finish = (applyTo: 'new' | 'now') => {
    if (pending) {
      onUpdate(pending, applyTo);
    }
    setPending(null);
  };

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold text-text-3">Who can use the link</h3>
      <SharingOptionsForm options={options} onChange={change} />

      {pending && (
        <Modal
          title={isSeveral ? 'Apply to people already connected?' : 'Apply to the current receiver?'}
          onClose={() => setPending(null)}
          footer={
            <div className="flex flex-wrap justify-end gap-3 w-full">
              <Button variant="ghost" onClick={() => setPending(null)}>
                Back
              </Button>
              <Button data-testid="apply-now" variant="danger" onClick={() => finish('now')}>
                {isSeveral ? 'Apply now and stop all transfers' : 'Apply now and stop their transfer'}
              </Button>
              <Button data-testid="apply-to-new" onClick={() => finish('new')}>
                New connections only
              </Button>
            </div>
          }
        >
          <p className="text-sm text-text-3 mb-3">
            {isSeveral ? `${connectedCount} people are` : 'Someone is'} connected right now under the old settings. You
            can leave them be, or stop their transfers so they have to reconnect under the new ones.
          </p>
          <ul className="text-sm text-text-2 list-disc pl-5 space-y-1">
            {stricterChanges.map((description) => (
              <li key={description}>{description}</li>
            ))}
          </ul>
        </Modal>
      )}
    </section>
  );
};
