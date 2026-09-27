import React from 'react';
import { ShieldCheck, UserCheck, X } from 'lucide-react';
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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          Receiver Connection Request
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          A peer device has connected and requested to download files
        </p>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 mb-5 text-left text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Peer ID:</span>
            <span className="font-mono text-slate-700 dark:text-slate-200 truncate max-w-[180px]">{peerId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Queued Files:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{fileCount} files</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Total Size:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{formatBytes(totalBytes)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onReject}
            className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-700 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <X className="w-4 h-4" />
            <span>Decline</span>
          </button>
          <button
            onClick={onApprove}
            className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-all"
          >
            <UserCheck className="w-4 h-4" />
            <span>Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
};
