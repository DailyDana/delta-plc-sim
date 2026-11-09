// Uygulama içi diyaloglar. Tarayıcının prompt()/confirm()/alert() pencereleri gömülü tarayıcılarda
// (ör. Claude uygulaması) desteklenmez; hepsi bu Promise tabanlı pencereden geçer.
// Testler window.__dlgAuto = (o) => yanıt ile pencereyi atlayabilir.

import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

export interface DialogOpts {
  title: string;
  msg?: string;
  /** Varsa metin kutusu (varsayılan değer) */
  input?: string;
  /** Varsa salt okunur metin alanı (kopyalanabilir) */
  text?: string;
  okText?: string;
  cancelText?: string | null;
  danger?: boolean;
}
type Answer = string | boolean | null;

interface DlgState {
  cur: (DialogOpts & { resolve: (a: Answer) => void }) | null;
}
const useDlg = create<DlgState>(() => ({ cur: null }));

declare global {
  interface Window {
    __dlgAuto?: (o: DialogOpts) => Answer;
  }
}

export function openDialog(o: DialogOpts): Promise<Answer> {
  if (typeof window.__dlgAuto === 'function') return Promise.resolve(window.__dlgAuto(o));
  const prev = useDlg.getState().cur;
  if (prev) prev.resolve(null);
  return new Promise((resolve) => useDlg.setState({ cur: { ...o, resolve } }));
}

export async function askText(title: string, def: string, msg?: string): Promise<string | null> {
  const r = await openDialog({ title, input: def, okText: 'Tamam', ...(msg ? { msg } : {}) });
  return typeof r === 'string' && r.trim() ? r.trim() : null;
}
export async function askConfirm(title: string, msg: string, o: { okText?: string; danger?: boolean } = {}): Promise<boolean> {
  return (await openDialog({ title, msg, okText: o.okText ?? 'Evet', danger: !!o.danger })) === true;
}
export async function showText(title: string, text: string, msg?: string): Promise<void> {
  await openDialog({ title, text, okText: 'Kapat', cancelText: null, ...(msg ? { msg } : {}) });
}

/** Panoya kopyala; izin yoksa metni pencerede göster (gömülü tarayıcı) */
export async function copyText(text: string, title = 'Metin'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    await showText(title, text, 'Panoya otomatik kopyalanamadı. Metni seçip Ctrl+C ile kopyala.');
    return false;
  }
}

export function DialogHost() {
  const cur = useDlg((s) => s.cur);
  const [val, setVal] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const inp = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!cur) return;
    setVal(cur.input ?? '');
    const t = setTimeout(() => {
      const el = inp.current ?? box.current?.querySelector<HTMLElement>('button.primary');
      el?.focus();
      if (inp.current && 'select' in inp.current) inp.current.select();
    }, 10);
    return () => clearTimeout(t);
  }, [cur]);

  if (!cur) return null;
  const finish = (a: Answer) => {
    useDlg.setState({ cur: null });
    cur.resolve(a);
  };
  const ok = () => finish(cur.input !== undefined ? val : true);
  const cancel = () => finish(cur.input !== undefined ? null : false);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      ok();
    } else if (e.key === 'Tab' && box.current) {
      // odak pencerenin içinde kalsın
      const f = [...box.current.querySelectorAll<HTMLElement>('input,textarea,button')];
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        f[f.length - 1]?.focus();
      } else if (!e.shiftKey && i === f.length - 1) {
        e.preventDefault();
        f[0]?.focus();
      }
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <div className={'dialog' + (cur.text !== undefined ? ' wide' : '')} role="dialog" aria-modal="true" aria-labelledby="dlg-t" ref={box} onKeyDown={onKey} id="dlg">
        <h2 id="dlg-t">{cur.title}</h2>
        {cur.msg && <p>{cur.msg}</p>}
        {cur.input !== undefined && <input className="input" ref={(el) => void (inp.current = el)} value={val} onChange={(e) => setVal(e.target.value)} />}
        {cur.text !== undefined && <textarea className="input" readOnly ref={(el) => void (inp.current = el)} value={cur.text} rows={12} />}
        <footer>
          {cur.cancelText !== null && (
            <button className="btn" onClick={cancel}>
              {cur.cancelText ?? 'Vazgeç'}
            </button>
          )}
          <button className={'btn primary' + (cur.danger ? ' danger-fill' : '')} onClick={ok}>
            {cur.okText ?? 'Tamam'}
          </button>
        </footer>
      </div>
    </div>
  );
}
