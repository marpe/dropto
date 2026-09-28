import React from 'react';
import { FileUp, ShieldCheck, UserCheck, X } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { formatBytes } from '../utils/format';
import { describePeer, placeFromTimeZone } from '../utils/deviceInfo';
import { BrowserIcon } from './ui/BrowserIcon';
import type { PeerDetails } from '../types/sharing';

interface PeerApprovalModalProps {
  details: PeerDetails;
  fileCount: number;
  totalBytes: number;
  onApprove: () => void;
  onReject: () => void;
  onSelectFiles: () => void;
}

interface DetailRowProps {
  label: string;
  children: React.ReactNode;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, children }) => (
  <div className="flex justify-between gap-3">
    <span className="text-text-4">{label}</span>
    <span className="min-w-0 truncate font-semibold text-text-2">{children}</span>
  </div>
);

/** No close button: the sender must accept or decline, otherwise the receiver would wait forever. */
export const PeerApprovalModal: React.FC<PeerApprovalModalProps> = ({
  details,
  fileCount,
  totalBytes,
  onApprove,
  onReject,
  onSelectFiles,
}) => {
  const hasFiles = fileCount > 0;
  const peer = describePeer(details);

  return (
    <Modal
      title="Someone wants to connect"
      icon={ShieldCheck}
      footer={
        <div className="grid grid-cols-2 gap-3 w-full">
          <Button variant="danger" onClick={onReject}>
            <X className="w-4 h-4" />
            <span>Decline</span>
          </Button>
          <Button data-testid="approve-peer" onClick={onApprove} disabled={!hasFiles}>
            <UserCheck className="w-4 h-4" />
            <span>Accept</span>
          </Button>
        </div>
      }
    >
      <p className="text-xs text-text-4 mb-4">
        Someone typed in your room code and wants to download your files.
      </p>

      <div className="p-3 bg-surface-2 rounded-xl border border-border-2 text-left text-xs space-y-1.5">
        <DetailRow label="Files">
          {fileCount} {fileCount === 1 ? 'file' : 'files'}
        </DetailRow>
        <DetailRow label="Size">{formatBytes(totalBytes)}</DetailRow>
        <DetailRow label="Device">
          <span className="inline-flex items-center gap-1.5">
            <BrowserIcon browser={peer.browser} className="text-text-4" />
            {peer.name}
          </span>
        </DetailRow>
        {details.ip && (
          <DetailRow label="Address">
            <span className="font-mono font-normal">{details.ip}</span>
          </DetailRow>
        )}
        {placeFromTimeZone(details.timeZone) && (
          <DetailRow label="Time zone">{placeFromTimeZone(details.timeZone)}</DetailRow>
        )}
      </div>

      {!hasFiles && (
        <div className="mt-5 space-y-3">
          <p className="text-xs text-text-warning-1">No files yet. Add some before accepting.</p>
          <Button data-testid="add-files" variant="secondary" onClick={onSelectFiles} className="w-full">
            <FileUp className="w-4 h-4" />
            <span>Add files</span>
          </Button>
        </div>
      )}

    </Modal>
  );
};
