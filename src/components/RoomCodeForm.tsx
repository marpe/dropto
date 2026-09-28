import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { SectionLabel } from './ui/SectionLabel';
import { TextInput } from './ui/TextInput';
import { BRAND } from '../branding';

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
      {/* The app bar already says Receive files */}
      <p className="text-sm sm:text-xs text-text-4 mb-4">
        Enter the room code the sender gave you, or paste their link.
      </p>


      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <SectionLabel className="mb-1.5">Room code</SectionLabel>
          <TextInput
            size="lg"
            autoComplete="off"
            spellCheck={false}
            placeholder={`${BRAND.roomPrefix}-XXXXXX`}
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
