import React from 'react';
import { Link2, Pencil } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { LinkButton } from './ui/LinkButton';
import { ShareBox } from './ShareBox';
import { SharingEditor } from './SharingEditor';
import { SharingOptionsForm } from './SharingOptionsForm';
import type { SharingOptions } from '../hooks/useSenderSession';
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
  hasConnectedReceiver: boolean;
  roomCode: string;
  shareUrl: string;
  roomNotice: string | null;
}

/** Second step of sending: decide who may connect, then create the link and pass it on. */
export const ShareStep: React.FC<ShareStepProps> = ({
  files,
  onEditFiles,
  isShared,
  options,
  onOptionsChange,
  onCreateLink,
  onUpdateSharing,
  hasConnectedReceiver,
  roomCode,
  shareUrl,
  roomNotice,
}) => {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

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
          <SharingEditor options={options} hasConnectedReceiver={hasConnectedReceiver} onUpdate={onUpdateSharing} />
        </>
      ) : (
        <>
          <SharingOptionsForm options={options} onChange={onOptionsChange} />
          <Button data-testid="create-link" size="lg" onClick={onCreateLink} className="w-full">
            <Link2 className="w-5 h-5" />
            <span>Create link</span>
          </Button>
        </>
      )}
    </Card>
  );
};
