import React from 'react';
import { FileUp, ShieldCheck, UserCheck, X } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { formatBytes } from '../utils/format';

interface PeerApprovalModalProps {
  peerId: string;
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
  peerId,
  fileCount,
  totalBytes,
  onApprove,
  onReject,
  onSelectFiles,
}) => {
  const hasFiles = fileCount > 0;

  return (
    <Modal
      title="Receiver Connection Request"
      icon={ShieldCheck}
      footer={
        <div className="grid grid-cols-2 gap-3 w-full">
          <Button variant="danger" onClick={onReject}>
            <X className="w-4 h-4" />
            <span>Decline</span>
          </Button>
          <Button onClick={onApprove} disabled={!hasFiles}>
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
        <DetailRow label="Peer ID:">
          <span className="font-mono font-normal">{peerId}</span>
        </DetailRow>
        <DetailRow label="Queued Files:">
          {fileCount} {fileCount === 1 ? 'file' : 'files'}
        </DetailRow>
        <DetailRow label="Total Size:">{formatBytes(totalBytes)}</DetailRow>
      </div>

      {!hasFiles && (
        <div className="mt-5 space-y-3">
          <p className="text-xs text-text-warning-1">Nothing is queued yet — add files before accepting.</p>
          <Button variant="secondary" onClick={onSelectFiles} className="w-full">
            <FileUp className="w-4 h-4" />
            <span>Select Files</span>
          </Button>
        </div>
      )}

    </Modal>
  );
};
