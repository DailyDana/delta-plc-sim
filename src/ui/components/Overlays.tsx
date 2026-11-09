// Komut paleti (Ctrl+K), yardım penceresi, bildirim (toast) ve depolama uyarısı.
import { useEffect, useMemo, useRef, useState } from 'react';
import { EXAMPLES, PROFILES } from '../../core';
import { useStore } from '../state/store';
import { engine } from '../sim/engine';
import { exportIl, openOrSwitch, saveCurrent, share, showLadderText } from './fileops';

interface Cmd {
  grp: string;
  name: string;
  key?: string;
  run: () => void;
}

function commands(): Cmd[] {
  const s = useStore.getState();
  const c: Cmd[] = [
    { grp: 'Çalıştır', name: 'RUN', key: 'F5', run: () => engine.run() },
    { grp: 'Çalıştır', name: 'Duraklat / devam', key: 'Boşluk', run: () => (engine.mode === 'pause' ? engine.run() : engine.pause()) },
    { grp: 'Çalıştır', name: 'Tek tarama adımı', key: 'F10', run: () => engine.step() },
    { grp: 'Çalıştır', name: 'STOP', key: 'Shift+F5', run: () => engine.stop() },
    { grp: 'Çalıştır', name: 'Güç kes / aç (tüm bellek silinir)', run: () => engine.powerCycle() },
    { grp: 'Dosya', name: 'Kaydet', key: 'Ctrl+S', run: () => void saveCurrent() },
    { grp: 'Dosya', name: 'Farklı kaydet', run: () => void saveCurrent(true) },
    { grp: 'Dosya', name: 'Yeni sekme', key: 'Ctrl+Alt+N', run: () => s.newBlankTab() },
    { grp: 'Dosya', name: "IL'i indir (.txt)", run: exportIl },
    { grp: 'Dosya', name: 'Paylaşım bağlantısını kopyala', run: () => void share() },
    { grp: 'Dosya', name: "Ladder'ı metin olarak göster", run: () => void showLadderText() },
    { grp: 'Görünüm', name: 'Açık / koyu tema', run: () => s.set('theme', s.settings.theme === 'dark' ? 'light' : 'dark') },
    { grp: 'Görünüm', name: 'IL düzenleyici', key: 'Ctrl+J', run: () => (s.set('bottomOpen', true), s.set('bottomTab', 'il')) },
    { grp: 'Görünüm', name: 'İzleme tablosu', run: () => (s.set('bottomOpen', true), s.set('bottomTab', 'watch')) },
    { grp: 'Görünüm', name: 'Sorunlar', run: () => (s.set('bottomOpen', true), s.set('bottomTab', 'problems')) },
    { grp: 'Görünüm', name: 'Alt paneli aç / kapat', run: () => s.set('bottomOpen', !s.settings.bottomOpen) },
    { grp: 'Görünüm', name: 'Yakınlaştırmayı sıfırla (100%)', run: () => s.set('zoom', 1) },
    { grp: 'Yardım', name: 'Yardım ve kısayollar', key: 'F1', run: () => s.setUi({ helpOpen: true }) },
  ];
  for (const p of Object.values(PROFILES)) c.push({ grp: 'Model', name: `Model: ${p.id === 'v1' ? 'v1 (sade)' : 'DVP-' + p.id}`, run: () => s.set('model', p.id) });
  EXAMPLES.forEach((e) => c.push({ grp: 'Örnek', name: e.name, run: () => s.openInNewTab(e.name, e.il) }));
  Object.keys(s.lib).forEach((n) => c.push({ grp: 'Kayıt', name: n, run: () => openOrSwitch(n) }));
  s.tabs.forEach((t, i) => c.push({ grp: 'Sekme', name: t.name, run: () => s.switchTab(i) }));
  return c;
}

const norm = (x: string) => x.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const inp = useRef<HTMLInputElement>(null);
  const all = useMemo(() => (open ? commands() : []), [open]);
  const list = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return all.filter((c) => words.every((w) => norm(c.grp + ' ' + c.name).includes(w))).slice(0, 60);
  }, [q, all]);
  useEffect(() => {
    if (open) {
      setQ('');
      setI(0);
      setTimeout(() => inp.current?.focus(), 10);
    }
  }, [open]);
  if (!open) return null;
  const close = () => useStore.getState().setUi({ paletteOpen: false });
  const run = (c: Cmd | undefined) => {
    if (!c) return;
    close();
    c.run();
  };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Komut paleti">
        <input
          ref={inp}
          value={q}
          placeholder="Komut, örnek ya da kayıt ara…"
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setI(Math.min(list.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setI(Math.max(0, i - 1));
            } else if (e.key === 'Enter') run(list[i]);
          }}
          aria-label="Ara"
        />
        <ul role="listbox">
          {list.map((c, j) => (
            <li key={c.grp + c.name + j} role="option" aria-selected={j === i} className={j === i ? 'on' : ''} onMouseEnter={() => setI(j)} onClick={() => run(c)}>
              <span className="grp">{c.grp}</span>
              <span>{c.name}</span>
              {c.key && <kbd>{c.key}</kbd>}
            </li>
          ))}
          {!list.length && <li className="muted">Sonuç yok</li>}
        </ul>
      </div>
    </div>
  );
}

export function HelpModal() {
  const open = useStore((s) => s.helpOpen);
  if (!open) return null;
  const close = () => useStore.getState().setUi({ helpOpen: false });
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="help-t">
        <h2 id="help-t">Nasıl kullanılır</h2>
        <div className="help">
          <h3>Devre kurmak</h3>
          <ul>
            <li>Soldaki panodan parçayı ladder'a sürükle; mavi noktalar bırakılabilecek yerlerdir. Parçaya tıklarsan seçili öğenin yanına eklenir.</li>
            <li>Ladder'da bir öğe seçip <kbd>Enter</kbd>'a bas ve komut yaz: <code>X1</code> seri kontak, <code>/X2</code> kapalı kontak, <code>|X3</code> paralel, <code>P X4</code> yükselen kenar, <code>OUT Y1</code>, <code>TMR T0 K50</code>, <code>CNT C0 K5</code>.</li>
            <li>Ok tuşlarıyla gezin, <kbd>Delete</kbd> sil, <kbd>Ctrl+D</kbd> çoğalt, <kbd>Alt+↑/↓</kbd> satırı taşı. Ladder'daki parçayı sürükleyerek taşı; <kbd>Ctrl</kbd> basılıysa kopyalar, sol panele bırakırsan siler.</li>
            <li>Alttaki IL sekmesinde komut listesini doğrudan yazabilirsin; ladder anında güncellenir.</li>
          </ul>
          <h3>Çalıştırmak</h3>
          <ul>
            <li><kbd>F5</kbd> RUN, <kbd>Boşluk</kbd> duraklat, <kbd>F10</kbd> tek tarama, <kbd>Shift+F5</kbd> STOP. Akımın geçtiği teller yeşil yanar.</li>
            <li>Girişler: sağdaki X butonlarına bas ya da klavyede <kbd>0</kbd>–<kbd>7</kbd>. Sağ tık girişi kilitler. "Anahtar" kipinde her tıklama 0/1 değiştirir.</li>
            <li>STOP→RUN'da kalıcı olmayan bellek silinir; kalıcı (latched) bölgeler korunur. Güç düğmesi her şeyi siler.</li>
          </ul>
          <h3>Zamanlayıcılar</h3>
          <p>Taban süre modele göre değişir (üst çubukta model seçimi). DVP-ES2'de T0–T126 ve T128–T199 100 ms, T127 1 ms, T200–T239 10 ms; T240–T255 birikimli: akım kesilince değer korunur, RST ile sıfırlanır. <code>TMR T0 K50</code> = 5 s.</p>
          <h3>IL kuralları</h3>
          <p>X/Y adresleri sekizliktir (X0–X7, X10–X17; X8 yoktur). <code>#X0 start</code> satırı cihaza etiket verir, <code>;</code> açıklamadır. Bir satır, çıkış komutundan sonra gelen ilk LD ile başlar.</p>
          <p className="muted">Bu bir öğrenme aracıdır; gerçek PLC'nin yerini tutmaz. Delta Electronics ile bağlantısı yoktur.</p>
        </div>
        <footer>
          <button className="btn primary" onClick={close} autoFocus>
            Kapat
          </button>
        </footer>
      </div>
    </div>
  );
}

export function Toast() {
  const t = useStore((s) => s.toast);
  const [shown, setShown] = useState<typeof t>(null);
  useEffect(() => {
    if (!t) return;
    setShown(t);
    const h = setTimeout(() => setShown(null), t.bad ? 3600 : 2200);
    return () => clearTimeout(h);
  }, [t]);
  if (!shown) return null;
  return (
    <div className={'toast' + (shown.bad ? ' bad' : '')} role="status" aria-live="polite" id="toast">
      {shown.text}
    </div>
  );
}
