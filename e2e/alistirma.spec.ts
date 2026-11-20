// Alıştırma modu: listeden açma, görev paneli, kontrol (yanlış/doğru), ilerleme kalıcılığı, dalga karşılaştırması,
// bağlantıyla açma, depolamasız çalışma, referans çözümün sayfaya sızmaması, senaryoyu canlı oynatma.
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, openClean } from './helpers';

const WRONG = 'LD X0\nANI X1\nOUT Y0\nEND'; // mühürleme unutulmuş
const RIGHT = '#X0 start\n#X1 stop\n#Y0 motor\nLD X0\nSET Y0\nLD X1\nRST Y0\nEND'; // referanstan farklı yapı (SET/RST)
/** Referans çözümün ayırt edici satır dizisi (başlangıç örneği de aynı IL'i içerdiğinden o sekme kapatılır) */
const REF_RE = /OR\s+Y0\s+ANI\s+X1/;

const openList = (page: Page) => page.locator('.side.left .ptabs button', { hasText: 'Alıştırma' }).click();
const item = (page: Page, id: string) => page.locator(`.ex-item[data-exercise="${id}"]`);
const setIl = (page: Page, il: string) => page.evaluate((x) => window.__store!.getState().setIlText(x), il);

/** Alıştırma dışındaki sekmeleri kapat */
const onlyExerciseTabs = (page: Page) =>
  page.evaluate(() => {
    const st = window.__store!;
    for (let i = st.getState().tabs.length - 1; i >= 0; i--) if (!st.getState().tabs[i]!.exercise) st.getState().removeTab(i);
  });

test('listeden alıştırma açılır, görev metni ve G/Ç tablosu görünür; aynı alıştırma ikinci kez yeni sekme açmaz', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await openList(page);
  await expect(page.locator('.ex-list .sect h3').first()).toContainText('Düzey 1');
  await expect(page.locator('.ex-item')).toHaveCount(12);
  await item(page, 'muhurleme').click();
  await expect(page.locator('#tabs .tab')).toHaveCount(2);
  await expect(page.locator('#tabs .tab.active .tname')).toHaveText(/Mühürleme/);
  const task = page.locator('.ex-task');
  await expect(task).toBeVisible();
  await expect(task.locator('.ex-text')).toContainText('Start butonuna (X0)');
  await expect(task.locator('.ex-io')).toContainText('stop');
  await expect(page.getByRole('button', { name: /Kontrol et/ })).toBeVisible();
  // başlangıç IL'i: etiketler var, çözüm yok
  const il = await page.evaluate(() => window.plc.getIL());
  expect(il).toMatch(/#X0 start/);
  expect(il).not.toMatch(REF_RE);
  // ikinci tıklama aynı sekmeye geçer
  await page.locator('#tabs .tab').first().click();
  await expect(page.locator('.ex-task')).toHaveCount(0);
  await item(page, 'muhurleme').click();
  await expect(page.locator('#tabs .tab')).toHaveCount(2);
  await expect(page.locator('.ex-task')).toBeVisible();
  // ipucu: her tıklamada bir sonraki
  await page.locator('#exHint').click();
  await expect(page.locator('.ex-hints li')).toHaveCount(1);
  await expect(page.locator('#exHint')).toContainText('1/2');
  await page.locator('#exHint').click();
  await expect(page.locator('#exHint')).toBeDisabled();
  // komut paletinde bulunur
  await page.keyboard.press('Control+k');
  await page.locator('.palette input').fill('alıştırma flaşör');
  await expect(page.locator('.palette li').first()).toContainText('Alıştırma: Flaşör');
  await page.keyboard.press('Enter');
  await expect(page.locator('#tabs .tab.active .tname')).toHaveText(/Flaşör/);
  expect(errs.list).toEqual([]);
});

test('yanlış çözüm: ilgili senaryo ✗ ve ileti görünür, çözüldü sayılmaz; karşılaştırma dalgası çizilir', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await openList(page);
  await item(page, 'muhurleme').click();
  await setIl(page, WRONG);
  // motor durumu denetimden etkilenmez
  const before = await page.evaluate(() => window.plc.state().mode);
  await page.locator('#exCheck').click();
  const res = page.locator('.ex-res');
  await expect(res).toHaveAttribute('data-state', 'failed');
  await expect(page.locator('.ex-sc.bad').first()).toContainText("1,2 s'de Y0 (motor) çalışıyor olmalıydı");
  await expect(page.locator('.ex-sc.ok')).not.toHaveCount(0);
  expect(await page.evaluate(() => window.plc.state().mode)).toBe(before);
  await expect(item(page, 'muhurleme')).toHaveAttribute('data-solved', '0');
  expect((await page.evaluate(() => window.plc.exerciseProgress())).solved).toEqual([]);

  // senaryoya tıkla → alt panelde karşılaştırma
  await page.locator('.ex-sc.bad').first().click();
  const cmp = page.locator('.ex-compare');
  await expect(cmp).toBeVisible();
  await expect(cmp).toHaveAttribute('data-passed', '0');
  await expect(page.locator('.ex-cmp-info .bad')).toContainText('İlk sorun 1,2 s');
  await expect(page.locator('.ex-diffs')).toContainText('Ayrışma: Y0 (motor)');
  // satırlar: girişler üstte, çıkışlar altta, etiketleriyle
  expect(await page.locator('.ex-compare .wave-name').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key))).toEqual(['X0', 'X1', 'Y0']);
  await expect(page.locator('.ex-compare .wave-name[data-key="Y0"] .l')).toHaveText('motor');
  // ilk sorunun anında A imleci
  await expect(page.locator('.ex-compare .wave-meas .ca')).toHaveAttribute('data-a', '1200');
  // canvas boş değil: birden çok renk var
  const colors = await page.locator('.ex-compare canvas.wave-rows').evaluate((c) => {
    const cv = c as HTMLCanvasElement;
    const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
    const set = new Set<string>();
    for (let i = 0; i < d.length; i += 16) set.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return set.size;
  });
  expect(colors).toBeGreaterThan(4);
  // geçen senaryo da açılabilir
  const okIdx = await page.locator('.ex-sc.ok').first().getAttribute('data-scenario');
  await page.locator('.ex-sc.ok').first().click();
  await expect(cmp).toHaveAttribute('data-scenario', okIdx!);
  await expect(page.locator('.ex-cmp-info .ok')).toContainText('geçti');
  // program değişince sonuç eski diye işaretlenir
  await setIl(page, WRONG.replace('END', 'NOP\nEND'));
  await expect(page.locator('.ex-stale')).toBeVisible();
  expect(errs.list).toEqual([]);
});

test('doğru çözüm: hepsi ✓, liste işaretlenir; yenileyince işaret ve öğrencinin IL\'i durur', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await openList(page);
  await item(page, 'muhurleme').click();
  await setIl(page, RIGHT);
  await page.locator('#exCheck').click();
  await expect(page.locator('.ex-res')).toHaveAttribute('data-state', 'passed');
  await expect(page.locator('.ex-sc.bad')).toHaveCount(0);
  await expect(page.locator('.ex-result.ok')).toContainText('Tüm senaryolar geçti');
  await expect(page.locator('.ex-solved')).toBeVisible();
  await expect(item(page, 'muhurleme')).toHaveAttribute('data-solved', '1');
  await expect(page.locator('.ex-result.ok [data-next]')).toHaveAttribute('data-next', 'iki-yerden');

  await page.reload();
  await page.waitForFunction(() => window.PLC_APP_OK === true);
  await openList(page);
  await expect(item(page, 'muhurleme')).toHaveAttribute('data-solved', '1');
  // sekme alıştırmaya bağlı kalır
  await expect(page.locator('#tabs .tab.active .tname')).toHaveText(/Mühürleme/);
  await expect(page.locator('.ex-task')).toBeVisible();
  expect(await page.evaluate(() => window.plc.getIL())).toBe(RIGHT);
  // sekmeyi kapatıp listeden açınca kaldığı yerden
  await page.locator('#tabs .tab.active .x').click();
  await expect(page.locator('#dlg')).toHaveCount(0);
  await item(page, 'muhurleme').click();
  expect(await page.evaluate(() => window.plc.getIL())).toBe(RIGHT);
  // sonraki alıştırma kısayolu
  await page.locator('#exCheck').click();
  await page.locator('.ex-result.ok [data-next]').click();
  await expect(page.locator('#tabs .tab.active .tname')).toHaveText(/İki yerden/);
  // baştan başla (onaylı) başlangıç IL'ine döner, geri alınabilir
  await setIl(page, 'LD X0\nOUT Y0\nEND');
  await page.locator('#exRestart').click();
  await page.locator('#dlg button.primary').click();
  expect(await page.evaluate(() => window.plc.getIL())).toMatch(/^; Alıştırma: İki yerden/);
  await page.locator('[data-testid="ladder"]').focus();
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => window.plc.getIL())).toBe('LD X0\nOUT Y0\nEND');
  expect(errs.list).toEqual([]);
});

test('#alistirma=muhurleme bağlantısı alıştırmayı açar (sayfa açıkken ve ilk yüklemede)', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await page.evaluate(() => (location.hash = '#alistirma=muhurleme'));
  await expect(page.locator('#tabs .tab.active .tname')).toHaveText(/Mühürleme/);
  await expect(page.locator('.ex-task')).toHaveAttribute('data-exercise', 'muhurleme');
  await page.goto('about:blank');
  await page.goto('/#alistirma=sayici');
  await page.waitForFunction(() => window.PLC_APP_OK === true);
  await expect(page.locator('.ex-task')).toHaveAttribute('data-exercise', 'sayici');
  // bilinmeyen kimlik: bildirim, sekme açılmaz
  const n = await page.locator('#tabs .tab').count();
  await page.evaluate(() => (location.hash = '#alistirma=yok-boyle'));
  await expect(page.locator('#toast')).toContainText('bulunamadı');
  await expect(page.locator('#tabs .tab')).toHaveCount(n);
  expect(errs.list).toEqual([]);
});

test('referans çözüm DOM\'a ve window.plc çıktılarına sızmaz', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await page.evaluate(() => (location.hash = '#alistirma=muhurleme'));
  await onlyExerciseTabs(page);
  await expect(page.locator('#tabs .tab')).toHaveCount(1);
  await setIl(page, WRONG);
  await page.locator('#exCheck').click();
  await page.locator('.ex-sc.bad').first().click();
  await page.locator('#exHint').click();
  await page.locator('#exHint').click();
  await expect(page.locator('.ex-compare')).toBeVisible();
  const html = await page.evaluate(() => document.documentElement.outerHTML + '\n' + document.body.innerText);
  expect(html).not.toMatch(REF_RE);
  const out = await page.evaluate(() =>
    JSON.stringify([window.plc.exercises(), window.plc.openExercise('muhurleme'), window.plc.checkExercise(), window.plc.exerciseProgress(), window.__store!.getState().tabs]),
  );
  expect(out).not.toMatch(REF_RE);
  expect(out).not.toMatch(/solutionIl/);
  expect(errs.list).toEqual([]);
});

test('senaryoyu oynat: olaylar gerçek motora PLC zamanıyla uygulanır', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await openList(page);
  await item(page, 'muhurleme').click();
  await setIl(page, RIGHT);
  await page.locator('#exCheck').click();
  await page.locator('.ex-sc[data-scenario="0"]').click();
  await page.locator('#exPlay').click();
  await expect(page.locator('#exPlay')).toHaveAttribute('data-playing', '1');
  // belirlenimli ilerlet: 1,2 s'de motor çalışıyor, 2,5 s'de durmuş
  const s1 = await page.evaluate(() => window.plc.advance(1200));
  expect(s1.Y0).toBe(1);
  const s2 = await page.evaluate(() => window.plc.advance(1300));
  expect(s2.Y0 ?? 0).toBe(0);
  const tr = await page.evaluate(() => window.plc.trace(['X0', 'X1']));
  const near = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]!) <= 30);
  expect(near(tr.signals.X0!.t, [500, 800]), JSON.stringify(tr.signals.X0)).toBe(true);
  expect(near(tr.signals.X1!.t, [2000, 2200]), JSON.stringify(tr.signals.X1)).toBe(true);
  await page.evaluate(() => window.plc.advance(1000));
  await expect(page.locator('#exPlay')).not.toHaveAttribute('data-playing', '1');
  expect(errs.list).toEqual([]);
});

test('depolama kısıtlıyken alıştırma açılır, kontrol edilir, ilerleme bellekte durur', async ({ page }) => {
  // restricted.spec.ts ile aynı yöntem: localStorage erişimi hata atar
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Depolama erişimi engellendi', 'SecurityError');
      },
    });
  });
  const errs = collectErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => window.PLC_APP_OK === true);
  await expect(page.locator('#storeWarn')).toBeVisible();
  await openList(page);
  await item(page, 'muhurleme').click();
  await expect(page.locator('.ex-task')).toBeVisible();
  await setIl(page, RIGHT);
  await page.locator('#exCheck').click();
  await expect(page.locator('.ex-res')).toHaveAttribute('data-state', 'passed');
  await expect(item(page, 'muhurleme')).toHaveAttribute('data-solved', '1');
  const p = await page.evaluate(() => window.plc.exerciseProgress());
  expect(p.solved).toEqual(['muhurleme']);
  expect(p.il.muhurleme).toBe(RIGHT);
  expect(errs.list).toEqual([]);
});

test('alıştırma sekmesinde kaydet ve geri al çalışır, sekme alıştırmaya bağlı kalır', async ({ page }) => {
  const errs = collectErrors(page);
  await openClean(page);
  await openList(page);
  await item(page, 'set-rst').click();
  await setIl(page, 'LD X0\nSET Y0\nEND');
  await page.locator('[data-testid="ladder"]').focus();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#dlg')).toBeVisible();
  await page.locator('#dlg input').fill('SET-RST denemem');
  await page.locator('#dlg button.primary').click();
  await expect(page.locator('#tabs .tab.active .tname')).toHaveText('SET-RST denemem');
  await expect(page.locator('.ex-task')).toHaveAttribute('data-exercise', 'set-rst');
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => window.plc.getIL())).toMatch(/^; Alıştırma: SET\/RST/);
  expect(errs.list).toEqual([]);
});
