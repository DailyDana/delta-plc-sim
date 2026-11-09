// Kısıtlı ortam (gömülü / gizli tarayıcı taklidi): localStorage erişimi hata atar, yerel diyaloglar çalışmaz.
import { expect, test } from '@playwright/test';
import { answerDialog, collectErrors, getIl } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Depolama erişimi engellendi', 'SecurityError');
      },
    });
    const w = window as unknown as { __native: number };
    w.__native = 0;
    window.prompt = () => (w.__native++, null);
    window.confirm = () => (w.__native++, false);
    window.alert = () => void w.__native++;
  });
});

test('depolama yokken uygulama açılır, uyarır; kayıt, sekme ve diyaloglar çalışır', async ({ page }) => {
  const errs = collectErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => window.PLC_APP_OK === true);
  expect(await page.evaluate(() => {
    try {
      void window.localStorage;
      return false;
    } catch {
      return true;
    }
  })).toBe(true);
  await expect(page.locator('.xbtn')).toHaveCount(16);
  await expect(page.locator('#tabs .tab')).toHaveCount(1);
  await expect(page.locator('#storeWarn')).toBeVisible();
  await expect(page.locator('.storewarn')).toContainText('yalnızca bu oturumda');

  // kaydet: uygulama içi pencere, bellekte tutulur
  await page.locator('[data-testid="ladder"]').focus();
  await page.keyboard.press('Control+s');
  await answerDialog(page, 'Deneme');
  await expect(page.locator('#toast')).toContainText('yalnızca bu oturumda');
  await page.locator('.side.left .ptabs button', { hasText: 'Proje' }).click();
  await expect(page.locator('.pitem .nm', { hasText: 'Deneme' })).toBeVisible();

  // tema ve yakınlaştırma depolamasız hata vermez
  await page.getByRole('button', { name: 'Tema' }).click();
  await page.getByRole('button', { name: 'Tema' }).click();
  await page.getByRole('button', { name: 'Yakınlaş' }).click();

  // yeni sekme, değiştir, kapat (onay penceresi)
  await page.locator('#tabAdd').click();
  await page.evaluate(() => window.__store!.getState().setIlText('LD X0\nAND X1\nAND X2\nOUT Y0\nLD X3\nOUT Y1\nEND'));
  await page.locator('#tabs .tab.active .x').click();
  await expect(page.locator('#dlg')).toContainText('kaydedilmedi');
  await answerDialog(page, true);
  await expect(page.locator('#tabs .tab')).toHaveCount(1);

  // ad değiştir
  await page.locator('#tabs .tab').first().dblclick();
  await answerDialog(page, 'Yeni ad');
  await expect(page.locator('#tabs .tab .tname')).toHaveText('Yeni ad');

  // ladder'ı metin olarak göster (Dosya menüsü)
  await page.locator('#mFile').click();
  await page.getByRole('menu').getByText("Ladder'ı metin olarak göster").click();
  await expect(page.locator('#dlg textarea')).toHaveValue(/X0/);
  await page.locator('#dlg button.primary').click();

  // yedek metni (indirme engelli olabilir)
  await page.locator('.side.left .btn', { hasText: 'Metin' }).click();
  await expect(page.locator('#dlg textarea')).toHaveValue(/"Deneme"/);
  await page.locator('#dlg button.primary').click();

  // simülasyon yine çalışır
  const s = await page.evaluate(() => {
    window.plc.stop();
    return window.plc.press('X0', 50);
  });
  expect(s.mode).toBe('pause');
  expect(await getIl(page)).toMatch(/END/);

  expect(await page.evaluate(() => (window as unknown as { __native: number }).__native)).toBe(0);
  expect(errs.list).toEqual([]);
});
