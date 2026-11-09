// Ortak test yardımcıları: hata toplama, temiz başlangıç, IL okuma.
import { expect, type Page } from '@playwright/test';

export interface Errors {
  list: string[];
}

/** Sayfa hatalarını ve konsol hatalarını topla; testin sonunda boş olmalı */
export function collectErrors(page: Page): Errors {
  const e: Errors = { list: [] };
  page.on('pageerror', (err) => e.list.push('pageerror: ' + err.message));
  page.on('console', (m) => {
    if (m.type() === 'error') e.list.push('console: ' + m.text());
  });
  return e;
}

/** Temiz depolamayla aç (önceki testlerden kalan kayıt yok) */
export async function openClean(page: Page, hash = ''): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  if (hash) await page.goto('/' + hash);
  await page.reload();
  await expect(page.locator('#tabs .tab')).toHaveCount(1);
  await page.waitForFunction(() => window.PLC_APP_OK === true);
}

export const getIl = (page: Page): Promise<string> => page.evaluate(() => window.plc.getIL());
export const tabNames = (page: Page): Promise<string[]> => page.locator('#tabs .tab .tname').allTextContents();

/** Bir devreyi yeni sekmede yükle ve ilk sekmeyi kapat (tek sekmeyle çalış) */
export async function loadOnly(page: Page, il: string, name = 'test'): Promise<void> {
  await page.evaluate(
    ([il, name]) => {
      window.plc.load(il!, name);
      const s = window.__store!.getState();
      while (s.tabs.length > 1 && window.__store!.getState().tabs.length > 1) window.__store!.getState().removeTab(0);
    },
    [il, name],
  );
}

/** Uygulama içi diyalog: açık olduğunu bekle, yanıtla */
export async function answerDialog(page: Page, v: string | boolean): Promise<void> {
  const dlg = page.locator('#dlg');
  await expect(dlg).toBeVisible();
  if (v === false) await dlg.getByRole('button', { name: 'Vazgeç' }).click();
  else {
    if (typeof v === 'string') await dlg.locator('input').fill(v);
    await dlg.locator('button.primary').click();
  }
  await expect(dlg).toBeHidden();
}

export function base64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const EX = {
  seal: '#X0 start\n#X1 stop\n#Y0 motor\nLD X0\nOR Y0\nANI X1\nOUT Y0\nEND',
  counter: 'LD X1\nRST C0\nLD X0\nCNT C0 K5\nLD C0\nOUT Y0\nEND',
};
