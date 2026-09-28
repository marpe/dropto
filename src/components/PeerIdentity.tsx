import React from 'react';
import { BrowserIcon } from './ui/BrowserIcon';
import { OsIcon } from './ui/OsIcon';
import { StatusDot } from './ui/StatusDot';
import type { Presence } from './ui/StatusDot';
import type { PeerDetails } from '../types/sharing';
import { describePeer } from '../utils/deviceInfo';

interface PeerIdentityProps {
  details: PeerDetails;
  /** Whether they are still there, as a dot in front of what they are doing */
  presence: Presence;
  /** What they are doing, at the end of the first line */
  status?: React.ReactNode;
  /** More about them at the end of the second line, e.g. how much they have received */
  detail?: React.ReactNode;
}

/**
 * Who someone on the link is: their system (logo, name and model) and whether they are still there, then their
 * browser, address, place and route once known, and a warning when their browser keeps downloads in memory.
 */
export const PeerIdentity: React.FC<PeerIdentityProps> = ({ details, presence, status, detail }) => {
  const { browser, system, name, meta } = describePeer(details);
  return (
    <div className="flex-1 min-w-0 space-y-0.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-text-2">
          <OsIcon system={system} formFactor={details.formFactor} className="text-text-3" />
          <span className="truncate">{name}</span> User
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-4 tabular-nums">
          <StatusDot presence={presence} />
          {status}
        </span>
      </div>
      <p className="flex min-w-0 items-center gap-1.5 text-2xs text-text-5 tabular-nums">
        {browser && (
          <>
            <BrowserIcon browser={browser} className="w-3 h-3 text-text-5" />
            <span className="shrink-0">{browser}</span>
          </>
        )}
        {browser && meta && <span aria-hidden>·</span>}
        {meta && <span className="truncate">{meta}</span>}
        {/* Firefox and Safari hold a download in memory until it is done, so very large files can fail */}
        {details.storage === 'memory' && (
          <>
            {(browser || meta) && <span aria-hidden>·</span>}
            <span className="shrink-0 text-text-warning-1" title="Very large files may not fit">
              Saves to memory
            </span>
          </>
        )}
        {detail && <span className="ml-auto shrink-0 pl-2">{detail}</span>}
      </p>
    </div>
  );
};
