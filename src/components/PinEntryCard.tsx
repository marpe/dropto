import React from 'react';
import { Lock } from 'lucide-react';
import { Button } from './ui/Button';
import { IconBadge } from './ui/IconBadge';
import { StatusCard } from './ui/StatusCard';
import { TextInput } from './ui/TextInput';
import type { PinPrompt } from '../types/transfer';

interface PinEntryCardProps {
  pin: string;
  prompt: PinPrompt;
  onPinChange: (pin: string) => void;
  onSubmit: () => void;
}

export const PinEntryCard: React.FC<PinEntryCardProps> = ({ pin, prompt, onPinChange, onSubmit }) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <StatusCard
      badge={<IconBadge icon={Lock} />}
      title="This Transfer Is PIN-Protected"
      description="Ask the sender for the session PIN to see and download the files."
    >
      {prompt.isIncorrect && (
        <p className="mb-4 text-xs font-semibold text-red-500">
          Incorrect PIN. {prompt.attemptsLeft} {prompt.attemptsLeft === 1 ? 'attempt' : 'attempts'} left.
        </p>
      )}

      <form onSubmit={handleSubmit} className="max-w-xs mx-auto space-y-4">
        <TextInput
          size="lg"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          placeholder="Session PIN…"
          value={pin}
          onChange={(e) => onPinChange(e.target.value)}
        />
        <Button type="submit" size="lg" disabled={!pin} className="w-full motion-safe:hover:scale-[1.02]">
          Unlock
        </Button>
      </form>
    </StatusCard>
  );
};
