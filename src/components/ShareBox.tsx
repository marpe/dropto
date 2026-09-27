import React, { useState } from 'react';
import { QrCode, Copy, Check, Share2, ShieldAlert } from 'lucide-react';
import { Button } from './ui/Button';
import { Notice } from './ui/Notice';
import { QrModal } from './QrModal';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { getActiveBrand } from '../branding';
import { isAbortError } from '../utils/errors';

interface ShareBoxProps {
  roomCode: string;
  shareUrl: string;
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

/** The created link: room code, copy/share actions and the QR code. */
export const ShareBox: React.FC<ShareBoxProps> = ({ roomCode, shareUrl, notice = null }) => {
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [copiedLink, copyLink] = useCopyToClipboard();
  const [copiedCode, copyCode] = useCopyToClipboard();

  return (
    <div className="space-y-4">
      {isQrOpen && <QrModal onClose={() => setIsQrOpen(false)} roomCode={roomCode} url={shareUrl} />}

      {notice && (
        <Notice tone="warning" icon={ShieldAlert}>
          {notice}
        </Notice>
      )}

      <div className="flex flex-col sm:flex-row items-center gap-3 p-3 bg-surface-2 rounded-2xl border border-border-2">
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <span className="text-2xs uppercase font-bold tracking-wider text-text-5 block">Room Code</span>
          <span className="font-mono text-2xl font-black tracking-widest text-brand-500">
            {roomCode || 'Generating…'}
          </span>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" size="sm" disabled={!roomCode} onClick={() => copyCode(roomCode)}>
            {copiedCode ? <Check className="w-3.5 h-3.5 text-brand-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
          </Button>
          <Button variant="secondary" size="sm" disabled={!roomCode} onClick={() => setIsQrOpen(true)}>
            <QrCode className="w-3.5 h-3.5" />
            <span>QR</span>
          </Button>
          <Button size="sm" disabled={!roomCode} onClick={() => copyLink(shareUrl)}>
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
          </Button>
          {canWebShare && (
            <Button size="sm" disabled={!roomCode} onClick={() => shareLink(shareUrl)}>
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
