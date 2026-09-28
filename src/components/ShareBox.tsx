import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Copy, Check, Share2, ShieldAlert } from 'lucide-react';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Notice } from './ui/Notice';
import { QrModal } from './QrModal';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { getActiveBrand } from '../branding';
import { isAbortError } from '../utils/errors';

interface ShareBoxProps {
  roomCode: string;
  shareUrl: string;
  /** Why the code changed or the rules tightened (e.g. after repeated wrong PINs) */
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

/** The created link with Copy joined to it; below, the room code (for reading out), the share sheet and the QR code. */
export const ShareBox: React.FC<ShareBoxProps> = ({ roomCode, shareUrl, notice = null }) => {
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [copiedLink, copyLink] = useCopyToClipboard();
  const [copiedCode, copyCode] = useCopyToClipboard();
  const isReady = roomCode !== '';

  return (
    <div className="space-y-3">
      {isQrOpen && <QrModal onClose={() => setIsQrOpen(false)} roomCode={roomCode} url={shareUrl} />}

      {notice && (
        <Notice tone="warning" icon={ShieldAlert}>
          {notice}
        </Notice>
      )}

      <div className="flex rounded-xl border border-border-2 bg-surface-2 overflow-hidden focus-within:border-brand-500/60 transition-colors">
        <input
          readOnly
          aria-label="Share link"
          value={isReady ? shareUrl : 'Creating link…'}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 truncate bg-transparent px-3 py-2.5 font-mono text-xs text-text-3 outline-none"
        />
        <Button
          disabled={!isReady}
          onClick={() => copyLink(shareUrl)}
          aria-label={copiedLink ? 'Copied' : 'Copy link'}
          title={copiedLink ? 'Copied' : 'Copy link'}
          className="shrink-0 rounded-none shadow-none hover:shadow-none active:scale-100 px-3.5"
        >
          {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-surface-2 border border-border-1 pl-2.5 pr-0.5 py-0.5 text-xs">
          <span className="text-text-5">Code</span>
          <span data-testid="room-code" className="font-mono font-bold tracking-widest text-brand-500 px-1">
            {roomCode || '…'}
          </span>
          <IconButton title={copiedCode ? 'Copied' : 'Copy code'} size="sm" disabled={!isReady} onClick={() => copyCode(roomCode)}>
            {copiedCode ? <Check className="w-3.5 h-3.5 text-brand-500" /> : <Copy className="w-3.5 h-3.5" />}
          </IconButton>
        </div>

        <div className="flex items-center gap-2">
          {canWebShare && (
            <IconButton title="Share" disabled={!isReady} onClick={() => shareLink(shareUrl)} className="border border-border-2">
              <Share2 className="w-4 h-4" />
            </IconButton>
          )}
          <IconButton
            title="Show QR code"
            disabled={!isReady}
            onClick={() => setIsQrOpen(true)}
            className="border border-border-2 sm:hidden"
          >
            <QrCode className="w-4 h-4" />
          </IconButton>
          {isReady && (
            <button
              type="button"
              title="Enlarge QR code"
              onClick={() => setIsQrOpen(true)}
              // QR codes need dark modules on white in both themes to scan reliably
              className="hidden sm:block p-1.5 bg-white rounded-lg transition-transform motion-safe:hover:scale-105 motion-safe:animate-pop-in"
            >
              <QRCodeSVG value={shareUrl} size={64} level="M" fgColor="#121212" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
