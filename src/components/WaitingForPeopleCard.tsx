import React from 'react';
import { Radio } from 'lucide-react';
import { Card } from './ui/Card';
import { IconBadge } from './ui/IconBadge';

// Negative delays start every ring mid-cycle, so all three are spread out from the first frame. Inline, because
// the `animation` shorthand behind animate-sonar resets any animation-delay set by a class
const RING_DELAYS = ['0s', '-0.8s', '-1.6s'];

/** Stands in for the people list while the link is shared and nobody has opened it yet */
export const WaitingForPeopleCard: React.FC = () => (
  <Card padding="sm" role="status" data-testid="waiting-for-people">
    <div className="flex flex-col items-center gap-3 text-center">
      <div aria-hidden className="relative flex h-20 w-20 items-center justify-center">
        {RING_DELAYS.map((delay) => (
          <span
            key={delay}
            style={{ animationDelay: delay }}
            className="absolute inset-5 hidden rounded-full border border-brand-500/80 motion-safe:block motion-safe:animate-sonar"
          />
        ))}
        <IconBadge icon={Radio} size="md" />
      </div>
      <div>
        <p className="text-sm font-medium text-text-2">Waiting for connections</p>
        <p className="mt-0.5 text-xs text-text-4">People who open the link show up here.</p>
      </div>
    </div>
  </Card>
);
