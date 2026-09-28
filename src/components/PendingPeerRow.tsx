import React from 'react';
import { Check, X } from 'lucide-react';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { PeerIdentity } from './PeerIdentity';
import type { PendingPeer } from '../types/sharing';

interface PendingPeerRowProps {
  peer: PendingPeer;
  /** Shown for someone with the link, who is let in without asking once files are shared */
  waitingFor: string;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Someone connected but not let in yet, listed with the people already in: asking to connect (no link key,
 * or approval required), or holding the link and waiting until there are shared files to show them.
 */
export const PendingPeerRow: React.FC<PendingPeerRowProps> = ({ peer, waitingFor, onAccept, onDecline }) => (
  <li
    data-testid="pending-peer"
    className="flex items-center gap-3 py-2.5 transition-[opacity,transform] duration-300 starting:opacity-0 starting:translate-y-1"
  >
    {/* The pulsing dot already says they are not in yet; asking needs no words beside the buttons */}
    <PeerIdentity
      details={peer.details}
      presence="waiting"
      status={peer.isTrusted && waitingFor}
    />
    {!peer.isTrusted && (
      <div className="flex shrink-0 items-center gap-1">
        <IconButton
          data-testid="reject-peer"
          title="Decline"
          aria-label="Decline"
          size="sm"
          onClick={onDecline}
          className="hover:text-text-danger-1"
        >
          <X className="w-4 h-4" />
        </IconButton>
        <Button data-testid="approve-peer" variant="secondary" size="sm" onClick={onAccept}>
          <Check className="w-3.5 h-3.5 text-brand-500" />
          <span>Accept</span>
        </Button>
      </div>
    )}
  </li>
);
