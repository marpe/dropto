import React from 'react';
import { DownloadCloud, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { IconBadge } from './ui/IconBadge';
import { Notice } from './ui/Notice';
import { TextInput } from './ui/TextInput';
import { getActiveBrand } from '../branding';

interface RoomCodeFormProps {
  roomCode: string;
  onRoomCodeChange: (code: string) => void;
  onConnect: () => void;
  errorMessage: string | null;
}

export const RoomCodeForm: React.FC<RoomCodeFormProps> = ({
  roomCode,
  onRoomCodeChange,
  onConnect,
  errorMessage,
}) => {
  const canConnect = roomCode.trim() !== '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canConnect) {
      onConnect();
    }
  };

  return (
    <Card>
      <IconBadge icon={DownloadCloud} className="mx-auto mb-4" iconClassName="motion-safe:animate-float" />
      <h2 className="text-xl font-bold text-center text-text-1 mb-2">Receive Files via P2P</h2>
      <p className="text-xs text-center text-text-4 mb-6 max-w-sm mx-auto">
        Enter the room code the sender gave you, or paste their link.
      </p>

      {errorMessage && (
        <Notice tone="danger" icon={AlertCircle} className="mb-5">
          {errorMessage}
        </Notice>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wider text-text-5 mb-1.5">Room Code</span>
          <TextInput
            size="lg"
            autoComplete="off"
            spellCheck={false}
            placeholder={`${getActiveBrand().roomPrefix}-XXXXXX`}
            value={roomCode}
            onChange={(e) => onRoomCodeChange(e.target.value)}
            className="sm:text-2xl font-bold"
          />
        </label>

        <Button data-testid="connect" type="submit" size="lg" disabled={!canConnect} className="w-full py-3 motion-safe:hover:scale-[1.02]">
          <span>Connect</span>
          <ArrowRight className="w-4 h-4" />
        </Button>
      </form>
    </Card>
  );
};
