import React, { useState } from 'react';
import { Unlink } from 'lucide-react';
import { Card } from './ui/Card';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { LinkButton } from './ui/LinkButton';
import { ShareBox } from './ShareBox';
import { ShareActivity } from './ShareActivity';
import { SharingSettings } from './SharingSettings';
import type { SenderReceiver, SharingOptions } from '../types/sharing';

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

/** Below the files once shared: the link to pass on, who is using it, and who may. */
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
  // One person connected gets the full-screen card above; the quiet line is only for an idle link
  const showsActivity = options.allowMultiple || connectedCount === 0;

  const requestStopSharing = () => {
    if (connectedCount > 0) {
      setIsConfirmingStop(true);
    } else {
      onStopSharing();
    }
  };

  return (
    <Card padding="md" data-testid="link-section" className="space-y-5 transition-[opacity,transform] duration-300 starting:opacity-0 starting:translate-y-2">
      <ShareBox roomCode={roomCode} shareUrl={shareUrl} notice={roomNotice} />
      {showsActivity && (
        <ShareActivity
          receivers={receivers}
          isListed={options.allowMultiple}
          onStopReceiver={onStopReceiver}
          onDismissReceiver={onDismissReceiver}
        />
      )}
      <SharingSettings options={options} connectedCount={connectedCount} onUpdate={onUpdateSharing} />
      <div className="text-center">
        <LinkButton data-testid="stop-sharing" onClick={requestStopSharing} className="text-xs">
          <Unlink className="w-3.5 h-3.5" />
          Stop sharing
        </LinkButton>
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
