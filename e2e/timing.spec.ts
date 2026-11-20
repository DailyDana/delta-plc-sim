// Zaman diyagramı: varsayılan satırlar, PLC zamanıyla kayıt, imleçlerle Δt, seçimin hatırlanması, PNG indirme.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { collectErrors, loadOnly, openClean } from './helpers';

const TIMER = '#X0 start\n#Y0 lamba\nLD X0\nOR M0\nOUT M0\nLD M0\nTMR T0 K20\nLD T0\nOUT Y0\nEND';

const openTiming = async (page: Page) => {
  await page.getByRole('tab', { name: /Zaman diyagramı/ }).click();
  await expect(page.locator('.wave')).toBeVisible();
};
const rowKeys = (page: Page) => page.locator('.wave-name').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key));

/** Canvas üzerinde t anının sayfa koordinatı (satır ortası) */
async function pointAt(page: Page, t: number, key: string): Promise<{ x: number; y: number }> {
  const cv = page.locator('canvas.wave-rows');
  const box = (await cv.boundingBox())!;
  const { t0, t1 } = await cv.evaluate((c) => ({ t0: Number((c as HTMLElement).dataset.t0), t1: Number((c as HTMLElement).dataset.t1) }));
  const keys = await rowKeys(page);
  const i = keys.indexOf(key);
  expect(i, key).toBeGreaterThanOrEqual(0);
  const row = (await page.locator('.wave-name').nth(i).boundingBox())!;
  return { x: box.x + ((t - t0) / (t1 - t0)) * box.width, y: row.y + row.height / 2 };
}

test('örnek çalışınca kullanılan X/Y/T satırları oluşur ve kayıt dolar', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await page.evaluate(() => (location.hash = '#ornek=4'));
  await expect(page.locator('#tabs .tab.active .tname')).toHaveText(/Yıldız/);
  await openTiming(page);
  expect(await rowKeys(page)).toEqual(['X0', 'X1', 'Y0', 'Y1', 'Y2', 'T0', 'T1']);
  await expect(page.locator('.wave-name[data-key="X0"] .l')).toHaveText('start');
  await expect(page.locator('.wave-idle')).toBeVisible();
  await page.evaluate(() => {
    window.plc.press('X0', 100);
    window.plc.advance(6000);
  });
  const tr = await page.evaluate(() => window.plc.trace(['Y1', 'Y2', 'T0']));
  expect(tr.signals.Y1!.v[0]).toBe(1);
  expect(tr.signals.Y2!.t.length).toBe(1);
  await expect(page.locator('.wave-idle')).toBeHidden();
  // başlıktaki değer kaydın sonundaki değer
  await expect(page.locator('.wave-name[data-key="Y2"] .v')).toHaveText('1');
  await expect(page.locator('.wave-name[data-key="Y2"]')).toHaveClass(/on/);
  expect(errs.list).toEqual([]);
});

test('press + advance: çıkışın yükselen kenarı PLC zamanında kayıtlı (simulate ile aynı)', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await loadOnly(page, TIMER, 'zaman');
  await openTiming(page);
  const tr = await page.evaluate(() => {
    window.plc.press('X0', 100);
    window.plc.advance(3000);
    return window.plc.trace();
  });
  expect(tr.start).toBe(0);
  expect(tr.signals.X0).toMatchObject({ t: [0, 100], v: [1, 0] });
  expect(tr.signals.M0!.t).toEqual([10]);
  expect(tr.signals.Y0!.t).toEqual([2000]); // CLI: plc sim --olay "0:X0=1 100:X0=0" → Y0 ↑ 2.000 s
  expect(tr.signals.T0!.t).toEqual([2000]);
  expect(tr.end).toBeCloseTo(3110, 0);
  // STOP kaydı silmez, sonraki RUN yeni kayıt başlatır
  await page.evaluate(() => window.plc.stop());
  expect((await page.evaluate(() => window.plc.trace(['Y0']))).signals.Y0!.t).toEqual([2000]);
  await page.evaluate(() => window.plc.advance(50));
  const t2 = await page.evaluate(() => window.plc.trace());
  expect(t2.start).toBe(0);
  expect(t2.end).toBe(50);
  expect(t2.signals.Y0!.t).toEqual([]);
  // Temizle: kayıt sıfırdan, çalışıyorsa şimdiki zamandan
  await page.getByRole('button', { name: 'Temizle' }).click();
  expect((await page.evaluate(() => window.plc.trace())).start).toBe(50);
  expect(errs.list).toEqual([]);
});

test('iki imleç kenarlara yapışır ve Δt okunur', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await loadOnly(page, TIMER, 'zaman');
  await openTiming(page);
  await page.evaluate(() => {
    window.plc.press('X0', 100);
    window.plc.advance(3000);
  });
  await page.getByRole('button', { name: 'Tamamını göster' }).click();
  // X0 düşen kenarının (100 ms) biraz sağına, Y0 yükselen kenarının (2000 ms) biraz soluna tıkla
  const a = await pointAt(page, 100, 'X0');
  await page.mouse.click(a.x + 4, a.y);
  await expect(page.locator('.wave-meas .ca')).toHaveAttribute('data-a', '100');
  const b = await pointAt(page, 2000, 'Y0');
  await page.mouse.click(b.x - 4, b.y);
  const dt = page.locator('.wave-meas .dt');
  await expect(dt).toHaveAttribute('data-dt', '1900');
  await expect(dt).toHaveText('Δt 1,9 s');
  // başlıklar A imlecindeki değerleri gösterir (A = 100 ms: X0 düştü, M0 açık, Y0 kapalı)
  await expect(page.locator('.wave-name[data-key="X0"] .v')).toHaveText('0');
  await expect(page.locator('.wave-name[data-key="Y0"] .v')).toHaveText('1'); // etkin imleç B (2000 ms)
  // Alt basılıyken yapışmaz
  await page.keyboard.down('Alt');
  await page.mouse.click(b.x - 30, b.y);
  await page.keyboard.up('Alt');
  const free = Number(await page.locator('.wave-meas .cb').getAttribute('data-b'));
  expect(free).not.toBe(2000);
  expect(free).toBeLessThan(2000);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wave-meas .dt')).toHaveCount(0);
  expect(errs.list).toEqual([]);
});

test('cihaz ekle/çıkar/sırala sekmeye göre hatırlanır', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await loadOnly(page, TIMER, 'zaman');
  await openTiming(page);
  expect(await rowKeys(page)).toEqual(['X0', 'Y0', 'T0']);
  await page.getByLabel('Cihaz ekle').fill('t0.v');
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
  await page.locator('.wave-name[data-key="Y0"]').hover();
  await page.getByRole('button', { name: 'Y0 çıkar' }).click();
  await page.locator('.wave-name[data-key="T0"]').hover();
  await page.getByRole('button', { name: 'T0 yukarı' }).click();
  expect(await rowKeys(page)).toEqual(['T0', 'X0', 'T0.v']);
  // kelime satırı: zamanlayıcı değeri
  await page.evaluate(() => {
    window.plc.set('X0', 1);
    window.plc.advance(1000);
  });
  await expect(page.locator('.wave-name[data-key="T0.v"] .v')).toHaveText(/^\d+$/);
  // başka sekme açıp dönünce seçim korunur; yenilemede de
  await page.evaluate(() => window.plc.load('LD X3\nOUT Y5\nEND', 'diğer'));
  expect(await rowKeys(page)).toEqual(['X3', 'Y5']);
  await page.evaluate(() => window.__store!.getState().switchTab(0));
  expect(await rowKeys(page)).toEqual(['T0', 'X0', 'T0.v']);
  await page.reload();
  await page.waitForFunction(() => window.PLC_APP_OK === true);
  expect(await rowKeys(page)).toEqual(['T0', 'X0', 'T0.v']);
  await page.getByRole('button', { name: 'Varsayılan seçim' }).click();
  expect(await rowKeys(page)).toEqual(['X0', 'Y0', 'T0']);
  expect(errs.list).toEqual([]);
});

test('canlıyı bırakıp geri dönme ve PNG indirme', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await page.evaluate(() => (location.hash = '#ornek=5'));
  await expect(page.locator('#tabs .tab.active .tname')).toHaveText(/Trafik/);
  await openTiming(page);
  await page.evaluate(() => window.plc.advance(25000));
  const cv = page.locator('canvas.wave-rows');
  await expect(cv).toHaveAttribute('data-t1', '25000');
  // geri sürükle: canlı bırakılır
  const box = (await cv.boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 10, { steps: 5 });
  await page.mouse.up();
  const back = page.getByRole('button', { name: 'Canlıya dön' });
  await expect(back).toBeEnabled();
  expect(Number(await cv.getAttribute('data-t1'))).toBeLessThan(25000);
  await page.evaluate(() => window.plc.advance(1000));
  expect(Number(await cv.getAttribute('data-t1'))).toBeLessThan(25000);
  await back.click();
  await expect(cv).toHaveAttribute('data-t1', '26000');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PNG' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^zaman-diyagrami-.*\.png$/);
  const path = await dl.path();
  const buf = readFileSync(path!);
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
  expect(buf.length).toBeGreaterThan(5000);
  expect(errs.list).toEqual([]);
});
