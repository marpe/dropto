import React from 'react';
import { ShieldCheck, UserCheck, X } from 'lucide-react';
import { Button } from './ui/Button';
import { formatBytes } from '../utils/format';

interface PeerApprovalModalProps {
  isOpen: boolean;
  peerId: string;
  fileCount: number;
  totalBytes: number;
  onApprove: () => void;
  onReject: () => void;
}

export const PeerApprovalModal: React.FC<PeerApprovalModalProps> = ({
  isOpen,
  peerId,
  fileCount,
  totalBytes,
  onApprove,
  onReject,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-supabase-surface p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-brand-500/10 border border-brand-500/30 text-brand-500 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">
          Receiver Connection Request
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
          A peer device has connected and requested to download files
        </p>

        <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200 dark:border-zinc-800 mb-5 text-left text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">Peer ID:</span>
            <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate max-w-[180px]">{peerId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">Queued Files:</span>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">{fileCount} files</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">Total Size:</span>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatBytes(totalBytes)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            onClick={onReject}
            className="px-4 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 dark:hover:text-red-400"
          >
            <X className="w-4 h-4" />
            <span>Decline</span>
          </Button>
          <Button onClick={onApprove} className="px-4">
            <UserCheck className="w-4 h-4" />
            <span>Accept</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
