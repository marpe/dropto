import React from 'react';
import { DownloadCloud, ArrowRight } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { IconBadge } from './ui/IconBadge';
import { TextInput } from './ui/TextInput';
import { getActiveBrand } from '../branding';

interface RoomCodeFormProps {
  roomCode: string;
  onRoomCodeChange: (code: string) => void;
  onConnect: () => void;
}

export const RoomCodeForm: React.FC<RoomCodeFormProps> = ({
  roomCode,
  onRoomCodeChange,
  onConnect,
}) => {
  const canConnect = roomCode.trim() !== '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canConnect) {
      onConnect();
    }
  };

  return (
    <Card data-testid="room-code-form">
      <IconBadge icon={DownloadCloud} className="mx-auto mb-4" iconClassName="motion-safe:animate-float" />
      <h2 className="text-xl font-bold text-center text-text-1 mb-2">Receive files</h2>
      <p className="text-xs text-center text-text-4 mb-6 max-w-sm mx-auto">
        Enter the room code the sender gave you, or paste their link.
      </p>


      <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wider text-text-5 mb-1.5">Room code</span>
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

        <Button data-testid="connect" type="submit" size="lg" disabled={!canConnect} className="w-full py-3">
          <span>Connect</span>
          <ArrowRight className="w-4 h-4" />
        </Button>
      </form>
    </Card>
  );
};
