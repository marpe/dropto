import React, { useState } from 'react';
import { QrCode, Copy, Check, Lock, Share2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { TextInput } from './ui/TextInput';
import { QrModal } from './QrModal';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { getActiveBrand } from '../branding';

interface ShareBoxProps {
  roomCode: string;
  shareUrl: string;
  pin: string;
  onPinChange: (pin: string) => void;
  errorMessage: string | null;
  onRetryRoom: () => void;
}

const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

async function shareLink(url: string) {
  try {
    await navigator.share({ title: getActiveBrand().name, text: 'Files for you', url });
  } catch (err) {
    // Closing the share sheet rejects with AbortError; that is the user's choice, not a failure
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      console.warn('Web Share failed:', err);
    }
  }
}

export const ShareBox: React.FC<ShareBoxProps> = ({
  roomCode,
  shareUrl,
  pin,
  onPinChange,
  errorMessage,
  onRetryRoom,
}) => {
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [copiedLink, copyLink] = useCopyToClipboard();
  const [copiedCode, copyCode] = useCopyToClipboard();

  return (
    <Card padding="md">
      {isQrOpen && <QrModal onClose={() => setIsQrOpen(false)} roomCode={roomCode} url={shareUrl} />}

      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h4 className="font-bold text-zinc-900 dark:text-white">Share with Receiver</h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            People with the link connect without asking. Someone typing the code in needs your approval.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!roomCode}
          onClick={() => setIsQrOpen(true)}
          className="shrink-0 bg-brand-500/10 dark:bg-brand-500/10 text-brand-500 dark:text-brand-500 hover:bg-brand-500/20 dark:hover:bg-brand-500/20"
        >
          <QrCode className="w-4 h-4" />
          <span>Show QR</span>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900/80 rounded-2xl border border-zinc-200 dark:border-zinc-800 mb-4">
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <span className="text-2xs uppercase font-bold tracking-wider text-zinc-400 block">Room Code</span>
          {!roomCode && errorMessage ? (
            <div className="flex items-center justify-center sm:justify-start gap-3">
              <span className="text-sm text-red-500 break-words min-w-0">{errorMessage}</span>
              <Button variant="secondary" size="sm" onClick={onRetryRoom} className="shrink-0">
                Retry
              </Button>
            </div>
          ) : (
            <span className="font-mono text-2xl font-black tracking-widest text-brand-500">
              {roomCode || 'Generating…'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!roomCode}
            onClick={() => copyCode(roomCode)}
            className="px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-brand-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
          </Button>
          <Button size="sm" disabled={!roomCode} onClick={() => copyLink(shareUrl)} className="px-4 py-2 shadow-sm">
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
          </Button>
          {canWebShare && (
            <Button size="sm" disabled={!roomCode} onClick={() => shareLink(shareUrl)} className="px-4 py-2 shadow-sm">
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <Lock className="w-4 h-4 shrink-0 text-zinc-400" />
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Require PIN (optional)</span>
        </div>
        <TextInput
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          placeholder="e.g. 1234"
          value={pin}
          onChange={(e) => onPinChange(e.target.value)}
          className="w-24 text-center font-mono bg-zinc-50"
        />
      </div>
    </Card>
  );
};
