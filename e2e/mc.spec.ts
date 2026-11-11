// Ana kontrol (MC/MCR): panodan ve hızlı yazımla ekleme, çalışırken blok kapanınca içteki satırın enerjisiz görünmesi.
import { expect, test } from '@playwright/test';
import { collectErrors, getIl, loadOnly, openClean } from './helpers';

const code = (il: string) => il.split('\n').filter((l) => l && !l.startsWith(';') && !l.startsWith('#'));

test.describe('MC / MCR', () => {
  test('panodan MC ve MCR: seçili satırın altına blok başı ve sonu eklenir', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, 'LD X1\nOUT Y0\nEND', 'mc');
    await page.locator('#ladder rect.hit[data-g="o"]').first().click();
    await page.locator('button.part[data-part="MC"]').click();
    await expect.poll(async () => code(await getIl(page))).toEqual(['LD X1', 'OUT Y0', 'LD X0', 'MC N0', 'END']);
    // özellikler panelinde seviye düğmeleri; MC seçili
    await expect(page.locator('.props h2')).toContainText('MC');
    await page.locator('button.part[data-part="MCR"]').click();
    await expect.poll(async () => code(await getIl(page))).toEqual(['LD X1', 'OUT Y0', 'LD X0', 'MC N0', 'MCR N0', 'END']);
    // seviye N1'e çevrilir (MCR seçili): eşleşmeyen blok tanılaması çıkar
    await page.locator('.props [role="radiogroup"] button', { hasText: 'N1' }).click();
    await expect.poll(async () => code(await getIl(page))).toContain('MCR N1');
    await expect.poll(() => page.evaluate(() => window.plc.diagnostics().map((d) => d.code))).toContain('E_MCR_NO_MC');
    await page.locator('.props [role="radiogroup"] button', { hasText: 'N0' }).click();
    await expect.poll(() => page.evaluate(() => window.plc.diagnostics().length)).toBe(0);
    // blok işareti (MC satırından sonra MCR satırına kadar)
    await expect(page.locator('#ladder .mcrail')).toHaveCount(1);
    expect(errs.list).toEqual([]);
  });

  test('hızlı yazım: Enter, "MC N0" ve "MCR N0"', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, 'LD X1\nOUT Y0\nEND', 'mc');
    await page.locator('#ladder rect.hit[data-g="o"]').first().click();
    await page.locator('.ladderwrap').press('Enter');
    await page.locator('.quick input').fill('MC N0');
    await page.locator('.quick input').press('Enter');
    await page.locator('.ladderwrap').press('Enter');
    await page.locator('.quick input').fill('MCR N0');
    await page.locator('.quick input').press('Enter');
    await expect.poll(async () => code(await getIl(page))).toEqual(['LD X1', 'OUT Y0', 'LD X0', 'MC N0', 'MCR N0', 'END']);
    expect(errs.list).toEqual([]);
  });

  test('çalışırken MC kapanınca içteki satırın teli ve bobini enerjisiz, blok işareti söner; MCR sonrası etkilenmez', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, 'LD X0\nMC N0\nLD M1000\nOUT Y0\nMCR N0\nLD M1000\nOUT Y1\nEND', 'mc-canli');
    const innerCoil = page.locator('#ladder .coil[data-q]').nth(1); // 0: MC kutusu, 1: OUT Y0, 2: MCR, 3: OUT Y1
    const afterCoil = page.locator('#ladder .coil[data-q]').nth(3);
    const block = page.locator('#ladder .mcrail');
    await page.evaluate(() => {
      window.plc.run();
      window.plc.set('X0', 1);
      window.plc.advance(30);
    });
    await expect(innerCoil).toHaveClass(/on/);
    await expect(block).toHaveClass(/on/);
    await expect(afterCoil).toHaveClass(/on/);
    const st = await page.evaluate(() => {
      window.plc.set('X0', 0);
      return window.plc.advance(30);
    });
    expect(st.Y0).toBe(0);
    expect(st.Y1).toBe(1);
    await expect(innerCoil).not.toHaveClass(/on/);
    await expect(block).not.toHaveClass(/on/);
    await expect(afterCoil).toHaveClass(/on/);
    // içteki satırın M1000 kontağı kendisi kapalı görünür ama ona giden tel enerjisiz
    await expect(page.locator('#ladder .ct.on')).toHaveCount(2); // iki M1000 kontağı (X0 açık)
    const innerWires = await page.evaluate(() => {
      const s = window.__store!.getState();
      const id = s.doc.ladder!.rungs[1]!.id;
      return [...document.querySelectorAll(`#ladder [data-pw="${id}:rail"], #ladder [data-pw^="${s.doc.ladder!.rungs[1]!.input[0]!.id}:"]`)].map((e) => e.classList.contains('on'));
    });
    expect(innerWires.length).toBeGreaterThan(0);
    expect(innerWires.every((on) => !on)).toBe(true);
    expect(errs.list).toEqual([]);
  });
});
