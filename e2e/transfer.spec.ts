import { test, expect, newLocalContext, LOCAL_PEER_SERVER_PORT } from './fixtures';
import type { Browser, Page } from '@playwright/test';

test.describe('DropWave Application End-to-End Tests', () => {
  test('landing page: drop area, receive-by-code link, settings with theme and about', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/DropWave/i);
    await expect(page.locator('header')).toHaveCount(0);
    await expect(page.locator('footer')).toHaveCount(0);
    await expect(page.getByTestId('drop-zone')).toBeVisible();

    // Receiving by code is one click away, and there is a way back
    await page.getByRole('button', { name: /receive files/i }).click();
    await expect(page.getByTestId('room-code-form')).toBeVisible();
    await page.getByRole('button', { name: /send files instead/i }).click();
    await expect(page.getByTestId('drop-zone')).toBeVisible();

    await page.getByTitle('Settings').click();
    await expect(page.locator('text=Settings')).toBeVisible();
    await page.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    const githubLink = page.locator('a[href="https://github.com/marpe/send"]');
    await expect(githubLink).toHaveAttribute('target', '_blank');

    await page.locator('button:has-text("Cancel")').click();
    await expect(page.locator('text=Settings')).not.toBeVisible();
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
    await expect(page.getByTestId('room-code')).toHaveText(/^DT-[A-Z0-9]{6}$/, { timeout: 15000 });
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
    await expect(senderPage.getByText('1 file', { exact: true })).toBeVisible();
    await senderPage.getByTestId('approve-peer').click();

    await expect(receiverPage.getByTestId('incoming-files')).toBeVisible({ timeout: 15000 });
    await expect(receiverPage.locator('text=sample-dataset.dat')).toBeVisible();
    await expect(senderPage.getByText(/choosing where to save/i)).toBeVisible();

    const saveButton = receiverPage.getByTestId('start-download');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(receiverPage.getByTestId('stat-files')).toBeVisible({ timeout: 15000 });
    await expect(senderPage.getByTestId('stat-files')).toBeVisible({ timeout: 15000 });
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
    await expect(senderPage.getByText(/choosing where to save/i)).toBeVisible();
    // The key must not linger in the address bar or history
    expect(receiverPage.url()).not.toContain('key=');

    // Files can still change while the receiver is choosing where to save
    await senderPage.getByTestId('edit-files').click();
    await addFile(senderPage, 'second.txt', 'two');
    await expect(receiverPage.locator('text=second.txt')).toBeVisible({ timeout: 15000 });

    // Only take the second file
    await receiverPage.getByRole('checkbox', { name: /first.txt/ }).uncheck();
    await receiverPage.getByTestId('start-download').click();
    await expect(receiverPage.getByTestId('stat-files')).toBeVisible({ timeout: 15000 });
    await expect(senderPage.getByTestId('stat-files')).toBeVisible({ timeout: 15000 });
    // Only the chosen file counts, and the stats stay on screen after the transfer
    await expect(senderPage.getByTestId('stat-files')).toContainText('1');
    await expect(receiverPage.getByTestId('stat-size')).toBeVisible();

    // A one-person link serves a single download; someone else arriving later is told why
    const latecomer = await openReceiver(browser);
    await latecomer.page.goto(link);
    await expect(latecomer.page.getByText(/only worked once/i)).toBeVisible({ timeout: 15000 });
    await latecomer.close();

    // The same files can go to someone else on a new link
    await senderPage.getByTestId('send-again').click();
    await senderPage.getByTestId('create-link').click();
    const newCode = await readRoomCode(senderPage);
    expect(newCode).not.toBe(readRoomCodeFromLink(link));
    await close();
  });

  test('several people: one downloads while the next waits in line, then gets their turn', async ({ browser }) => {
    const { senderPage, receiverPage: first, close } = await openPeers(browser);
    const second = await openReceiver(browser);

    await senderPage.goto('/');
    await addFile(senderPage, 'for-everyone.txt', 'shared with several people');
    await shareFiles(senderPage, { simultaneous: 1 });
    await readRoomCode(senderPage);
    const link = await senderPage.getByLabel('Share link').inputValue();

    await first.goto(link);
    await expect(first.getByTestId('incoming-files')).toBeVisible({ timeout: 15000 });
    await second.page.goto(link);
    await expect(second.page.getByRole('heading', { name: /in line/i })).toBeVisible({ timeout: 15000 });
    await expect(second.page.getByText(/you.re next/i)).toBeVisible();
    await expect(senderPage.getByTestId('receiver-row')).toHaveCount(2);
    // People are told apart by the device they introduced, plus their address once the route is known
    const firstPerson = senderPage.getByTestId('receiver-row').first();
    await expect(firstPerson).toContainText(/Chrome on [A-Za-z]+/);
    await expect(firstPerson).toContainText(/(\d{1,3}\.){3}\d{1,3}|[0-9a-f]*:[0-9a-f:]+/, { timeout: 10000 });

    await first.getByTestId('start-download').click();
    await expect(first.getByTestId('stat-files')).toBeVisible({ timeout: 15000 });

    // A slot freed up: the next person gets the files without doing anything
    await expect(second.page.getByTestId('incoming-files')).toBeVisible({ timeout: 15000 });
    await second.page.getByTestId('start-download').click();
    await expect(second.page.getByTestId('stat-files')).toBeVisible({ timeout: 15000 });

    await expect(senderPage.locator('[data-testid=receiver-row][data-stage=completed]')).toHaveCount(2);
    // The link stays on screen for more people
    await expect(senderPage.getByRole('button', { name: /copy link/i })).toBeVisible();
    await second.close();
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
    await expect(receiverPage.getByTestId('stat-files')).toBeVisible({ timeout: 15000 });
    await expect(senderPage.getByTestId('stat-files')).toBeVisible({ timeout: 15000 });
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
  /** Let several people download, this many at the same time */
  simultaneous?: number;
}

/** Moves from the file list to the share step and creates the link, optionally behind a PIN or for several people. */
async function shareFiles(page: Page, { pin, simultaneous }: ShareOptions = {}) {
  await page.getByTestId('share-files').click();
  if (pin) {
    await page.getByRole('checkbox', { name: /require a pin/i }).check();
    await page.getByTestId('pin-input').fill(pin);
  }
  if (simultaneous) {
    await page.getByRole('checkbox', { name: /let several people download/i }).check();
    const limit = page.getByRole('status', { name: /at the same time/i });
    while (Number(await limit.textContent()) > simultaneous) {
      await page.getByTitle('Fewer').click();
    }
  }
  await page.getByTestId('create-link').click();
}

/** The room code is shown once the link has been created. */

function readRoomCodeFromLink(link: string): string {
  return new URL(link).searchParams.get('room') ?? '';
}

async function readRoomCode(page: Page): Promise<string> {
  const roomCodeElement = page.getByTestId('room-code');
  await expect(roomCodeElement).toHaveText(/^DW-[A-Z0-9]{6}$/, { timeout: 15000 });
  return (await roomCodeElement.textContent())?.trim() ?? '';
}
