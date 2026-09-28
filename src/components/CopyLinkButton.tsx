import React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from './ui/Button';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';

interface CopyLinkButtonProps {
  /** Empty until the room is open */
  shareUrl: string;
  /** The room could not be opened (Retry is offered beside the error), so no link is on its way */
  hasFailed?: boolean;
  /** Called first on every click, e.g. to create the link if it is not out yet */
  onBeforeCopy: () => void;
}

/** Shares by copying: the first click creates the link, and every click copies it again. */
export const CopyLinkButton: React.FC<CopyLinkButtonProps> = ({ shareUrl, hasFailed = false, onBeforeCopy }) => {
  const [isCopied, copy] = useCopyToClipboard();
  const label = !shareUrl && !hasFailed ? 'Creating link…' : isCopied ? 'Copied' : 'Copy link';

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
      <span>{label}</span>
    </Button>
  );
};
