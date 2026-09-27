import React, { useState } from 'react';
import { Link2, Pencil, Unlink } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { LinkButton } from './ui/LinkButton';
import { ShareBox } from './ShareBox';
import { ShareActivity } from './ShareActivity';
import { SharingEditor } from './SharingEditor';
import { SharingOptionsForm } from './SharingOptionsForm';
import type { SenderReceiver, SharingOptions } from '../types/sharing';
import type { TransferFile } from '../types/transfer';
import { formatBytes } from '../utils/format';

interface ShareStepProps {
  files: TransferFile[];
  onEditFiles: () => void;
  isShared: boolean;
  options: SharingOptions;
  /** Before the link exists options are edited in place */
  onOptionsChange: (options: SharingOptions) => void;
  onCreateLink: () => void;
  onUpdateSharing: (options: SharingOptions, applyTo: 'new' | 'now') => void;
  onStopSharing: () => void;
  /** People downloading, choosing or in line */
  connectedCount: number;
  receivers: SenderReceiver[];
  onStopReceiver: (peerId: string) => void;
  onDismissReceiver: (peerId: string) => void;
  roomCode: string;
  shareUrl: string;
  roomNotice: string | null;
}

/** Second step of sending: decide who may connect, then create the link, pass it on and follow who uses it. */
export const ShareStep: React.FC<ShareStepProps> = ({
  files,
  onEditFiles,
  isShared,
  options,
  onOptionsChange,
  onCreateLink,
  onUpdateSharing,
  onStopSharing,
  connectedCount,
  receivers,
  onStopReceiver,
  onDismissReceiver,
  roomCode,
  shareUrl,
  roomNotice,
}) => {
  const [isConfirmingStop, setIsConfirmingStop] = useState(false);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
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
    <Card padding="md" className="space-y-5">
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-border-1">
        <span className="text-sm font-bold text-text-2 tabular-nums">
          {files.length} {files.length === 1 ? 'file' : 'files'} · {formatBytes(totalBytes)}
        </span>
        <LinkButton data-testid="edit-files" onClick={onEditFiles} className="text-xs">
          <Pencil className="w-3.5 h-3.5" />
          Edit files
        </LinkButton>
      </div>

      {isShared ? (
        <>
          <ShareBox roomCode={roomCode} shareUrl={shareUrl} notice={roomNotice} />
          {showsActivity && (
            <ShareActivity
              receivers={receivers}
              isListed={options.allowMultiple}
              onStopReceiver={onStopReceiver}
              onDismissReceiver={onDismissReceiver}
            />
          )}
          <SharingEditor options={options} connectedCount={connectedCount} onUpdate={onUpdateSharing} />
          <div className="text-center">
            <LinkButton data-testid="stop-sharing" onClick={requestStopSharing} className="text-xs">
              <Unlink className="w-3.5 h-3.5" />
              Stop sharing
            </LinkButton>
          </div>
        </>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateLink();
          }}
        >
          <SharingOptionsForm options={options} onChange={onOptionsChange} />
          <Button data-testid="create-link" type="submit" size="lg" className="w-full">
            <Link2 className="w-5 h-5" />
            <span>Create link</span>
          </Button>
        </form>
      )}

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
