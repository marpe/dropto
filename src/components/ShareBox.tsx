import React, { useState } from 'react';
import { QrCode, Copy, Check, Lock, Share2, ShieldAlert } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Notice } from './ui/Notice';
import { TextInput } from './ui/TextInput';
import { QrModal } from './QrModal';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { getActiveBrand } from '../branding';
import { isAbortError } from '../utils/errors';

interface ShareBoxProps {
  roomCode: string;
  shareUrl: string;
  pin: string;
  onPinChange: (pin: string) => void;
  errorMessage: string | null;
  onRetryRoom: () => void;
  /** Why the code changed (e.g. after repeated wrong PINs) */
  notice?: string | null;
}

const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

async function shareLink(url: string) {
  try {
    await navigator.share({ title: getActiveBrand().name, text: 'Files for you', url });
  } catch (err) {
    // Closing the share sheet rejects with AbortError; that is the user's choice, not a failure
    if (!isAbortError(err)) {
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
  notice = null,
}) => {
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [copiedLink, copyLink] = useCopyToClipboard();
  const [copiedCode, copyCode] = useCopyToClipboard();

  return (
    <Card padding="md">
      {isQrOpen && <QrModal onClose={() => setIsQrOpen(false)} roomCode={roomCode} url={shareUrl} />}

      {notice && (
        <Notice tone="warning" icon={ShieldAlert} className="mb-4">
          {notice}
        </Notice>
      )}

      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h4 className="font-bold text-text-1">Share with Receiver</h4>
          <p className="text-xs text-text-4">
            People with the link connect without asking. Someone typing the code in needs your approval.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!roomCode}
          onClick={() => setIsQrOpen(true)}
          className="shrink-0 bg-brand-500/10 text-brand-500 hover:bg-brand-500/20"
        >
          <QrCode className="w-4 h-4" />
          <span>Show QR</span>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3 p-3 bg-surface-2 rounded-2xl border border-border-2 mb-4">
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <span className="text-2xs uppercase font-bold tracking-wider text-text-5 block">Room Code</span>
          {!roomCode && errorMessage ? (
            <div className="flex items-center justify-center sm:justify-start gap-3">
              <span className="text-sm text-text-danger-1 wrap-break-word min-w-0">{errorMessage}</span>
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
            className="px-4 py-2 bg-surface-1 border border-border-3 shadow-xs"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-brand-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
          </Button>
          <Button size="sm" disabled={!roomCode} onClick={() => copyLink(shareUrl)} className="px-4 py-2 shadow-xs">
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
          </Button>
          {canWebShare && (
            <Button size="sm" disabled={!roomCode} onClick={() => shareLink(shareUrl)} className="px-4 py-2 shadow-xs">
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border-1">
        <div className="flex items-center gap-2 min-w-0">
          <Lock className="w-4 h-4 shrink-0 text-text-5" />
          <span className="text-xs font-medium text-text-4">Require PIN (optional)</span>
        </div>
        <TextInput
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          placeholder="e.g. 1234"
          value={pin}
          onChange={(e) => onPinChange(e.target.value)}
          className="w-24 text-center font-mono bg-surface-2"
        />
      </div>
    </Card>
  );
};
