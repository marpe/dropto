import React, { useState } from 'react';
import { Unlink } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { ShareBox } from './ShareBox';
import { ReceiverList } from './ReceiverList';
import { SharingSettings } from './SharingSettings';
import type { SenderReceiver, SharingOptions } from '../types/sharing';
import { countActiveReceivers } from '../hooks/senderState';

interface LinkSectionProps {
  roomCode: string;
  shareUrl: string;
  roomNotice: string | null;
  options: SharingOptions;
  onUpdateSharing: (options: SharingOptions, applyTo: 'new' | 'now') => void;
  onStopSharing: () => void;
  /** People downloading, choosing or in line */
  connectedCount: number;
  receivers: SenderReceiver[];
  onStopReceiver: (peerId: string) => void;
  onDismissReceiver: (peerId: string) => void;
}

function describeActivity(receivers: SenderReceiver[]): string {
  const active = countActiveReceivers(receivers);
  const waiting = receivers.filter((receiver) => receiver.stage === 'queued').length;
  const done = receivers.filter((receiver) => receiver.stage === 'completed').length;
  const parts = [
    active > 0 ? `${active} connected` : null,
    waiting > 0 ? `${waiting} waiting` : null,
    done > 0 ? `${done} done` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Waiting for someone';
}

/** Below the files once shared: the link to pass on, who is using it, its settings and a way to end it. */
export const LinkSection: React.FC<LinkSectionProps> = ({
  roomCode,
  shareUrl,
  roomNotice,
  options,
  onUpdateSharing,
  onStopSharing,
  connectedCount,
  receivers,
  onStopReceiver,
  onDismissReceiver,
}) => {
  const [isConfirmingStop, setIsConfirmingStop] = useState(false);
  const isIdle = connectedCount === 0 && receivers.length === 0;
  // With one person at a time, whoever is connected gets the full-screen card instead of a list
  const showsList = options.allowMultiple && receivers.length > 0;

  const requestStopSharing = () => {
    if (connectedCount > 0) {
      setIsConfirmingStop(true);
    } else {
      onStopSharing();
    }
  };

  return (
    <Card
      padding="md"
      data-testid="link-section"
      className="space-y-5 transition-[opacity,transform] duration-300 starting:opacity-0 starting:translate-y-2"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-text-1">Your link</h2>
        <span
          data-testid={isIdle ? 'share-waiting' : 'share-status'}
          className="inline-flex items-center gap-1.5 rounded-full border border-border-2 bg-surface-2 px-2.5 py-1 text-xs text-text-4 tabular-nums"
        >
          <span className="relative flex size-2">
            {isIdle && <span className="absolute inset-0 rounded-full bg-brand-500/60 motion-safe:animate-ping" />}
            <span className="relative size-2 rounded-full bg-brand-500" />
          </span>
          {describeActivity(receivers)}
        </span>
      </div>

      <ShareBox roomCode={roomCode} shareUrl={shareUrl} notice={roomNotice} />

      {showsList && (
        <ReceiverList receivers={receivers} onStopReceiver={onStopReceiver} onDismissReceiver={onDismissReceiver} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border-1">
        <SharingSettings options={options} connectedCount={connectedCount} onUpdate={onUpdateSharing} />
        <Button data-testid="stop-sharing" variant="danger" size="sm" onClick={requestStopSharing}>
          <Unlink className="w-3.5 h-3.5" />
          Stop sharing
        </Button>
      </div>

      {isConfirmingStop && (
        <ConfirmDialog
          title="Stop sharing?"
          confirmLabel="Stop sharing"
          tone="danger"
          onConfirm={() => {
            setIsConfirmingStop(false);
            onStopSharing();
          }}
          onCancel={() => setIsConfirmingStop(false)}
        >
          <p>
            {connectedCount === 1 ? 'Someone is' : `${connectedCount} people are`} connected; their downloads stop. The
            link stops working, and your files stay here to share again.
          </p>
        </ConfirmDialog>
      )}
    </Card>
  );
};
