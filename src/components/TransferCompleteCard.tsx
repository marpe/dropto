import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { fireCelebration } from '../services/confetti';

interface TransferCompleteCardProps {
  successTitle: string;
  successDescription: string;
  actionLabel: string;
  onAction: () => void;
  /** Paths of files whose checksum did not match; any entry turns the card into a warning */
  corruptedFiles: string[];
}

export const TransferCompleteCard: React.FC<TransferCompleteCardProps> = ({
  successTitle,
  successDescription,
  actionLabel,
  onAction,
  corruptedFiles,
}) => {
  const isVerified = corruptedFiles.length === 0;

  useEffect(() => {
    // Never celebrate a transfer that may have produced corrupted files
    if (isVerified) {
      fireCelebration();
    }
  }, [isVerified]);

  return (
    <div className="rounded-2xl bg-white dark:bg-supabase-surface border border-zinc-200 dark:border-zinc-800 p-8 text-center shadow-xl animate-fade-in">
      {isVerified ? (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-brand-500/10 border border-brand-500/30 text-brand-500 flex items-center justify-center motion-safe:animate-bounce">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-balance text-zinc-900 dark:text-white mb-2">{successTitle}</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">{successDescription}</p>
        </>
      ) : (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-balance text-zinc-900 dark:text-white mb-2">
            Transfer Finished With Errors
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            {corruptedFiles.length === 1 ? '1 file' : `${corruptedFiles.length} files`} failed the integrity check and
            may be corrupted. Send {corruptedFiles.length === 1 ? 'it' : 'them'} again:
          </p>
          <ul className="max-h-40 overflow-y-auto mb-6 space-y-1 text-left text-xs font-mono">
            {corruptedFiles.map((path) => (
              <li
                key={path}
                className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 break-all"
              >
                {path}
              </li>
            ))}
          </ul>
        </>
      )}
      <button
        onClick={onAction}
        className="px-6 py-2.5 rounded-xl font-bold bg-brand-500 hover:bg-brand-600 text-supabase-bg shadow-lg shadow-brand-500/25 transition-[transform,background-color] motion-safe:hover:scale-105"
      >
        {actionLabel}
      </button>
    </div>
  );
};
