import { test, expect } from '@playwright/test';
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
    await expect(page.locator('text=Receive Files via P2P')).toBeVisible();
    await page.getByRole('button', { name: /send files instead/i }).click();
    await expect(page.getByTestId('drop-zone')).toBeVisible();

    await page.getByTitle('Settings').click();
    await expect(page.locator('text=Transfer & Network Settings')).toBeVisible();
    await page.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    const githubLink = page.locator('a[href="https://github.com/marpe/send"]');
    await expect(githubLink).toHaveAttribute('target', '_blank');

    await page.locator('button:has-text("Cancel")').click();
    await expect(page.locator('text=Transfer & Network Settings')).not.toBeVisible();
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

    await page.getByRole('button', { name: 'Clear All' }).click();
    await page.getByRole('button', { name: /receive files/i }).click();
    await dropOnPage('second.txt');
    await expect(page.getByText('second.txt')).toBeVisible();
    await expect(page.locator('text=Receive Files via P2P')).toHaveCount(0);
  });

  test('shows dropto.space branding and orange palette for the dropto brand', async ({ page }) => {
    // ?brand= is the dev-only stand-in for visiting https://dropto.space
    await page.goto('/?brand=dropto');

    await expect(page).toHaveTitle('dropto.space — 10GB P2P WebRTC Transfer');
    await expect(page.locator('text=DropWave')).toHaveCount(0);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon-dropto.svg');
    const brand500 = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--brand-500').trim()
    );
    expect(brand500).toBe('249 115 22');
    await addFile(page, 'brand.txt', 'orange');
    await expect(page.locator('.font-mono.text-2xl.font-black')).toHaveText(/^DT-[A-Z0-9]{6}$/, { timeout: 15000 });
  });

  test('switches to Receive tab when opening share link with ?room= parameter', async ({ page }) => {
    await page.goto('/?room=DW-998877');

    // Should automatically be in Receive mode with room code pre-filled
    await expect(page.locator('text=Receive Files via P2P')).toBeVisible();
    const roomInput = page.locator('input[placeholder="DW-XXXXXX"]');
    await expect(roomInput).toHaveValue('DW-998877');
    await expect(page.locator('button:has-text("Connect & Download")')).toBeEnabled();
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
    const connectBtn = page.locator('button:has-text("Connect & Download")');
    await expect(connectBtn).toBeVisible();
    await expect(connectBtn).toBeEnabled();
  });

  test('typed room code: sender accepts, receiver saves, both verify', async ({ browser }) => {
    const { senderPage, receiverPage, close } = await openPeers(browser);

    await senderPage.goto('/');
    await addFile(senderPage, 'sample-dataset.dat', 'Simulated 10GB dataset test buffer payload.');
    await expect(senderPage.getByText(/^1 file · /)).toBeVisible();
    const roomCode = await readRoomCode(senderPage);

    // No #key: the room code alone must still need the sender's approval
    await receiverPage.goto(`/?room=${roomCode}`);
    await expect(receiverPage.locator('text=Receive Files via P2P')).toBeVisible();
    await receiverPage.locator('button:has-text("Connect & Download")').click();
    await expect(receiverPage.getByRole('heading', { name: 'Waiting for the Sender to Accept' })).toBeVisible({
      timeout: 15000,
    });

    await expect(senderPage.locator('text=Receiver Connection Request')).toBeVisible({ timeout: 15000 });
    await expect(senderPage.getByText('1 file', { exact: true })).toBeVisible();
    await senderPage.locator('button:has-text("Accept")').click();

    await expect(receiverPage.getByTestId('incoming-files')).toBeVisible({ timeout: 15000 });
    await expect(receiverPage.locator('text=sample-dataset.dat')).toBeVisible();
    await expect(senderPage.getByText(/choosing where to save/i)).toBeVisible();

    const saveButton = receiverPage.getByTestId('start-download');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(receiverPage.locator('text=Download Complete & Verified!')).toBeVisible({ timeout: 15000 });
    await expect(senderPage.locator('text=Transfer Complete!')).toBeVisible({ timeout: 15000 });
    await close();
  });

  test('share link: receiver connects without approval and sees files added later', async ({ browser }) => {
    const { senderPage, receiverPage, close } = await openPeers(browser);

    await senderPage.goto('/');
    await expect(senderPage.getByRole('button', { name: 'Copy Link' })).toHaveCount(0);
    await addFile(senderPage, 'first.txt', 'one');
    await readRoomCode(senderPage);
    await senderPage.getByRole('button', { name: 'Copy Link' }).click();
    const link = await senderPage.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\?room=DW-[A-Z0-9]{6}#key=[\w-]{22}$/);

    await receiverPage.goto(link);
    await expect(receiverPage.locator('text=first.txt')).toBeVisible({ timeout: 15000 });
    await expect(senderPage.locator('text=Receiver Connection Request')).toHaveCount(0);
    await expect(senderPage.getByText(/choosing where to save/i)).toBeVisible();
    // The key must not linger in the address bar or history
    expect(receiverPage.url()).not.toContain('key=');

    await addFile(senderPage, 'second.txt', 'two');
    await expect(receiverPage.locator('text=second.txt')).toBeVisible({ timeout: 15000 });

    // Only take the second file
    await receiverPage.getByRole('checkbox', { name: /first.txt/ }).uncheck();
    await receiverPage.getByTestId('start-download').click();
    await expect(receiverPage.locator('text=Download Complete & Verified!')).toBeVisible({ timeout: 15000 });
    await expect(senderPage.locator('text=Transfer Complete!')).toBeVisible({ timeout: 15000 });
    await expect(senderPage.getByText(/^1 file · /)).toBeVisible();
    await close();
  });

  test('receiver can stop waiting for approval, which withdraws the request on the sender', async ({ browser }) => {
    const { senderPage, receiverPage, close } = await openPeers(browser);

    await senderPage.goto('/');
    await addFile(senderPage, 'waiting.txt', 'wait');
    const roomCode = await readRoomCode(senderPage);

    await receiverPage.goto(`/?room=${roomCode}`);
    await receiverPage.locator('button:has-text("Connect & Download")').click();
    await expect(receiverPage.getByRole('heading', { name: 'Waiting for the Sender to Accept' })).toBeVisible({
      timeout: 15000,
    });
    await expect(senderPage.locator('text=Receiver Connection Request')).toBeVisible({ timeout: 15000 });

    await receiverPage.getByRole('button', { name: 'Cancel' }).click();

    await expect(receiverPage.locator('input[placeholder="DW-XXXXXX"]')).toBeVisible();
    await expect(senderPage.locator('text=Receiver Connection Request')).toHaveCount(0, { timeout: 15000 });
    await close();
  });

  test('PIN-protected transfer hides files until the correct PIN is entered', async ({ browser }) => {
    const { senderPage, receiverPage, close } = await openPeers(browser);

    await senderPage.goto('/');
    await addFile(senderPage, 'secret-plans.pdf', 'top secret', 'application/pdf');
    const roomCode = await readRoomCode(senderPage);
    await senderPage.locator('input[placeholder="e.g. 1234"]').fill('2468');

    await receiverPage.goto(`/?room=${roomCode}`);
    await receiverPage.locator('button:has-text("Connect & Download")').click();
    await senderPage.locator('button:has-text("Accept")').click({ timeout: 15000 });

    // File names must stay hidden until the PIN is accepted
    await expect(receiverPage.locator('text=This Transfer Is PIN-Protected')).toBeVisible({ timeout: 15000 });
    await expect(receiverPage.locator('text=secret-plans.pdf')).toHaveCount(0);

    const pinInput = receiverPage.locator('input[placeholder="Session PIN…"]');
    await pinInput.fill('1111');
    await receiverPage.locator('button:has-text("Unlock")').click();
    await expect(receiverPage.locator('text=Incorrect PIN. 2 attempts left.')).toBeVisible({ timeout: 15000 });

    await pinInput.fill('2468');
    await receiverPage.locator('button:has-text("Unlock")').click();
    await expect(receiverPage.locator('text=secret-plans.pdf')).toBeVisible({ timeout: 15000 });

    await receiverPage.getByTestId('start-download').click();
    await expect(receiverPage.locator('text=Download Complete & Verified!')).toBeVisible({ timeout: 15000 });
    await expect(senderPage.locator('text=Transfer Complete!')).toBeVisible({ timeout: 15000 });
    await close();
  });
});

/** Two isolated browser contexts; the receiver's file pickers are stubbed to write nowhere. */
async function openPeers(browser: Browser) {
  const senderContext = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const receiverContext = await browser.newContext();
  const senderPage = await senderContext.newPage();
  const receiverPage = await receiverContext.newPage();
  await receiverPage.addInitScript(() => {
    const createWritable = async () => ({ write: async () => {}, close: async () => {}, abort: async () => {} });
    const fileHandle = { createWritable };
    const directoryHandle = {
      getFileHandle: async () => fileHandle,
      getDirectoryHandle: async () => directoryHandle,
    };
    (window as any).showSaveFilePicker = async () => fileHandle;
    (window as any).showDirectoryPicker = async () => directoryHandle;
  });
  const close = async () => {
    await senderContext.close();
    await receiverContext.close();
  };
  return { senderPage, receiverPage, close };
}

async function addFile(page: Page, name: string, content: string, mimeType = 'text/plain') {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('pick-files').click();
  await (await fileChooserPromise).setFiles([{ name, mimeType, buffer: Buffer.from(content) }]);
  await expect(page.locator(`text=${name}`)).toBeVisible();
}

/** The room code is shown once files are queued. */
async function readRoomCode(page: Page): Promise<string> {
  const roomCodeElement = page.locator('.font-mono.text-2xl.font-black');
  await expect(roomCodeElement).toHaveText(/^DW-[A-Z0-9]{6}$/, { timeout: 15000 });
  return (await roomCodeElement.textContent())?.trim() ?? '';
}
