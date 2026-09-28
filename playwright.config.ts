import { defineConfig, devices } from '@playwright/test';
import { LOCAL_PEER_SERVER_PORT } from './e2e/fixtures';

const isCI = !!process.env.CI;
// Another project's dev server may already hold Vite's default port
const DEV_SERVER_PORT = Number(process.env.E2E_PORT ?? 5173);
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: DEV_SERVER_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Both peers run on this machine: plain host ICE candidates instead of mDNS .local names,
        // whose resolution is slow or flaky (notably on Windows) and made connections intermittently never open
        launchOptions: { args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] },
      },
    },
  ],
  // Signalling runs on a local PeerServer, so tests need no internet and never flake on the public one
  webServer: [
    {
      command: `npm run dev -- --port ${DEV_SERVER_PORT} --strictPort`,
      url: DEV_SERVER_URL,
      reuseExistingServer: !isCI,
    },
    {
      command: `npx peerjs --port ${LOCAL_PEER_SERVER_PORT} --path /`,
      port: LOCAL_PEER_SERVER_PORT,
      reuseExistingServer: !isCI,
    },
  ],
});
