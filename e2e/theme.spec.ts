// Tema: açık/koyu geçişi ve yenilemede korunması; komut paleti ve yardım açılır.
import { expect, test } from '@playwright/test';
import { collectErrors, openClean } from './helpers';

test('tema geçişi data-theme\'i değiştirir ve yenilemede korunur', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  const html = page.locator('html');
  const t0 = await html.getAttribute('data-theme');
  expect(['light', 'dark']).toContain(t0);
  await page.getByRole('button', { name: 'Tema' }).click();
  const t1 = t0 === 'dark' ? 'light' : 'dark';
  await expect(html).toHaveAttribute('data-theme', t1);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', t1);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(bg);
  await page.getByRole('button', { name: 'Tema' }).click();
  await expect(html).toHaveAttribute('data-theme', t0!);
  expect(errs.list).toEqual([]);
});

test('komut paleti (Ctrl+K) komut çalıştırır; yardım F1 ile açılır', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await page.keyboard.press('Control+k');
  const pal = page.getByRole('dialog', { name: 'Komut paleti' });
  await expect(pal).toBeVisible();
  await pal.locator('input').fill('yildiz');
  await expect(pal.locator('li.on')).toContainText('Yıldız');
  await pal.locator('input').press('Enter');
  await expect(pal).toHaveCount(0);
  await expect(page.locator('#tabs .tab.active .tname')).toHaveText(/Yıldız/);
  await page.keyboard.press('F1');
  await expect(page.getByRole('dialog', { name: 'Nasıl kullanılır' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Nasıl kullanılır' }).getByRole('button', { name: 'Kapat' }).click();
  await expect(page.getByRole('dialog', { name: 'Nasıl kullanılır' })).toHaveCount(0);
  expect(errs.list).toEqual([]);
});
