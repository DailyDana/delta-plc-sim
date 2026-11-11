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

test('uzun IL satırı orta alanı genişletip sağ paneli örtmez', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openClean(page);
  await page.evaluate(() => window.plc.load('; ' + 'çok uzun bir açıklama satırı '.repeat(30) + '\nLD X0\nOUT Y0\nEND', 'uzun'));
  const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
  const center = await box('main.center');
  for (const sel of ['.bottom', '.ladderwrap']) {
    const b = await box(sel);
    expect(b.x + b.width, sel).toBeLessThanOrEqual(center.x + center.width + 1);
  }
  // uzun etiketli girişler: dördüncü buton sağ panelin içinde kalır
  const labelled = ['#X0 çok uzun bir giriş etiketi', '#X1 motor bir start butonu', '#X2 motor bir stop butonu', '#X3 motor iki start butonu', 'LD X0', 'OUT Y0', 'END'].join('\n');
  await page.evaluate((il) => window.plc.load(il, 'etiket'), labelled);
  const panel = await box('.work > .side:last-child');
  const x3 = await box('.xbtn >> nth=3');
  expect(x3.x + x3.width).toBeLessThanOrEqual(panel.x + panel.width);
  const vw = page.viewportSize()!.width;
  const right = await box('.work > .side:last-child');
  expect(right.x + right.width).toBeLessThanOrEqual(vw + 1);
  expect(right.x).toBeGreaterThanOrEqual(center.x + center.width - 1);
});
