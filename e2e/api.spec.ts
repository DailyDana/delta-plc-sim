// window.plc API, giriş zamanlaması (kısa basış kilidi, arka plan yetişme) ve bağlantıyla açma.
import { expect, test } from '@playwright/test';
import { EXAMPLES } from '../src/core/examples';
import { encodeShare } from '../src/core/share';
import { collectErrors, EX, getIl, loadOnly, openClean, tabNames } from './helpers';

const ex = (start: string) => EXAMPLES.find((e) => e.name.startsWith(start))!.il;

test.describe('window.plc API', () => {
  test('API var, load yeni sekmede açar, state() düz nesne', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    const keys = await page.evaluate(() => Object.keys(window.plc).sort());
    expect(keys).toEqual(expect.arrayContaining(['load', 'getIL', 'run', 'pause', 'stop', 'set', 'press', 'advance', 'state']));
    expect(await page.evaluate(() => typeof window.PLC.app.state)).toBe('function');
    const r = await page.evaluate((il) => window.plc.load(il, 'muh'), EX.seal);
    expect(r.ok).toBe(true);
    expect(r.rungs).toBe(1);
    expect(await tabNames(page)).toContain('muh');
    const s = await page.evaluate(() => window.plc.press('X0', 50));
    expect(s.mode).toBe('pause');
    expect(s.Y0).toBe(1);
    expect(typeof s.scan).toBe('number');
    expect(typeof s.t).toBe('number');
    expect(await getIl(page)).toMatch(/LD X0/);
    expect(errs.list).toEqual([]);
  });

  test('kısa basış: iki tarama arasında bas-bırak yine görülür', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, EX.seal, 'muh');
    const r = await page.evaluate(() => {
      window.plc.run();
      window.__engine!.setInput(0, true);
      window.__engine!.setInput(0, false); // arada hiç tarama yok
      const a = window.plc.advance(10);
      const b = window.plc.advance(10);
      return { a, b };
    });
    expect(r.a.Y0).toBe(1);
    expect(r.b.Y0).toBe(1);
    expect(r.b.X0).toBe(0);
    expect(errs.list).toEqual([]);
  });

  test('duraklatılmışken basış sonraki adımda görülür; STOP\'taki basış RUN\'da sayılmaz', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, EX.seal, 'muh');
    // duraklatılmış: basış tarama olmadan etki etmez, Adım'da görülür
    await page.evaluate(() => window.plc.stop());
    await page.locator('#bStep').click();
    await page.evaluate(() => {
      window.__engine!.setInput(0, true);
      window.__engine!.setInput(0, false);
    });
    expect(await page.evaluate(() => window.plc.state().Y0)).toBe(0);
    await page.locator('#bStep').click();
    expect(await page.evaluate(() => window.plc.state().Y0)).toBe(1);
    // STOP'ta basış
    await page.evaluate(() => {
      window.plc.stop();
      window.__engine!.setInput(0, true);
      window.__engine!.setInput(0, false);
    });
    await page.locator('#bRun').click();
    const y = await page.evaluate(() => window.plc.advance(10).Y0);
    expect(y).toBe(0);
    expect(errs.list).toEqual([]);
  });

  test('sayıcı: beş hızlı basış = 5, press ile sıfırlama', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, EX.counter, 'say');
    const r = await page.evaluate(() => {
      window.plc.stop();
      window.plc.advance(10);
      for (let i = 0; i < 5; i++) {
        window.__engine!.setInput(0, true);
        window.__engine!.setInput(0, false);
        window.plc.advance(20);
      }
      const five = window.plc.state();
      const reset = window.plc.press('X1', 50);
      for (let i = 0; i < 3; i++) window.plc.press('X0', 30);
      const three = window.plc.state();
      return { five, reset, three };
    });
    expect(r.five.C0).toBe('5/5');
    expect(r.five.Y0).toBe(1);
    expect(r.reset.C0).toBe('0/5');
    expect(r.reset.Y0).toBe(0);
    expect(r.three.C0).toBe('3/5');
    expect(errs.list).toEqual([]);
  });

  test('yıldız-üçgen: press sonrası yıldız, advance(5600) sonrası üçgen', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, ex('Yıldız'), 'yu');
    const r = await page.evaluate(() => {
      window.plc.stop();
      const a = window.plc.press('X0', 50);
      const b = window.plc.advance(5600);
      return { a, b };
    });
    expect([r.a.Y0, r.a.Y1, r.a.Y2]).toEqual([1, 1, 0]);
    expect([r.b.Y1, r.b.Y2]).toEqual([0, 1]);
    expect(r.b.T0).toBe('50/50');
    expect(r.b.M0).toBe(1);
    expect(errs.list).toEqual([]);
  });

  test('arka plan: 3 s boşluk tek tick\'te yetişir, 10 dk askıdan en çok 60 s', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await loadOnly(page, ex('Tahtadaki'), 'tahta');
    const r = await page.evaluate(() => {
      const e = window.__engine!;
      window.plc.stop();
      window.plc.run();
      e.rewindClock(3000);
      e.tick();
      const t0 = window.plc.state().T0 as string;
      const before = e.machine!.timeMs;
      e.rewindClock(600000);
      e.tick();
      return { t0, dt: e.machine!.timeMs - before };
    });
    const cv = parseInt(r.t0, 10);
    expect(cv).toBeGreaterThanOrEqual(29);
    expect(cv).toBeLessThanOrEqual(31);
    expect(Math.abs(r.dt - 60000)).toBeLessThan(50);
    expect(errs.list).toEqual([]);
  });

  test('bozuk IL ok:false döner; geçersiz giriş adresi hata atar', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    const r = await page.evaluate(() => window.plc.load('LD X0\nFOO Y0', 'bozuk'));
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    const threw = await page.evaluate(() => {
      try {
        window.plc.set('X8', 1);
        return false;
      } catch {
        return true;
      }
    });
    expect(threw).toBe(true);
    expect(errs.list).toEqual([]);
  });
});

test.describe('bağlantıyla açma', () => {
  const LINK_IL = '#X0 başlat\nLD X0\nOUT Y3\nEND';

  test('#il=…&ad=…&run=1 yeni sekmede açar, çalıştırır, adresi temizler; aynısı tekrar açılmaz', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    const n = (await tabNames(page)).length;
    await page.evaluate((h) => {
      location.hash = h;
    }, '#il=' + encodeShare(LINK_IL) + '&ad=' + encodeURIComponent('Bağlantı') + '&run=1');
    await expect(page.locator('#tabs .tab')).toHaveCount(n + 1);
    await expect(page.locator('#tabs .tab.active .tname')).toHaveText('Bağlantı');
    expect(await getIl(page)).toMatch(/OUT Y3/);
    expect(await page.evaluate(() => window.__store!.getState().doc.program.labels.X0)).toBe('başlat');
    expect(await page.evaluate(() => window.plc.state().mode)).toBe('run');
    expect(await page.evaluate(() => location.hash)).toBe('');
    // aynı devre ikinci kez: yeni sekme açılmaz
    await page.evaluate((h) => {
      location.hash = h;
    }, '#il=' + encodeShare(LINK_IL));
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
    await expect(page.locator('#tabs .tab')).toHaveCount(n + 1);
    expect(errs.list).toEqual([]);
  });

  test('ilk açılışta #ornek=4 yıldız-üçgeni açar; Türkçe ad bağlantıda bozulmaz', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await page.goto('/#ornek=4');
    await expect(page.locator('#tabs .tab.active .tname')).toHaveText(/Yıldız/);
    const il = await getIl(page);
    expect(il).toMatch(/TMR T0 K50/);
    expect(il).toMatch(/OUT Y2/);
    expect(await page.evaluate(() => location.hash)).toBe('');
    expect(errs.list).toEqual([]);
  });

  test('bozuk bağlantı çökertmez, uyarı gösterir', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await page.evaluate(() => {
      location.hash = '#il=%%%bozuk';
    });
    await expect(page.locator('#toast')).toBeVisible();
    await expect(page.locator('#tabs .tab')).toHaveCount(1);
    expect(errs.list).toEqual([]);
  });
});
