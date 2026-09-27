import React from 'react';
import { FolderOpen } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { IconBadge } from './ui/IconBadge';
import { describePeer } from '../utils/deviceInfo';
import type { PeerDetails } from '../types/sharing';

interface ReceiverChoosingCardProps {
  details: PeerDetails;
  onCancel: () => void;
}

/** Shown between admitting a receiver and its first file request, while it picks a save location. */
export const ReceiverChoosingCard: React.FC<ReceiverChoosingCardProps> = ({ details, onCancel }) => {
  const { name, meta } = describePeer(details);
  return (
    <Card padding="md" className="flex flex-col sm:flex-row items-center gap-4 border-brand-500/30 animate-fade-in">
      <IconBadge icon={FolderOpen} size="md" isPulsing />
      <div className="flex-1 min-w-0 text-center sm:text-left">
        <h3 className="font-bold text-text-1">{name} connected</h3>
        {meta && <p className="text-2xs text-text-5 tabular-nums mb-1">{meta}</p>}
        <p className="text-xs text-text-4">
          They are choosing where to save the files. You can still add or remove files until the download starts.
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onCancel} className="shrink-0">
        Disconnect
      </Button>
    </Card>
  );
};
