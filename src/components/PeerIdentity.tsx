import React from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { BrowserIcon } from './ui/BrowserIcon';
import { StatusDot } from './ui/StatusDot';
import type { Presence } from './ui/StatusDot';
import type { PeerDetails } from '../types/sharing';
import type { FormFactor } from '../types/transfer';
import { describePeer } from '../utils/deviceInfo';

const FORM_FACTORS: Record<FormFactor, { Icon: typeof Monitor; label: string }> = {
  phone: { Icon: Smartphone, label: 'Phone' },
  tablet: { Icon: Tablet, label: 'Tablet' },
  desktop: { Icon: Monitor, label: 'Computer' },
};

interface PeerIdentityProps {
  details: PeerDetails;
  /** Whether they are still there, as a dot on the browser logo */
  presence: Presence;
  /** What they are doing, at the end of the first line */
  status?: React.ReactNode;
}

/**
 * Who someone on the link is: browser, system and model, then what kind of device it is, their address,
 * place and route once known, and a warning when their browser keeps downloads in memory.
 */
export const PeerIdentity: React.FC<PeerIdentityProps> = ({ details, presence, status }) => {
  const { browser, name, meta } = describePeer(details);
  const formFactor = details.formFactor ? FORM_FACTORS[details.formFactor] : null;
  const hasSecondLine = meta || formFactor || details.storage === 'memory';
  return (
    <div className="flex-1 min-w-0 space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-text-2">
          <span className="relative inline-flex shrink-0">
            <BrowserIcon browser={browser} className="text-text-4" />
            <StatusDot presence={presence} className="absolute -right-1 -bottom-1 rounded-full ring-2 ring-surface-1" />
          </span>
          <span className="truncate">
            {browser && `${browser} on `}
            {name}
          </span>
        </span>
        {status}
      </div>
      {hasSecondLine && (
        <p className="flex min-w-0 items-center gap-1.5 text-2xs text-text-5 tabular-nums">
          {formFactor && (
            <formFactor.Icon className="w-3 h-3 shrink-0" role="img" aria-label={formFactor.label}>
              <title>{formFactor.label}</title>
            </formFactor.Icon>
          )}
          {meta && <span className="truncate">{meta}</span>}
          {/* Firefox and Safari hold a download in memory until it is done, so very large files can fail */}
          {details.storage === 'memory' && (
            <span className="shrink-0 text-text-warning-1" title="Very large files may not fit">
              {meta ? '· ' : ''}Saves to memory
            </span>
          )}
        </p>
      )}
    </div>
  );
};
