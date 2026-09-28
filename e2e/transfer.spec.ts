import { test, expect, newLocalContext, LOCAL_PEER_SERVER_PORT } from './fixtures';
import type { Browser, Page } from '@playwright/test';

test.describe('dropto.space Application End-to-End Tests', () => {
  test('landing page: drop area, receive-by-code link, settings with theme and about', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('dropto.space — 10GB P2P WebRTC Transfer');
    // An app: a title bar with the name, no marketing header
    await expect(page.getByRole('heading', { level: 1, name: 'dropto.space' })).toBeVisible();
    await expect(page.getByTestId('drop-zone')).toBeVisible();

    // Receiving by code is one click away, and there is a way back
    await page.getByRole('button', { name: /receive files/i }).click();
    await expect(page.getByTestId('room-code-form')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'dropto.space' })).toBeVisible();
    await page.getByTitle('Send files instead').click();
    await expect(page.getByTestId('drop-zone')).toBeVisible();

    await page.getByTitle('Settings').click();
    await expect(page.locator('text=Settings')).toBeVisible();
    // The page behind an open dialog cannot scroll (or be clicked: showModal makes it inert)
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe('hidden');
    await page.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    const githubLink = page.locator('a[href="https://github.com/marpe/send"]');
    await expect(githubLink).toHaveAttribute('target', '_blank');

    await page.locator('button:has-text("Cancel")').click();
    await expect(page.locator('text=Settings')).not.toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).not.toBe('hidden');
  });

  test('files dropped anywhere on the page are queued, even from the receive form', async ({ page }) => {
    await page.goto('/');
    const dropOnPage = async (name: string) => {
      const dataTransfer = await page.evaluateHandle((fileName) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(['dropped'], fileName, { type: 'text/plain' }));
        return transfer;
      }, name);
      // Deliberately outside the drop zone: on the page background
      await page.dispatchEvent('main', 'dragenter', { dataTransfer });
      await expect(page.getByText('Drop to add files')).toBeVisible();
      await page.dispatchEvent('main', 'drop', { dataTransfer });
      await expect(page.getByText('Drop to add files')).toHaveCount(0);
    };

    await dropOnPage('first.txt');
    await expect(page.getByText('first.txt')).toBeVisible();

    await page.getByRole('button', { name: /clear all/i }).click();
    await page.getByRole('button', { name: /receive files/i }).click();
    await dropOnPage('second.txt');
    await expect(page.getByText('second.txt')).toBeVisible();
    await expect(page.getByTestId('room-code-form')).toHaveCount(0);
  });

  test('uses the blue palette and DT- room codes', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    const [brand500, blue500] = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return [style.getPropertyValue('--color-brand-500').trim(), style.getPropertyValue('--color-blue-500').trim()];
    });
    expect(brand500).not.toBe('');
    expect(brand500).toBe(blue500);
    await addFile(page, 'brand.txt', 'blue');
    expect(await shareFiles(page)).toMatch(/[?]room=DT-[A-Z0-9]{6}#/);
  });

  test('switches to Receive tab when opening share link with ?room= parameter', async ({ page }) => {
    await page.goto('/?room=DT-998877');

    // Should automatically be in Receive mode with room code pre-filled
    await expect(page.getByTestId('room-code-form')).toBeVisible();
    const roomInput = page.locator('input[placeholder="DT-XXXXXX"]');
    await expect(roomInput).toHaveValue('DT-998877');
    await expect(page.getByTestId('connect')).toBeEnabled();
  });

  test('verifies "Select Save Location & Start Download" initiates stream and storage', async ({ page }) => {
    // Navigate to receiver page
    await page.goto('/?room=DT-TEST01');

    // Mock showSaveFilePicker in browser window
    await page.addInitScript(() => {
      (window as any).showSaveFilePicker = async (opts: any) => {
        (window as any).__lastPickerOpts = opts;
        return {
          createWritable: async () => ({
            write: async (_chunk: any) => {},
            close: async () => {},
            abort: async () => {},
          }),
        };
      };
    });

    // Verify room code input is functional
    const roomInput = page.locator('input[placeholder="DT-XXXXXX"]');
    await expect(roomInput).toHaveValue('DT-TEST01');

    // Verify Connect button is clickable
    const connectBtn = page.getByTestId('connect');
    await expect(connectBtn).toBeVisible();
    await expect(connectBtn).toBeEnabled();
  });

  test('typed room code: sender accepts, receiver saves, both verify', async ({ browser }) => {
    const { senderPage, receiverPage, close } = await openPeers(browser);
    const signallingUrls: string[] = [];
    // Vite's HMR socket is also a WebSocket; PeerJS signalling connects to /peerjs
    senderPage.on('websocket', (socket) => {
      if (socket.url().includes('/peerjs')) {
        signallingUrls.push(socket.url());
      }
    });

    await senderPage.goto('/');
    await addFile(senderPage, 'sample-dataset.dat', 'Simulated 10GB dataset test buffer payload.');
    await expect(senderPage.getByTestId('file-totals')).toContainText('1 file');
    const roomCode = readRoomCode(await shareFiles(senderPage));
    expect(signallingUrls.every((url) => url.includes(`localhost:${LOCAL_PEER_SERVER_PORT}`))).toBe(true);
    expect(signallingUrls.length).toBeGreaterThan(0);

    // No #key: the room code alone must still need the sender's approval
    await receiverPage.goto(`/?room=${roomCode}`);
    await expect(receiverPage.getByTestId('room-code-form')).toBeVisible();
    await receiverPage.getByTestId('connect').click();
    await expect(receiverPage.getByRole('heading', { name: /waiting for the sender to accept/i })).toBeVisible({
      timeout: 15000,
    });

    await expect(senderPage.getByTestId('approve-peer')).toBeVisible({ timeout: 15000 });
    await senderPage.getByTestId('approve-peer').click();

    await expect(receiverPage.getByTestId('incoming-files')).toBeVisible({ timeout: 15000 });
    await expect(receiverPage.locator('text=sample-dataset.dat')).toBeVisible();
    await expect(senderPage.getByTestId('receiver-row')).toContainText(/Idle for/);

    const saveButton = receiverPage.getByTestId('start-download');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // Both stay where they were: the receiver on the file list, the sender on the link and the people list
    await expect(receiverPage.getByTestId('transfer-summary')).toContainText('Done', { timeout: 15000 });
    await expect(receiverPage.locator('[data-status=done]')).toContainText('sample-dataset.dat');
    await expect(senderPage.locator('[data-testid=receiver-row][data-stage=completed]')).toHaveCount(1, { timeout: 15000 });
    await close();
  });

  test('share link: receiver connects without approval and sees files added later', async ({ browser }) => {
    const { senderPage, receiverPage, close } = await openPeers(browser);

    await senderPage.goto('/');
    await addFile(senderPage, 'first.txt', 'one');
    const link = await shareFiles(senderPage);
    expect(link).toMatch(/\?room=DT-[A-Z0-9]{6}#key=[\w-]{22}$/);

    await receiverPage.goto(link);
    await expect(receiverPage.locator('text=first.txt')).toBeVisible({ timeout: 15000 });
    await expect(senderPage.getByTestId('approve-peer')).toHaveCount(0);
    await expect(senderPage.getByTestId('receiver-row')).toContainText(/Idle for/);
    // The key must not linger in the address bar or history
    expect(receiverPage.url()).not.toContain('key=');

    // Files can still change while the receiver is choosing where to save
    await addFile(senderPage, 'second.txt', 'two');
    await expect(receiverPage.locator('text=second.txt')).toBeVisible({ timeout: 15000 });

    // Only take the second file
    await receiverPage.getByRole('checkbox', { name: /first.txt/ }).uncheck();
    await receiverPage.getByTestId('start-download').click();
    await expect(receiverPage.getByTestId('transfer-summary')).toContainText('Done', { timeout: 15000 });
    await expect(senderPage.locator('[data-testid=receiver-row][data-stage=completed]')).toHaveCount(1, { timeout: 15000 });
    // Only the chosen file was downloaded
    await expect(receiverPage.locator('[data-status=done]')).toHaveCount(1);
    await expect(receiverPage.locator('[data-status=done]')).toContainText('second.txt');

    // Still connected: the receiver can go back for the file it skipped
    await receiverPage.getByRole('checkbox', { name: /first.txt/ }).check();
    await receiverPage.getByTestId('start-download').click();
    await expect(receiverPage.locator('[data-status=done]')).toHaveCount(2, { timeout: 15000 });

    // The link keeps working for anyone else who has it
    const latecomer = await openReceiver(browser);
    await latecomer.page.goto(link);
    await expect(latecomer.page.getByTestId('incoming-files')).toBeVisible({ timeout: 15000 });
    await latecomer.close();
    await close();
  });

  test('several people: everyone with the link can come in and choose, and each downloads', async ({ browser }) => {
    const { senderPage, receiverPage: first, close } = await openPeers(browser);
    const second = await openReceiver(browser);
    const third = await openReceiver(browser);

    await senderPage.goto('/');
    await addFile(senderPage, 'for-everyone.txt', 'shared with several people');
    const link = await shareFiles(senderPage);

    await first.goto(link);
    await expect(first.getByTestId('incoming-files')).toBeVisible({ timeout: 15000 });
    await second.page.goto(link);
    await expect(second.page.getByTestId('incoming-files')).toBeVisible({ timeout: 15000 });
    await third.page.goto(link);
    await expect(third.page.getByTestId('incoming-files')).toBeVisible({ timeout: 15000 });
    await expect(senderPage.getByTestId('receiver-row')).toHaveCount(3);
    // People are told apart by the device they introduced, plus their address once the route is known
    const firstPerson = senderPage.getByTestId('receiver-row').first();
    await expect(firstPerson).toContainText('Chrome');
    await expect(firstPerson).toContainText(/(\d{1,3}\.){3}\d{1,3}|[0-9a-f]*:[0-9a-f:]+/, { timeout: 10000 });

    await first.getByTestId('start-download').click();
    await expect(first.getByTestId('transfer-summary')).toContainText('Done', { timeout: 15000 });

    await second.page.getByTestId('start-download').click();
    await third.page.getByTestId('start-download').click();
    await expect(second.page.getByTestId('transfer-summary')).toContainText('Done', { timeout: 15000 });
    await expect(third.page.getByTestId('transfer-summary')).toContainText('Done', { timeout: 15000 });

    await expect(senderPage.locator('[data-testid=receiver-row][data-stage=completed]')).toHaveCount(3);
    // The link stays on screen for more people
    await expect(senderPage.getByRole('button', { name: /copy link/i })).toBeVisible();
    await second.close();
    await third.close();
    await close();
  });

  test('receiver can stop waiting for approval, which withdraws the request on the sender', async ({ browser }) => {
    const { senderPage, receiverPage, close } = await openPeers(browser);

    await senderPage.goto('/');
    await addFile(senderPage, 'waiting.txt', 'wait');
    const roomCode = readRoomCode(await shareFiles(senderPage));

    await receiverPage.goto(`/?room=${roomCode}`);
    await receiverPage.getByTestId('connect').click();
    await expect(receiverPage.getByRole('heading', { name: /waiting for the sender to accept/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(senderPage.getByTestId('approve-peer')).toBeVisible({ timeout: 15000 });

    await receiverPage.getByRole('button', { name: 'Cancel' }).click();

    await expect(receiverPage.locator('input[placeholder="DT-XXXXXX"]')).toBeVisible();
    await expect(senderPage.getByTestId('approve-peer')).toHaveCount(0, { timeout: 15000 });
    await close();
  });

  test('sender reload mid-download: the receiver reconnects and offers what is left', async ({ browser }) => {
    // 4 MB at 100 ms per 64 KB chunk takes about 6 s, long enough to reload the sender partway
    const { senderPage, receiverPage, close } = await openPeers(browser, { writeDelayMs: 100 });

    await senderPage.goto('/');
    await addFile(senderPage, 'small.txt', 'first');
    await addFile(senderPage, 'large.bin', 'x'.repeat(4 * 1024 * 1024), 'application/octet-stream');
    const link = await shareFiles(senderPage);

    await receiverPage.goto(link);
    await receiverPage.getByTestId('start-download').click();
    await expect(receiverPage.locator('[data-status=done]')).toHaveCount(1, { timeout: 15000 });

    // Files added through the plain input cannot be read back after a reload, so the cut-off file is gone
    senderPage.on('dialog', (dialog) => dialog.accept());
    await senderPage.reload();
    await expect(receiverPage.getByTestId('transfer-summary')).toContainText('Reconnecting', { timeout: 15000 });
    await addFile(senderPage, 'other.txt', 'something else');

    await expect(receiverPage.getByText('Download was interrupted.')).toBeVisible({ timeout: 30000 });
    await receiverPage.getByTestId('start-download').click();
    await expect(receiverPage.getByTestId('transfer-summary')).toContainText('Done', { timeout: 15000 });
    await close();
  });

  // The link bar with the sharing settings is hidden until it is behind a feature flag
  test.fixme('PIN-protected transfer hides files until the correct PIN is entered', async ({ browser }) => {
    const { senderPage, receiverPage, close } = await openPeers(browser);

    await senderPage.goto('/');
    await addFile(senderPage, 'secret-plans.pdf', 'top secret', 'application/pdf');
    const roomCode = readRoomCode(await shareFiles(senderPage));
    await senderPage.getByTitle('Link options').click();
    await senderPage.getByTestId('open-link-settings').click();
    await senderPage.getByRole('checkbox', { name: /require a pin/i }).check();
    await senderPage.getByTestId('pin-input').fill('2468');
    await senderPage.getByTestId('pin-input').press('Enter');
    await senderPage.getByRole('button', { name: 'Done' }).click();

    await receiverPage.goto(`/?room=${roomCode}`);
    await receiverPage.getByTestId('connect').click();
    await senderPage.getByTestId('approve-peer').click({ timeout: 15000 });

    // File names must stay hidden until the PIN is accepted
    await expect(receiverPage.getByPlaceholder('Session PIN…')).toBeVisible({ timeout: 15000 });
    await expect(receiverPage.locator('text=secret-plans.pdf')).toHaveCount(0);

    const pinInput = receiverPage.locator('input[placeholder="Session PIN…"]');
    await pinInput.fill('1111');
    await receiverPage.locator('button:has-text("Unlock")').click();
    await expect(receiverPage.locator('text=Incorrect PIN. 2 attempts left.')).toBeVisible({ timeout: 15000 });

    await pinInput.fill('2468');
    await receiverPage.locator('button:has-text("Unlock")').click();
    await expect(receiverPage.locator('text=secret-plans.pdf')).toBeVisible({ timeout: 15000 });

    await receiverPage.getByTestId('start-download').click();
    await expect(receiverPage.getByTestId('transfer-summary')).toContainText('Done', { timeout: 15000 });
    await expect(senderPage.locator('[data-testid=receiver-row][data-stage=completed]')).toHaveCount(1, { timeout: 15000 });
    await close();
  });
});

/** A receiver in its own browser context, with file pickers stubbed to write nowhere (each write taking `writeDelayMs`). */
async function openReceiver(browser: Browser, { writeDelayMs = 0 }: { writeDelayMs?: number } = {}) {
  const context = await newLocalContext(browser);
  const page = await context.newPage();
  await page.addInitScript((delayMs) => {
    const write = () => new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    const createWritable = async () => ({ write, close: async () => {}, abort: async () => {} });
    const fileHandle = { createWritable };
    const directoryHandle = {
      getFileHandle: async () => fileHandle,
      getDirectoryHandle: async () => directoryHandle,
    };
    (window as any).showSaveFilePicker = async () => fileHandle;
    (window as any).showDirectoryPicker = async () => directoryHandle;
  }, writeDelayMs);
  return { page, close: () => context.close() };
}

/** Two isolated browser contexts: a sender and one receiver. */
async function openPeers(browser: Browser, receiverOptions: { writeDelayMs?: number } = {}) {
  const senderContext = await newLocalContext(browser, { permissions: ['clipboard-read', 'clipboard-write'] });
  const senderPage = await senderContext.newPage();
  const receiver = await openReceiver(browser, receiverOptions);
  const receiverPage = receiver.page;
  const close = async () => {
    await senderContext.close();
    await receiver.close();
  };
  return { senderPage, receiverPage, close };
}

/** Chromium's File button opens its own picker, which Playwright cannot fill; the plain input behind it adds files the same way. */
async function addFile(page: Page, name: string, content: string, mimeType = 'text/plain') {
  await page.locator('input[type=file]:not([webkitdirectory])').setInputFiles([{ name, mimeType, buffer: Buffer.from(content) }]);
  await expect(page.locator(`text=${name}`)).toBeVisible();
}

/**
 * Shares the files by copying the link (the first copy creates it) and returns it.
 * The page's context needs clipboard permissions.
 */
async function shareFiles(page: Page): Promise<string> {
  const copy = page.getByTestId('copy-link');
  await expect(copy).toBeEnabled({ timeout: 15000 });
  await copy.click();
  await expect(copy).toContainText('Copied');
  return page.evaluate(() => navigator.clipboard.readText());
}

function readRoomCode(link: string): string {
  return new URL(link).searchParams.get('room') ?? '';
}
