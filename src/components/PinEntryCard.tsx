import React from 'react';
import { Lock } from 'lucide-react';
import { Button } from './ui/Button';
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
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl bg-white dark:bg-supabase-surface border border-zinc-200 dark:border-zinc-800 p-8 shadow-xl text-center"
    >
      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-500 flex items-center justify-center">
        <Lock className="w-8 h-8" />
      </div>
      <h3 className="text-xl font-bold text-balance text-zinc-900 dark:text-white mb-2">This Transfer Is PIN-Protected</h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6 max-w-sm mx-auto">
        Ask the sender for the session PIN to see and download the files.
      </p>

      {prompt.isIncorrect && (
        <p className="mb-4 text-xs font-semibold text-red-500">
          Incorrect PIN. {prompt.attemptsLeft} {prompt.attemptsLeft === 1 ? 'attempt' : 'attempts'} left.
        </p>
      )}

      <div className="max-w-xs mx-auto space-y-4">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          placeholder="Session PIN…"
          value={pin}
          onChange={(e) => onPinChange(e.target.value)}
          className="w-full text-center font-mono text-xl tracking-widest py-3 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-white focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 focus:outline-none"
        />
        <Button type="submit" size="lg" disabled={!pin} className="w-full motion-safe:hover:scale-[1.02]">
          Unlock Files
        </Button>
      </div>
    </form>
  );
};
