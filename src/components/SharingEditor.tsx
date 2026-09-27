import React, { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from './ui/Button';
import { LinkButton } from './ui/LinkButton';
import { Modal } from './ui/Modal';
import { SharingOptionsForm } from './SharingOptionsForm';
import type { SharingOptions } from '../types/sharing';

interface SharingEditorProps {
  options: SharingOptions;
  /** People connected right now (downloading, choosing or in line) whom a stricter setting could stop */
  connectedCount: number;
  onUpdate: (options: SharingOptions, applyTo: 'new' | 'now') => void;
}

function describeOptions({ pin, requireApproval, allowMultiple, maxSimultaneous }: SharingOptions): string {
  // The PIN is shown: the sender still has to pass it on to the receiver
  const rules = [pin ? `PIN ${pin}` : null, requireApproval ? 'you accept each person' : null].filter(Boolean);
  const access = rules.length > 0 ? rules.join(' · ') : 'Anyone with the link joins straight away';
  const audience = !allowMultiple
    ? 'one download'
    : maxSimultaneous === 1
      ? 'several people, one at a time'
      : `several people, up to ${maxSimultaneous} at a time`;
  return `${access} · ${audience}`;
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
 * Edits sharing options once the link is out. Changes are drafted and saved together, so a stricter
 * setting asks at most one question: new connections only, or also stop everyone connected now.
 */
export const SharingEditor: React.FC<SharingEditorProps> = ({ options, connectedCount, onUpdate }) => {
  const [draft, setDraft] = useState<SharingOptions | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  if (!draft) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-4">
        <span>{describeOptions(options)}</span>
        <LinkButton data-testid="edit-sharing" onClick={() => setDraft(options)} className="text-xs">
          <Settings2 className="w-3.5 h-3.5" />
          Edit sharing
        </LinkButton>
      </div>
    );
  }

  const stricterChanges = describeStricterChanges(options, draft);
  const finish = (applyTo: 'new' | 'now') => {
    onUpdate(draft, applyTo);
    setIsConfirming(false);
    setDraft(null);
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (connectedCount > 0 && stricterChanges.length > 0) {
      setIsConfirming(true);
    } else {
      finish('new');
    }
  };
  const isSeveral = connectedCount > 1;

  return (
    <form onSubmit={save} className="space-y-4">
      <SharingOptionsForm options={draft} onChange={setDraft} />
      <div className="flex justify-end gap-3">
        <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
          Cancel
        </Button>
        <Button data-testid="save-sharing" type="submit" size="sm">
          Save
        </Button>
      </div>

      {isConfirming && (
        <Modal
          title={isSeveral ? 'Apply to people already connected?' : 'Apply to the current receiver?'}
          onClose={() => setIsConfirming(false)}
          footer={
            <div className="flex flex-wrap justify-end gap-3 w-full">
              <Button variant="ghost" onClick={() => setIsConfirming(false)}>
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
            {stricterChanges.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </Modal>
      )}
    </form>
  );
};
