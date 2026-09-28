import { test, expect } from './fixtures';

// The link menu is hidden until it is behind a feature flag

test.fixme('phone: tapping outside the open menu only closes it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles([
    { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('a') },
    { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('b') },
  ]);
  await page.getByTestId('share-files').click();
  await page.getByTitle('Link options').click();
  await expect(page.getByRole('menu')).toBeVisible();

  // The remove button sits under the sheet's dimmed backdrop
  const remove = page.getByTitle('Remove a.txt');
  const box = await remove.boundingBox();
  if (!box) {
    throw new Error('no remove button');
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);

  await expect(page.getByRole('menu', { includeHidden: true })).toBeHidden();
  await expect(page.getByText('a.txt')).toBeVisible();
});

test.fixme('phone: menu items still work while the page behind is blocked', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('a') });
  await page.getByTestId('share-files').click();
  await page.getByTitle('Link options').click();
  await page.getByTestId('open-link-settings').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByTitle('Remove a.txt').click();
  await expect(page.getByText('a.txt')).toHaveCount(0);
});
