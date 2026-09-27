import React from 'react';
import { GitHubIcon } from './ui/GitHubIcon';
import { REPOSITORY_URL } from '../constants';
import { getActiveBrand } from '../branding';
import { BUILD_INFO } from '../buildInfo';
import type { BuildInfo } from '../buildInfo';

const KNOWN_LOCAL_BUILDS = new Set(['dev', 'unknown']);

const BuildStamp: React.FC<{ buildInfo: BuildInfo }> = ({ buildInfo }) => {
  if (KNOWN_LOCAL_BUILDS.has(buildInfo.commit)) {
    return <span>{buildInfo.commit} build</span>;
  }
  return (
    <span className="tabular-nums">
      Build{' '}
      <a
        href={`${REPOSITORY_URL}/commit/${buildInfo.commit}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono hover:text-brand-500 transition-colors"
      >
        {buildInfo.commit}
      </a>
      {buildInfo.builtAtIso && (
        <>
          {' · '}
          <time dateTime={buildInfo.builtAtIso}>
            {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
              new Date(buildInfo.builtAtIso)
            )}
          </time>
        </>
      )}
    </span>
  );
};

export const Footer: React.FC<{ buildInfo?: BuildInfo }> = ({ buildInfo = BUILD_INFO }) => (
  <footer className="w-full max-w-3xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800/80">
    <div>{getActiveBrand().name} • Browser-only WebRTC P2P Transfer • Files never touch an intermediate server</div>
    <div className="flex items-center gap-4">
      <BuildStamp buildInfo={buildInfo} />
      <a
        href={REPOSITORY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 hover:text-brand-500 transition-colors"
      >
        <GitHubIcon className="w-4 h-4" />
        <span>GitHub (marpe/send)</span>
      </a>
    </div>
  </footer>
);
