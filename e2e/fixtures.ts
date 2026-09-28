import { test as base, expect } from '@playwright/test';
import type { Browser, BrowserContext, BrowserContextOptions } from '@playwright/test';

export const LOCAL_PEER_SERVER_PORT = 9000;

/** Saved app settings (see useSettings) pointing signalling at the local PeerServer started by Playwright. */
const LOCAL_SIGNALING_SETTINGS = {
  useCustomSignaling: true,
  signalingHost: 'localhost',
  signalingPort: LOCAL_PEER_SERVER_PORT,
  signalingPath: '/',
  signalingSecure: false,
};

// Must match STORAGE_KEY in src/hooks/useSettings.ts
const SETTINGS_STORAGE_KEY = 'dropto_settings';

async function applyLocalSignaling(context: BrowserContext) {
  await context.addInitScript(
    ({ key, settings }) => {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify(settings));
      }
    },
    { key: SETTINGS_STORAGE_KEY, settings: LOCAL_SIGNALING_SETTINGS }
  );
}

/** A fresh browser context that signals through the local PeerServer instead of the public one. */
export async function newLocalContext(browser: Browser, options: BrowserContextOptions = {}) {
  const context = await browser.newContext(options);
  await applyLocalSignaling(context);
  return context;
}

/** Playwright's `test`, with the default page's context also on the local PeerServer. */
export const test = base.extend({
  context: async ({ context }, provide) => {
    await applyLocalSignaling(context);
    await provide(context);
  },
});

export { expect };
