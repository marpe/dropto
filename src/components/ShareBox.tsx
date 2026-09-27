import React, { useState } from 'react';
import { QrCode, Copy, Check, Share2, ShieldAlert } from 'lucide-react';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { LinkButton } from './ui/LinkButton';
import { Notice } from './ui/Notice';
import { QRCodeSVG } from 'qrcode.react';
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

/** The created link: copying it is the main action; share sheet, QR and the spoken room code are the fallbacks. */
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

      <div className="flex gap-4 p-3 bg-surface-2 rounded-2xl border border-border-2">
        <div className="flex-1 min-w-0 space-y-3">
          <input
            readOnly
            aria-label="Share link"
            value={isReady ? shareUrl : 'Creating link…'}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full min-w-0 truncate rounded-lg bg-surface-1 border border-border-1 px-3 py-2 font-mono text-xs text-text-3"
          />
          <div className="flex gap-2">
            <Button disabled={!isReady} onClick={() => copyLink(shareUrl)} className="flex-1">
              {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'Copied' : 'Copy link'}</span>
            </Button>
            {canWebShare && (
              <IconButton title="Share" disabled={!isReady} onClick={() => shareLink(shareUrl)} className="border border-border-2">
                <Share2 className="w-5 h-5" />
              </IconButton>
            )}
            {/* On wider screens the code is already on show beside the link */}
            <IconButton
              title="Show QR code"
              disabled={!isReady}
              onClick={() => setIsQrOpen(true)}
              className="border border-border-2 sm:hidden"
            >
              <QrCode className="w-5 h-5" />
            </IconButton>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-4">
            <span>
              Or read out the code{' '}
              <span data-testid="room-code" className="font-mono font-bold tracking-widest text-brand-500">
                {roomCode || '…'}
              </span>
            </span>
            <LinkButton disabled={!isReady} onClick={() => copyCode(roomCode)} className="text-xs">
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCode ? 'Copied' : 'Copy code'}
            </LinkButton>
          </div>
        </div>
        {isReady && (
          <button
            type="button"
            title="Enlarge QR code"
            onClick={() => setIsQrOpen(true)}
            // QR codes need dark modules on white in both themes to scan reliably
            className="hidden sm:block shrink-0 self-center p-2 bg-white rounded-xl transition-transform motion-safe:hover:scale-105 motion-safe:animate-pop-in"
          >
            <QRCodeSVG value={shareUrl} size={104} level="M" fgColor="#121212" />
          </button>
        )}
      </div>
    </div>
  );
};
