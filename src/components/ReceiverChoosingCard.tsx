import React from 'react';
import { FolderOpen } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { IconBadge } from './ui/IconBadge';

interface ReceiverChoosingCardProps {
  onCancel: () => void;
}

/** Shown between admitting a receiver and its first file request, while it picks a save location. */
export const ReceiverChoosingCard: React.FC<ReceiverChoosingCardProps> = ({ onCancel }) => (
  <Card padding="md" className="flex flex-col sm:flex-row items-center gap-4 border-brand-500/30 dark:border-brand-500/30 animate-fade-in">
    <IconBadge icon={FolderOpen} size="md" isPulsing />
    <div className="flex-1 min-w-0 text-center sm:text-left">
      <h3 className="font-bold text-zinc-900 dark:text-white">Receiver connected</h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        They are choosing where to save the files. You can still add or remove files until the download starts.
      </p>
    </div>
    <Button variant="secondary" size="sm" onClick={onCancel} className="shrink-0">
      Cancel
    </Button>
  </Card>
);
