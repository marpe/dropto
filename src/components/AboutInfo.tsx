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
      <a
        href={`${REPOSITORY_URL}/commit/${buildInfo.commit}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono hover:text-brand-500 transition-colors"
      >
        #{buildInfo.commit}
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

/** Build stamp and repository link, shown in the settings dialog. */
export const AboutInfo: React.FC<{ buildInfo?: BuildInfo }> = ({ buildInfo = BUILD_INFO }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
    <span>
      {getActiveBrand().name} · <BuildStamp buildInfo={buildInfo} />
    </span>
    <a
      href={REPOSITORY_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 hover:text-brand-500 transition-colors"
    >
      <GitHubIcon className="w-4 h-4" />
      <span>GitHub</span>
    </a>
  </div>
);
