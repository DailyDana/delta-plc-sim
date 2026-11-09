// Ladder düzenleme: gerçek fareyle sürükle-bırak, pano tıklaması, özellikler paneli, klavye, IL düzenleyici.
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, EX, getIl, loadOnly, openClean } from './helpers';

const contactLines = (il: string) => il.split('\n').filter((l) => /^(LD|LDI|LDP|LDF|AND|ANI|ANDP|ANDF|OR|ORI|ORP|ORF) /.test(l));
const sel = (page: Page) => page.evaluate(() => window.__store!.getState().sel);

async function center(page: Page, selector: string, nth = 0) {
  const b = await page.locator(selector).nth(nth).boundingBox();
  if (!b) throw new Error('görünmüyor: ' + selector);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Fareyi bas, eşiği geçecek kadar kaydır (sürükleme başlasın) */
async function pickUp(page: Page, p: { x: number; y: number }) {
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 12, p.y + 12, { steps: 3 });
  await page.mouse.move(p.x + 30, p.y + 30, { steps: 3 });
}

/** Sürüklerken görünen bırakma noktalarından birine git */
async function moveToSlot(page: Page, nth: number) {
  const slots = page.locator('#ladder circle.slot');
  await expect(slots.first()).toBeVisible();
  const p = await center(page, '#ladder circle.slot', nth);
  await page.mouse.move(p.x - 20, p.y - 10, { steps: 4 });
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await expect(page.locator('#ladder .hotbar')).toBeVisible();
}

test.describe('sürükle-bırak', () => {
  test('panodan kontak sürükleyip bırakma noktasına koy', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, EX.seal, 'muh');
    const before = contactLines(await getIl(page)).length;
    await pickUp(page, await center(page, 'button.part[data-part="NO"]'));
    await expect(page.locator('.dragghost')).toBeVisible();
    await moveToSlot(page, 0);
    await expect(page.locator('#ladder .hotlbl text')).not.toHaveText('');
    await page.mouse.up();
    await expect.poll(async () => contactLines(await getIl(page)).length).toBe(before + 1);
    await expect(page.locator('.dragghost')).toHaveCount(0);
    await expect(page.locator('#ladder circle.slot')).toHaveCount(0);
    // yeni parça seçili, adres kutusu odakta (hızlı adres yazımı)
    await expect(page.locator('#prop-op')).toBeFocused();
    expect(errs.list).toEqual([]);
  });

  test('bırakma noktası dışında bırakınca hiçbir şey değişmez, Esc iptal eder', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, EX.seal, 'muh');
    const il = await getIl(page);
    await pickUp(page, await center(page, 'button.part[data-part="NC"]'));
    await page.mouse.move(700, 880, { steps: 5 }); // alt panel: ladder dışı
    await page.mouse.up();
    expect(await getIl(page)).toBe(il);
    await pickUp(page, await center(page, 'button.part[data-part="NC"]'));
    await moveToSlot(page, 0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#ladder circle.slot')).toHaveCount(0);
    await page.mouse.up();
    expect(await getIl(page)).toBe(il);
    expect(errs.list).toEqual([]);
  });

  test('ladder\'daki kontağı sol panele sürükle: silinir', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, EX.seal, 'muh');
    const before = contactLines(await getIl(page)).length;
    await pickUp(page, await center(page, '#ladder rect.hit[data-g="c"]', 2));
    await expect(page.locator('.side.left.trash')).toBeVisible();
    const p = await center(page, '.side.left');
    await page.mouse.move(p.x, p.y, { steps: 6 });
    await expect(page.locator('.side.left.hot')).toBeVisible();
    await page.mouse.up();
    await expect.poll(async () => contactLines(await getIl(page)).length).toBe(before - 1);
    await expect(page.locator('#toast')).toContainText('Silindi');
    expect(errs.list).toEqual([]);
  });

  test('Ctrl ile sürükle: kopyalar (asıl yerinde kalır); Ctrl olmadan taşır', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, 'LD X0\nAND X1\nOUT Y0\nLD X2\nOUT Y1\nEND', 'kopya');
    // X1 kontağı (2. kontak) → kopyala
    await pickUp(page, await center(page, '#ladder rect.hit[data-g="c"]', 1));
    await moveToSlot(page, (await page.locator('#ladder circle.slot').count()) - 1);
    await page.keyboard.down('Control');
    await page.mouse.move((await center(page, '#ladder .hotring')).x, (await center(page, '#ladder .hotring')).y);
    await page.mouse.up();
    await page.keyboard.up('Control');
    await expect.poll(async () => (await getIl(page)).match(/X1/g)?.length).toBe(2);
    await expect(page.locator('#toast')).toContainText('Kopyalandı');
    // taşı: X0'ı son satıra
    const n = contactLines(await getIl(page)).length;
    await pickUp(page, await center(page, '#ladder rect.hit[data-g="c"]', 0));
    await moveToSlot(page, (await page.locator('#ladder circle.slot').count()) - 1);
    await page.mouse.up();
    await expect(page.locator('#toast')).toContainText('Taşındı');
    expect(contactLines(await getIl(page)).length).toBe(n);
    expect(errs.list).toEqual([]);
  });

  test('panodaki parçaya tıklama: seçilinin yanına ekler, adres kutusu odaklanır', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, EX.seal, 'muh');
    await page.locator('#ladder rect.hit[data-g="c"]').first().click();
    const before = contactLines(await getIl(page)).length;
    await page.locator('button.part[data-part="P"]').click();
    await expect.poll(async () => contactLines(await getIl(page)).length).toBe(before + 1);
    expect(await getIl(page)).toMatch(/ANDP X0/);
    await expect(page.locator('#prop-op')).toBeFocused();
    // çıkış parçası: seçili satıra çıkış ekler
    await page.locator('button.part[data-part="TMR"]').click();
    await expect.poll(() => getIl(page)).toMatch(/TMR T0 K50/);
    expect(errs.list).toEqual([]);
  });
});

test.describe('özellikler paneli', () => {
  test('adres yaz, hatalı adreste uyarı; kontak türü değiştir; etiket', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, EX.seal, 'muh');
    await page.locator('#ladder rect.hit[data-g="c"]').first().click();
    const op = page.locator('#prop-op');
    await expect(op).toHaveValue('X0');
    await op.fill('X8');
    await expect(op).toHaveClass(/bad/);
    await expect(page.locator('.props .errmsg')).toContainText('SEKİZLİK');
    await op.fill('X5');
    await expect(op).not.toHaveClass(/bad/);
    expect(await getIl(page)).toMatch(/^LD X5$/m);
    await page.locator('.props .kinds button[title^="Kapalı kontak"]').click();
    await expect.poll(() => getIl(page)).toMatch(/^LDI X5$/m);
    await page.locator('.props input[placeholder^="ör. start"]').fill('acil');
    await expect.poll(() => getIl(page)).toMatch(/^#X5 acil$/m);
    await expect(page.locator('#ladder text.lbl', { hasText: 'acil' })).toBeVisible();
    // çıkış: tür değişince işlenen uyumlu hâle gelir
    await page.locator('#ladder rect.hit[data-g="o"]').first().click();
    await page.locator('.props .kinds button', { hasText: 'TMR' }).click();
    await expect.poll(() => getIl(page)).toMatch(/TMR T\d+ K50/);
    await expect(page.locator('.props .tipline', { hasText: '100 ms taban' })).toBeVisible();
    expect(errs.list).toEqual([]);
  });
});

test.describe('klavye', () => {
  test('ok tuşları, Enter ile hızlı ekleme, Delete, Ctrl+Z / Ctrl+Y', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, 'LD X0\nAND X1\nOUT Y0\nEND', 'kb');
    await page.locator('#ladder rect.hit[data-g="c"]').first().click();
    const first = await sel(page);
    await expect(page.locator('[data-testid="ladder"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    const second = await sel(page);
    expect(second).not.toBe(first);
    await expect(page.locator(`#ladder rect.hit.sel[data-sel="${second}"]`)).toHaveCount(1);
    await page.keyboard.press('ArrowLeft');
    expect(await sel(page)).toBe(first);
    // hızlı ekleme: paralel
    await page.keyboard.press('Enter');
    const q = page.locator('.quick input');
    await expect(q).toBeFocused();
    await q.fill('|X5');
    await q.press('Enter');
    await expect(q).toHaveCount(0);
    await expect.poll(() => getIl(page)).toMatch(/^OR X5$/m);
    // geçersiz komut: kutu açık kalır, hata yazar
    await page.keyboard.press('Enter');
    await page.locator('.quick input').fill('X9');
    await page.locator('.quick input').press('Enter');
    await expect(page.locator('.quick small.bad')).toContainText('sekizlik');
    await page.locator('.quick input').press('Escape');
    // harf yazınca kutu doğrudan açılır
    await page.locator('[data-testid="ladder"]').focus();
    await page.keyboard.press('/');
    await expect(page.locator('.quick input')).toHaveValue('/');
    await page.keyboard.type('X6');
    await page.keyboard.press('Enter');
    await expect.poll(() => getIl(page)).toMatch(/ANI X6/);
    // sil, geri al, yinele
    await page.keyboard.press('Delete');
    await expect.poll(() => getIl(page)).not.toMatch(/X6/);
    await page.keyboard.press('Control+z');
    await expect.poll(() => getIl(page)).toMatch(/ANI X6/);
    await page.keyboard.press('Control+y');
    await expect.poll(() => getIl(page)).not.toMatch(/X6/);
    expect(errs.list).toEqual([]);
  });

  test('0–7 tuşları girişe basar; F5 RUN, boşluk duraklatır', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, EX.seal, 'muh');
    await page.locator('body').click({ position: { x: 5, y: 600 } });
    await page.keyboard.press('F5');
    await expect.poll(() => page.evaluate(() => window.plc.state().mode)).toBe('run');
    await page.keyboard.down('0');
    await expect(page.locator('.xbtn[data-x="X0"]')).toHaveClass(/on/);
    await page.keyboard.up('0');
    await expect(page.locator('.lamp[data-y="Y0"]')).toHaveClass(/on/);
    await page.keyboard.press(' ');
    await expect.poll(() => page.evaluate(() => window.plc.state().mode)).toBe('pause');
    expect(errs.list).toEqual([]);
  });
});

test.describe('IL düzenleyici', () => {
  test('IL yazınca ladder güncellenir; çıkıştan sonra OR ladder\'a çevrilemez ama çalışır', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, EX.seal, 'muh');
    await page.locator('.bottom .ptabs button', { hasText: 'IL' }).click();
    const cm = page.locator('.cm-content');
    await cm.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText('LD X7\nOUT Y6\nEND');
    await expect.poll(() => getIl(page)).toBe('LD X7\nOUT Y6\nEND');
    await expect(page.locator('#ladder text.op', { hasText: 'X7' })).toBeVisible();
    await expect(page.locator('#ladder text.op', { hasText: 'Y6' })).toBeVisible();
    // Ctrl+Z editörde de uygulama geri alma yığınını kullanır
    await page.keyboard.press('Control+z');
    await expect.poll(() => getIl(page)).toMatch(/ANI X1/);
    // ladder'a çevrilemeyen ama çalışan kalıp
    await cm.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText('LD X0\nOUT Y0\nOR X1\nOUT Y1\nEND');
    await expect(page.locator('.ladder-empty')).toBeVisible();
    await expect(page.locator('.ilnote.bad')).toBeVisible();
    const s = await page.evaluate(() => {
      window.plc.stop();
      window.plc.set('X1', 1);
      return window.plc.advance(30);
    });
    expect(s.Y1).toBe(1);
    expect(s.Y0).toBe(0);
    expect(errs.list).toEqual([]);
  });

  test('hatalı IL: Sorunlar sekmesi sayar, tıklayınca IL satırına gider', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, 'LD X0\nOUT Y0\nLD X8\nOUT Y1\nEND', 'hata');
    await page.locator('.bottom .ptabs button', { hasText: 'Sorunlar' }).click();
    const d = page.locator('.diag.error').first();
    await expect(d).toContainText('X8');
    await d.click();
    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(page.locator('#ladder text.op.bad', { hasText: 'X8' })).toBeVisible();
    expect(errs.list).toEqual([]);
  });
});
