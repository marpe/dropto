import React, { useState } from 'react';
import { Check, Copy, Menu as MenuIcon, QrCode, Settings, Share2, ShieldAlert, Unlink } from 'lucide-react';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Menu, MenuItem } from './ui/Menu';
import { Notice } from './ui/Notice';
import { QrModal } from './QrModal';
import { SharingSettings } from './SharingSettings';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { getActiveBrand } from '../branding';
import { isAbortError } from '../utils/errors';
import type { SharingOptions } from '../types/sharing';

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

type OpenDialog = 'settings' | 'qr' | 'stop' | null;

const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

async function shareLink(url: string) {
  try {
    await navigator.share({ title: getActiveBrand().name, url });
  } catch (err) {
    // Closing the share sheet rejects with AbortError; that is the user's choice, not a failure
    if (!isAbortError(err)) {
      console.warn('Web Share failed:', err);
    }
  }
}

/**
 * The shared link, where the Share button was: the link with Copy and a menu joined to it. The menu holds
 * the link's settings, the QR code (with the room code, for reading out), the share sheet and stopping.
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
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const [isCopied, copyLink] = useCopyToClipboard();
  const isReady = roomCode !== '';
  const close = () => setOpenDialog(null);

  const requestStopSharing = () => {
    if (connectedCount > 0) {
      setOpenDialog('stop');
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

      <div className="flex items-stretch h-10 rounded-xl border border-border-2 bg-surface-1 overflow-hidden shadow-sm focus-within:border-brand-500/60 transition-colors">
        <input
          readOnly
          aria-label="Share link"
          value={isReady ? shareUrl : 'Creating link…'}
          className="flex-1 min-w-0 truncate bg-transparent px-3 py-2.5 font-mono text-xs text-text-3 outline-none"
        />
        <Button
          disabled={!isReady}
          onClick={() => copyLink(shareUrl)}
          variant="secondary"
          aria-label={isCopied ? 'Copied' : 'Copy link'}
          title={isCopied ? 'Copied' : 'Copy link'}
          className="shrink-0 rounded-none shadow-none hover:shadow-none active:scale-100 px-3.5"
        >
          {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </Button>
        <Menu title="Link options" icon={MenuIcon} anchorName="--link-menu" triggerClassName="rounded-none border-l border-border-2 px-3">
          <MenuItem data-testid="open-link-settings" icon={Settings} onSelect={() => setOpenDialog('settings')}>
            Settings
          </MenuItem>
          <MenuItem icon={QrCode} disabled={!isReady} onSelect={() => setOpenDialog('qr')}>
            QR code
          </MenuItem>
          {canWebShare && (
            <MenuItem icon={Share2} disabled={!isReady} onSelect={() => shareLink(shareUrl)}>
              Share…
            </MenuItem>
          )}
          <MenuItem data-testid="stop-sharing" icon={Unlink} tone="danger" onSelect={requestStopSharing}>
            Stop sharing
          </MenuItem>
        </Menu>
      </div>

      {openDialog === 'settings' && (
        <SharingSettings options={options} connectedCount={connectedCount} onUpdate={onUpdateSharing} onClose={close} />
      )}
      {openDialog === 'qr' && <QrModal onClose={close} url={shareUrl} />}
      {openDialog === 'stop' && (
        <ConfirmDialog
          title="Stop sharing?"
          confirmLabel="Stop sharing"
          tone="danger"
          onConfirm={() => {
            close();
            onStopSharing();
          }}
          onCancel={close}
        >
          <p>
            {connectedCount === 1 ? 'Someone is' : `${connectedCount} people are`} connected. Their downloads stop and the
            link stops working.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
};
