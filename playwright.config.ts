import { defineConfig, devices } from '@playwright/test';
import { LOCAL_PEER_SERVER_PORT } from './e2e/fixtures';

const isCI = !!process.env.CI;

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
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Signalling runs on a local PeerServer, so tests need no internet and never flake on the public one
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
    },
    {
      command: `npx peerjs --port ${LOCAL_PEER_SERVER_PORT} --path /`,
      port: LOCAL_PEER_SERVER_PORT,
      reuseExistingServer: !isCI,
    },
  ],
});
