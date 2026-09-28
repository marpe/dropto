import React, { useState } from 'react';
import { Check, Copy, QrCode, Share2, ShieldAlert, Unlink } from 'lucide-react';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { IconButton } from './ui/IconButton';
import { Notice } from './ui/Notice';
import { QrModal } from './QrModal';
import { SharingSettings } from './SharingSettings';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { getActiveBrand } from '../branding';
import { isAbortError } from '../utils/errors';
import type { SharingOptions } from '../types/sharing';
import { cn } from '../utils/cn';

interface LinkBarProps {
  roomCode: string;
  shareUrl: string;
  /** Why the code changed or the rules tightened (e.g. after repeated wrong PINs) */
  roomNotice: string | null;
  options: SharingOptions;
  onUpdateSharing: (options: SharingOptions, applyTo: 'new' | 'now') => void;
  onStopSharing: () => void;
  /** People downloading, choosing or in line; stopping the share asks first when anyone is */
  connectedCount: number;
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

const TOOL_CLASSES = 'border border-border-2 bg-surface-1';

/**
 * The shared link, where the Share button was: the link with Copy joined to it, then icon tools for the
 * link's settings, the QR code (with the room code, for reading out), the share sheet and stopping the share.
 */
export const LinkBar: React.FC<LinkBarProps> = ({
  roomCode,
  shareUrl,
  roomNotice,
  options,
  onUpdateSharing,
  onStopSharing,
  connectedCount,
}) => {
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isConfirmingStop, setIsConfirmingStop] = useState(false);
  const [isCopied, copyLink] = useCopyToClipboard();
  const isReady = roomCode !== '';

  const requestStopSharing = () => {
    if (connectedCount > 0) {
      setIsConfirmingStop(true);
    } else {
      onStopSharing();
    }
  };

  return (
    <div data-testid="link-bar" className="space-y-3 transition-[opacity,transform] duration-300 starting:opacity-0 starting:translate-y-1">
      {roomNotice && (
        <Notice tone="warning" icon={ShieldAlert}>
          {roomNotice}
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* The whole row on a phone; the tools then wrap underneath */}
        <div className="flex basis-full sm:basis-0 grow min-w-0 rounded-xl border border-border-2 bg-surface-1 overflow-hidden shadow-sm focus-within:border-brand-500/60 transition-colors">
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
            aria-label={isCopied ? 'Copied' : 'Copy link'}
            title={isCopied ? 'Copied' : 'Copy link'}
            className="shrink-0 rounded-none shadow-none hover:shadow-none active:scale-100 px-3.5"
          >
            {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <SharingSettings options={options} connectedCount={connectedCount} onUpdate={onUpdateSharing} className={TOOL_CLASSES} />
          <IconButton title="Show QR code and room code" disabled={!isReady} onClick={() => setIsQrOpen(true)} className={TOOL_CLASSES}>
            <QrCode className="w-4 h-4" />
          </IconButton>
          {canWebShare && (
            <IconButton title="Share" disabled={!isReady} onClick={() => shareLink(shareUrl)} className={TOOL_CLASSES}>
              <Share2 className="w-4 h-4" />
            </IconButton>
          )}
          <IconButton
            data-testid="stop-sharing"
            title="Stop sharing"
            onClick={requestStopSharing}
            className={cn(TOOL_CLASSES, 'hover:text-text-danger-1 hover:bg-surface-danger-1')}
          >
            <Unlink className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      {isQrOpen && <QrModal onClose={() => setIsQrOpen(false)} roomCode={roomCode} url={shareUrl} />}

      {isConfirmingStop && (
        <ConfirmDialog
          title="Stop sharing?"
          confirmLabel="Stop sharing"
          tone="danger"
          onConfirm={() => {
            setIsConfirmingStop(false);
            onStopSharing();
          }}
          onCancel={() => setIsConfirmingStop(false)}
        >
          <p>
            {connectedCount === 1 ? 'Someone is' : `${connectedCount} people are`} connected; their downloads stop. The
            link stops working, and your files stay here to share again.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
};
