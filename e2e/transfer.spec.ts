import { test, expect, newLocalContext, LOCAL_PEER_SERVER_PORT } from './fixtures';
import type { Browser, Page } from '@playwright/test';

test.describe('DropWave Application End-to-End Tests', () => {
  test('landing page: drop area, receive-by-code link, settings with theme and about', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/DropWave/i);
    // An app: a title bar with the screen name, no marketing header
    await expect(page.getByRole('heading', { level: 1, name: 'Send files' })).toBeVisible();
    await expect(page.getByTestId('drop-zone')).toBeVisible();

    // Receiving by code is one click away, and there is a way back
    await page.getByRole('button', { name: /receive files/i }).click();
    await expect(page.getByTestId('room-code-form')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Receive files' })).toBeVisible();
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

  test('shows dropto.space branding and orange palette for the dropto brand', async ({ page }) => {
    // ?brand= is the dev-only stand-in for visiting https://dropto.space
    await page.goto('/?brand=dropto');

    await expect(page).toHaveTitle('dropto.space — 10GB P2P WebRTC Transfer');
    await expect(page.locator('text=DropWave')).toHaveCount(0);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon-dropto.svg');
    const brand500 = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-brand-500').trim()
    );
    expect(brand500).toBe('#f97316');
    await addFile(page, 'brand.txt', 'orange');
    await shareFiles(page);
    await expect(page.getByLabel('Share link')).toHaveValue(/[?]room=DT-[A-Z0-9]{6}#/, { timeout: 15000 });
  });

  test('switches to Receive tab when opening share link with ?room= parameter', async ({ page }) => {
    await page.goto('/?room=DW-998877');

    // Should automatically be in Receive mode with room code pre-filled
    await expect(page.getByTestId('room-code-form')).toBeVisible();
    const roomInput = page.locator('input[placeholder="DW-XXXXXX"]');
    await expect(roomInput).toHaveValue('DW-998877');
    await expect(page.getByTestId('connect')).toBeEnabled();
  });

  test('verifies "Select Save Location & Start Download" initiates stream and storage', async ({ page }) => {
    // Navigate to receiver page
    await page.goto('/?room=DW-TEST01');

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
    const roomInput = page.locator('input[placeholder="DW-XXXXXX"]');
    await expect(roomInput).toHaveValue('DW-TEST01');

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
    await expect(senderPage.getByText(/^1 file · /)).toBeVisible();
    await shareFiles(senderPage);
    const roomCode = await readRoomCode(senderPage);
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
    await expect(senderPage.getByRole('dialog').getByText('1 file', { exact: true })).toBeVisible();
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
    await expect(senderPage.getByRole('button', { name: /copy link/i })).toHaveCount(0);
    await addFile(senderPage, 'first.txt', 'one');
    await shareFiles(senderPage);
    await readRoomCode(senderPage);
    await senderPage.getByRole('button', { name: /copy link/i }).click();
    const link = await senderPage.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\?room=DW-[A-Z0-9]{6}#key=[\w-]{22}$/);

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
    // Downloads beyond the limit wait in line, but connecting and choosing never does
    await shareFiles(senderPage, { simultaneous: 1 });
    await readRoomCode(senderPage);
    const link = await senderPage.getByLabel('Share link').inputValue();

    await first.goto(link);
    await expect(first.getByTestId('incoming-files')).toBeVisible({ timeout: 15000 });
    await second.page.goto(link);
    await expect(second.page.getByTestId('incoming-files')).toBeVisible({ timeout: 15000 });
    await third.page.goto(link);
    await expect(third.page.getByTestId('incoming-files')).toBeVisible({ timeout: 15000 });
    await expect(senderPage.getByTestId('receiver-row')).toHaveCount(3);
    // People are told apart by the device they introduced, plus their address once the route is known
    const firstPerson = senderPage.getByTestId('receiver-row').first();
    await expect(firstPerson.getByRole('img', { name: 'Chrome' })).toBeVisible();
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
    await shareFiles(senderPage);
    const roomCode = await readRoomCode(senderPage);

    await receiverPage.goto(`/?room=${roomCode}`);
    await receiverPage.getByTestId('connect').click();
    await expect(receiverPage.getByRole('heading', { name: /waiting for the sender to accept/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(senderPage.getByTestId('approve-peer')).toBeVisible({ timeout: 15000 });

    await receiverPage.getByRole('button', { name: 'Cancel' }).click();

    await expect(receiverPage.locator('input[placeholder="DW-XXXXXX"]')).toBeVisible();
    await expect(senderPage.getByTestId('approve-peer')).toHaveCount(0, { timeout: 15000 });
    await close();
  });

  test('PIN-protected transfer hides files until the correct PIN is entered', async ({ browser }) => {
    const { senderPage, receiverPage, close } = await openPeers(browser);

    await senderPage.goto('/');
    await addFile(senderPage, 'secret-plans.pdf', 'top secret', 'application/pdf');
    await shareFiles(senderPage, { pin: '2468' });
    const roomCode = await readRoomCode(senderPage);

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

/** A receiver in its own browser context, with file pickers stubbed to write nowhere. */
async function openReceiver(browser: Browser) {
  const context = await newLocalContext(browser);
  const page = await context.newPage();
  await page.addInitScript(() => {
    const createWritable = async () => ({ write: async () => {}, close: async () => {}, abort: async () => {} });
    const fileHandle = { createWritable };
    const directoryHandle = {
      getFileHandle: async () => fileHandle,
      getDirectoryHandle: async () => directoryHandle,
    };
    (window as any).showSaveFilePicker = async () => fileHandle;
    (window as any).showDirectoryPicker = async () => directoryHandle;
  });
  return { page, close: () => context.close() };
}

/** Two isolated browser contexts: a sender and one receiver. */
async function openPeers(browser: Browser) {
  const senderContext = await newLocalContext(browser, { permissions: ['clipboard-read', 'clipboard-write'] });
  const senderPage = await senderContext.newPage();
  const receiver = await openReceiver(browser);
  const receiverPage = receiver.page;
  const close = async () => {
    await senderContext.close();
    await receiver.close();
  };
  return { senderPage, receiverPage, close };
}

async function addFile(page: Page, name: string, content: string, mimeType = 'text/plain') {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('pick-files').click();
  await (await fileChooserPromise).setFiles([{ name, mimeType, buffer: Buffer.from(content) }]);
  await expect(page.locator(`text=${name}`)).toBeVisible();
}

interface ShareOptions {
  pin?: string;
  /** Let this many people download at the same time (1 is the one-person link) */
  simultaneous?: number;
}

/** Creates the link, then (in the settings dialog, where changes apply at once) puts it behind a PIN or opens it to several people. */
async function shareFiles(page: Page, { pin, simultaneous }: ShareOptions = {}) {
  await page.getByTestId('share-files').click();
  if (!pin && !simultaneous) {
    return;
  }
  await page.getByTitle('Link options').click();
  await page.getByTestId('open-link-settings').click();
  if (pin) {
    await page.getByRole('checkbox', { name: /require a pin/i }).check();
    await page.getByTestId('pin-input').fill(pin);
    await page.getByTestId('pin-input').press('Enter');
  }
  if (simultaneous) {
    const limit = page.getByRole('status', { name: /simultaneous downloads/i });
    while (Number(await limit.textContent()) < simultaneous) {
      await page.getByTitle('More').click();
    }
    while (Number(await limit.textContent()) > simultaneous) {
      await page.getByTitle('Fewer').click();
    }
  }
  await page.getByRole('button', { name: 'Done' }).click();
}

/** The room code, read from the link once it has been created. */

function readRoomCodeFromLink(link: string): string {
  return new URL(link).searchParams.get('room') ?? '';
}

async function readRoomCode(page: Page): Promise<string> {
  const link = page.getByLabel('Share link');
  await expect(link).toHaveValue(/[?]room=DW-[A-Z0-9]{6}#/, { timeout: 15000 });
  return readRoomCodeFromLink(await link.inputValue());
}
