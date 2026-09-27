declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

export interface BuildInfo {
  commit: string;
  builtAtIso: string | null;
}

/** Injected by vite.config.ts `define`; absent under Vitest, which doesn't load that config. */
export const BUILD_INFO: BuildInfo = {
  commit: typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'dev',
  builtAtIso: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : null,
};
