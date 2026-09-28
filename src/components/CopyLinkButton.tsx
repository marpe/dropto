import React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from './ui/Button';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';

interface CopyLinkButtonProps {
  /** Empty until the room is open */
  shareUrl: string;
  /** Called first on every click, e.g. to create the link if it is not out yet */
  onBeforeCopy: () => void;
}

/** Shares by copying: the first click creates the link, and every click copies it again. */
export const CopyLinkButton: React.FC<CopyLinkButtonProps> = ({ shareUrl, onBeforeCopy }) => {
  const [isCopied, copy] = useCopyToClipboard();

  return (
    <Button
      data-testid="copy-link"
      disabled={!shareUrl}
      onClick={() => {
        onBeforeCopy();
        void copy(shareUrl);
      }}
      className="w-full h-10 py-0"
    >
      {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      <span>{!shareUrl ? 'Creating link…' : isCopied ? 'Copied' : 'Copy link'}</span>
    </Button>
  );
};
