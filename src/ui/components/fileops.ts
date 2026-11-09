// Dosya ve sekme işlemleri (diyalog gerektirenler): kaydet, kapat, dışa aktar, paylaş.
import { drawLadderText, encodeShare } from '../../core';
import { isDirty, useStore } from '../state/store';
import { askConfirm, askText, copyText, showText } from './dialogs';

export const fileSafe = (s: string): string => s.replace(/[\\/:*?"<>|]+/g, '_');

/** İndir; gömülü tarayıcıda indirme engelliyse kullanıcı Metin ile kopyalayabilir */
export function downloadText(name: string, text: string, type = 'text/plain'): void {
  try {
    const blob = new Blob([type === 'text/plain' ? text.replace(/\r?\n/g, '\r\n') : text], { type: type + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  } catch {
    void showText(name, text, 'İndirme başlatılamadı. Metni kopyalayıp bir dosyaya yapıştırabilirsin.');
  }
}

export function openOrSwitch(name: string): void {
  const s = useStore.getState();
  const i = s.tabs.findIndex((t) => t.savedAs === name);
  if (i >= 0) s.switchTab(i);
  else if (s.lib[name]) s.openInNewTab(name, s.lib[name]!.il, name);
}

export async function saveCurrent(asNew = false): Promise<void> {
  const s = useStore.getState();
  const t = s.tabs[s.active]!;
  let name = t.savedAs;
  if (!name || asNew) {
    name = await askText(asNew ? 'Farklı kaydet' : 'Kaydet', asNew && t.savedAs ? t.savedAs + ' kopya' : t.name, 'Kayıt adı:');
    if (!name) return;
    const lib = useStore.getState().lib;
    if (lib[name] && name !== t.savedAs && !(await askConfirm('Üzerine yazılsın mı?', `"${name}" adında bir kayıt zaten var.`, { okText: 'Üzerine yaz', danger: true }))) return;
  }
  const now = useStore.getState();
  if (now.tabs[now.active]?.id !== t.id) return; // pencere açıkken sekme değiştiyse yanlış devreyi kaydetme
  now.saveAs(name);
}

export async function closeTab(i: number): Promise<void> {
  const s = useStore.getState();
  const t = s.tabs[i];
  if (!t) return;
  if (isDirty(t) || (!t.savedAs && t.il.split('\n').length > 6)) {
    const ok = await askConfirm('Sekme kapatılsın mı?', `"${t.name}" kaydedilmedi; kapatırsan değişiklikler kaybolur.\nSaklamak için Vazgeç'e bas, sonra Kaydet (Ctrl+S).`, { okText: 'Kaydetmeden kapat', danger: true });
    if (!ok) return;
  }
  const j = useStore.getState().tabs.findIndex((x) => x.id === t.id);
  if (j >= 0) useStore.getState().removeTab(j);
}

export async function renameTabDlg(i: number): Promise<void> {
  const t = useStore.getState().tabs[i];
  if (!t) return;
  const n = await askText('Sekmeyi yeniden adlandır', t.name);
  if (n) useStore.getState().renameTab(i, n);
}

export function exportIl(): void {
  const s = useStore.getState();
  const t = s.tabs[s.active]!;
  downloadText(fileSafe(t.name) + '.txt', t.il);
}

/** Paylaşım bağlantısı: aynı sitede devreyi açar (#il=…) */
export function shareUrl(): string {
  const s = useStore.getState();
  const t = s.tabs[s.active]!;
  const p = new URLSearchParams();
  p.set('il', encodeShare(t.il));
  p.set('ad', t.name);
  return location.origin + location.pathname + '#' + p.toString();
}

export async function share(): Promise<void> {
  const url = shareUrl();
  if (await copyText(url, 'Paylaşım bağlantısı')) useStore.getState().showToast('Bağlantı panoya kopyalandı');
}

export async function showLadderText(): Promise<void> {
  const l = useStore.getState().doc.ladder;
  if (!l) return void useStore.getState().showToast('Ladder görünümü yok', true);
  await showText('Ladder (metin)', drawLadderText(l), 'Mesaja, rapora ya da ödeve yapıştırılabilir.');
}
