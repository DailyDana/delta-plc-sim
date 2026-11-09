// Sekmeler, kayıtlar, kalıcılık ve v1 kayıtlarının aktarımı.
import { expect, test } from '@playwright/test';
import { answerDialog, collectErrors, EX, getIl, openClean, tabNames } from './helpers';

test.describe('sekmeler', () => {
  test('yeni sekme, değiştir (devre değişir, STOP\'a döner), adlandır, kapat onayı', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    const firstIl = await getIl(page);
    await page.locator('#tabAdd').click();
    await expect(page.locator('#tabs .tab')).toHaveCount(2);
    await expect(page.locator('#tabs .tab.active .tname')).toHaveText(/Yeni devre/);
    const blankIl = await getIl(page);
    expect(blankIl).not.toBe(firstIl);
    // çalıştır, sonra ilk sekmeye geç → STOP
    await page.locator('#bRun').click();
    expect(await page.evaluate(() => window.plc.state().mode)).toBe('run');
    await page.locator('#tabs .tab').first().click();
    expect(await getIl(page)).toBe(firstIl);
    expect(await page.evaluate(() => window.plc.state().mode)).toBe('stop');
    // çift tık: gerçek uygulama içi diyalogla yeniden adlandır
    await page.locator('#tabs .tab').nth(1).dblclick();
    await answerDialog(page, 'Benim devrem');
    await expect(page.locator('#tabs .tab').nth(1).locator('.tname')).toHaveText('Benim devrem');
    // vazgeç: ad değişmez
    await page.locator('#tabs .tab').nth(1).dblclick();
    await answerDialog(page, false);
    await expect(page.locator('#tabs .tab').nth(1).locator('.tname')).toHaveText('Benim devrem');
    // değiştirilmiş, kaydedilmemiş sekmeyi kapat: onay ister
    await page.locator('#tabs .tab').nth(1).click();
    await page.evaluate(() => window.__store!.getState().setIlText('LD X0\nAND X1\nAND X2\nOUT Y0\nLD X3\nOUT Y1\nEND'));
    await page.locator('#tabs .tab').nth(1).locator('button.x').click();
    await expect(page.locator('#dlg')).toContainText('kaydedilmedi');
    await answerDialog(page, false);
    await expect(page.locator('#tabs .tab')).toHaveCount(2);
    await page.locator('#tabs .tab').nth(1).locator('button.x').click();
    await answerDialog(page, true);
    await expect(page.locator('#tabs .tab')).toHaveCount(1);
    expect(errs.list).toEqual([]);
  });

  test('son sekme kapatılınca boş yeni sekme açılır; __dlgAuto kancası', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await page.evaluate(() => {
      window.__dlgAuto = () => true;
    });
    await page.locator('#tabs .tab .x').first().click();
    await expect(page.locator('#tabs .tab')).toHaveCount(1);
    await expect(page.locator('#tabs .tab .tname')).toHaveText(/Yeni devre/);
    expect(errs.list).toEqual([]);
  });
});

test.describe('kayıtlar ve kalıcılık', () => {
  test('Ctrl+S kaydeder, Proje sekmesinde görünür; yenilemede sekmeler ve kayıtlar korunur', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await page.evaluate((il) => window.plc.load(il, 'muh'), EX.seal);
    await page.locator('[data-testid="ladder"]').focus();
    await page.keyboard.press('Control+s');
    await answerDialog(page, 'Mühürleme kaydım');
    await expect(page.locator('#toast')).toContainText('Kaydedildi');
    await expect(page.locator('#tabs .tab.active .tname')).toHaveText('Mühürleme kaydım');
    await expect(page.locator('#tabs .tab.active .dot')).toHaveCount(0);
    // ikinci Ctrl+S ad sormaz
    await page.evaluate(() => window.__store!.getState().setIlText('LD X0\nOUT Y1\nEND'));
    await expect(page.locator('#tabs .tab.active .dot')).toHaveCount(1);
    await page.keyboard.press('Control+s');
    await expect(page.locator('#dlg')).toHaveCount(0);
    await expect(page.locator('#tabs .tab.active .dot')).toHaveCount(0);
    // Proje sekmesi
    await page.locator('.side.left .ptabs button', { hasText: 'Proje' }).click();
    await expect(page.locator('.pitem .nm', { hasText: 'Mühürleme kaydım' })).toBeVisible();
    // yenile
    const names = await tabNames(page);
    await page.reload();
    await page.waitForFunction(() => window.PLC_APP_OK === true);
    expect(await tabNames(page)).toEqual(names);
    expect(await getIl(page)).toBe('LD X0\nOUT Y1\nEND');
    await page.locator('.side.left .ptabs button', { hasText: 'Proje' }).click();
    await expect(page.locator('.pitem .nm', { hasText: 'Mühürleme kaydım' })).toBeVisible();
    expect(errs.list).toEqual([]);
  });

  test('kayıttan aç: açıksa o sekmeye geçer, değilse yeni sekmede açar; örnek açma', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await page.evaluate(() => window.__store!.getState().saveAs('Kayıt A'));
    await page.locator('#tabAdd').click();
    await page.locator('.side.left .ptabs button', { hasText: 'Proje' }).click();
    const n = (await tabNames(page)).length;
    await page.locator('.pitem', { hasText: 'Kayıt A' }).click();
    await expect(page.locator('#tabs .tab')).toHaveCount(n);
    await expect(page.locator('#tabs .tab.active .tname')).toHaveText('Kayıt A');
    // sekmeyi kapat (kaydedilmiş, değişmemiş: onay yok), sonra kayıttan aç → yeni sekme
    await page.locator('#tabs .tab.active .x').click();
    await expect(page.locator('#tabs .tab')).toHaveCount(n - 1);
    await page.locator('.pitem', { hasText: 'Kayıt A' }).click();
    await expect(page.locator('#tabs .tab')).toHaveCount(n);
    await expect(page.locator('#tabs .tab.active .tname')).toHaveText('Kayıt A');
    // örnek
    await page.locator('.pitem[data-example="3"]').click();
    await expect(page.locator('#tabs .tab.active .tname')).toHaveText(/Yıldız/);
    expect(errs.list).toEqual([]);
  });

  test('kayıt yeniden adlandır ve sil (gerçek diyaloglar)', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await page.evaluate(() => window.__store!.getState().saveAs('Eski ad'));
    await page.locator('.side.left .ptabs button', { hasText: 'Proje' }).click();
    const item = page.locator('.pitem', { hasText: 'Eski ad' });
    await item.hover();
    await item.getByRole('button', { name: 'Yeniden adlandır' }).click();
    await answerDialog(page, 'Yeni ad');
    await expect(page.locator('.pitem .nm', { hasText: 'Yeni ad' })).toBeVisible();
    await expect(page.locator('#tabs .tab.active .tname')).toHaveText('Yeni ad');
    const it2 = page.locator('.pitem', { hasText: 'Yeni ad' });
    await it2.hover();
    await it2.getByRole('button', { name: 'Sil' }).click();
    await answerDialog(page, true);
    await expect(page.locator('.pitem .nm', { hasText: 'Yeni ad' })).toHaveCount(0);
    expect(errs.list).toEqual([]);
  });
});

test.describe('v1 kayıtlarının aktarımı', () => {
  const v1Tabs = {
    tabs: [
      { id: 't1', name: 'Eski sekme 1', il: 'LD X0\nOUT Y0\nEND', base: 'LD X0\nOUT Y0\nEND', savedAs: 'v1 kayıt' },
      { id: 't2', name: 'Eski sekme 2', il: 'LD X1\nOUT Y1\nEND', base: 'LD X1\nOUT Y1\nEND', savedAs: null },
    ],
    active: 1,
    seq: 3,
  };
  const v1Lib = { 'v1 kayıt': { il: 'LD X0\nOUT Y0\nEND', savedAt: 1700000000000 }, 'Başka': { il: 'LD X2\nOUT Y2\nEND', savedAt: 1700000001000 } };

  test('ilk açılışta v1 sekmeleri ve kayıtları gelir, bir kez aktarılır', async ({ page }) => {
    const errs = collectErrors(page);
    await page.goto('/');
    await page.evaluate(
      ([t, l]) => {
        localStorage.clear();
        localStorage.setItem('deltaPlcSim.tabs', t!);
        localStorage.setItem('deltaPlcSim.library', l!);
      },
      [JSON.stringify(v1Tabs), JSON.stringify(v1Lib)],
    );
    await page.reload();
    await page.waitForFunction(() => window.PLC_APP_OK === true);
    expect(await tabNames(page)).toEqual(['Eski sekme 1', 'Eski sekme 2']);
    await expect(page.locator('#tabs .tab.active .tname')).toHaveText('Eski sekme 2');
    await expect(page.locator('#toast')).toContainText('aktarıldı');
    await page.locator('.side.left .ptabs button', { hasText: 'Proje' }).click();
    await expect(page.locator('.pitem .nm', { hasText: 'v1 kayıt' })).toBeVisible();
    await expect(page.locator('.pitem .nm', { hasText: 'Başka' })).toBeVisible();
    // v1 anahtarları silinmez
    expect(await page.evaluate(() => !!localStorage.getItem('deltaPlcSim.tabs'))).toBe(true);
    // sekme kapat → yenile: tekrar aktarılmaz
    await page.evaluate(() => window.__store!.getState().removeTab(0));
    await page.reload();
    await page.waitForFunction(() => window.PLC_APP_OK === true);
    expect(await tabNames(page)).toEqual(['Eski sekme 2']);
    await expect(page.locator('#toast')).toHaveCount(0);
    expect(errs.list).toEqual([]);
  });

  test('.json yedeği içe aktarılır', async ({ page }) => {
    const errs = collectErrors(page);
    await openClean(page);
    await page.locator('.side.left .ptabs button', { hasText: 'Proje' }).click();
    await page.locator('.side.left input[type=file]').setInputFiles({ name: 'yedek.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ library: v1Lib })) });
    await expect(page.locator('#toast')).toContainText('2 kayıt içe aktarıldı');
    await expect(page.locator('.pitem .nm', { hasText: 'Başka' })).toBeVisible();
    // .txt IL dosyası: yeni sekmede açılır
    await page.locator('.side.left input[type=file]').setInputFiles({ name: 'devre.txt', mimeType: 'text/plain', buffer: Buffer.from('LD X3\nOUT Y5\nEND') });
    await expect(page.locator('#tabs .tab.active .tname')).toHaveText('devre');
    expect(errs.list).toEqual([]);
  });
});
