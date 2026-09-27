import React from 'react';
import { FolderOpen } from 'lucide-react';
import { Button } from './ui/Button';

interface ReceiverChoosingCardProps {
  onCancel: () => void;
}

/** Shown between admitting a receiver and its first file request, while it picks a save location. */
export const ReceiverChoosingCard: React.FC<ReceiverChoosingCardProps> = ({ onCancel }) => (
  <div className="flex flex-col sm:flex-row items-center gap-4 rounded-3xl bg-white dark:bg-supabase-surface border border-brand-500/30 p-6 shadow-xl animate-fade-in">
    <div className="relative w-12 h-12 shrink-0">
      <span className="absolute inset-0 rounded-2xl bg-brand-500/20 motion-safe:animate-ping" />
      <div className="relative w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/30 text-brand-500 flex items-center justify-center">
        <FolderOpen className="w-6 h-6" />
      </div>
    </div>
    <div className="flex-1 min-w-0 text-center sm:text-left">
      <h3 className="font-bold text-zinc-900 dark:text-white">Receiver connected</h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        They are choosing where to save the files. You can still add or remove files until the download starts.
      </p>
    </div>
    <Button variant="secondary" size="sm" onClick={onCancel} className="shrink-0">
      Cancel
    </Button>
  </div>
);
