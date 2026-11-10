// Aşama 3a: veri komutları arayüzde. Fonksiyon kutusu, karşılaştırma kontağı, canlı D değeri.
import { expect, test } from '@playwright/test';
import { collectErrors, getIl, loadOnly, openClean } from './helpers';

test('panodan MOV kutusu tıklanınca eklenir, özellikler panelinden işlenen ve biçim değişir', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await loadOnly(page, 'LD X0\nOUT Y0\nEND', 'veri');
  await page.locator('#ladder .hit[data-g="o"]').first().click();
  await page.locator('button.part[data-part="MOV"]').click();
  await expect.poll(() => getIl(page)).toMatch(/MOV K10 D0/);
  // ilk işlenen (kaynak) odakta: K25 yaz
  const op = page.locator('#prop-op');
  await expect(op).toBeFocused();
  await op.fill('K25');
  await expect.poll(() => getIl(page)).toMatch(/MOV K25 D0/);
  // darbe biçimi
  await page.getByText('Darbe (P): her basışta bir kez').click();
  await expect.poll(() => getIl(page)).toMatch(/MOVP K25 D0/);
  // hatalı hedef: sabit
  await page.locator('.props .input.mono').nth(1).fill('K5');
  await expect(page.locator('.props .errmsg')).toContainText('hedef olamaz');
  expect(errs.list).toEqual([]);
});

test('Enter ile karşılaştırma kontağı yazılır, işleç değişir, çalışırken akım ve D değeri görünür', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await loadOnly(page, 'LD X0\nINCP D0\nLD M1000\nOUT Y1\nEND', 'cmp');
  // ikinci satırın kontağını seç, Enter → "AND>= D0 K2"
  await page.locator('#ladder .hit[data-g="c"]').nth(1).click();
  await page.locator('.ladderwrap').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('AND>= D0 K2');
  await page.keyboard.press('Enter');
  await expect.poll(() => getIl(page)).toMatch(/LD M1000\nAND>= D0 K2\nOUT Y1/);
  // işleci "=" yap
  await page.locator('.kinds.cmpops button', { hasText: /^=$/ }).click();
  await expect.poll(() => getIl(page)).toMatch(/AND= D0 K2/);
  // iki basış: D0 = 2 → Y1 yanar; kutu altında canlı değer
  const st = await page.evaluate(() => {
    window.plc.stop();
    window.plc.press('X0', 50);
    window.plc.press('X0', 50);
    return window.plc.state();
  });
  expect(st.D0).toBe(2);
  expect(st.Y1).toBe(1);
  await expect(page.locator('#ladder [data-wv]').first()).toHaveText('D0 = 2');
  await expect(page.locator('#ladder .ct.cmp.on')).toHaveCount(1);
  expect(errs.list).toEqual([]);
});

test('sayıcı değeri K1Y0 ile lambalarda ikilik görünür', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await page.evaluate(() => (location.hash = '#ornek=21'));
  await expect(page.locator('#tabs .tab.active .tname')).toHaveText(/K1Y0/);
  await page.evaluate(() => {
    window.plc.stop();
    for (let i = 0; i < 5; i++) window.plc.press('X0', 50);
  });
  // 5 = 0101: Y0 ve Y2 yanık
  await expect(page.locator('.lamp.on')).toHaveCount(2);
  await expect(page.locator('.lamp[data-y="Y0"]')).toHaveClass(/on/);
  await expect(page.locator('.lamp[data-y="Y2"]')).toHaveClass(/on/);
  expect(errs.list).toEqual([]);
});
