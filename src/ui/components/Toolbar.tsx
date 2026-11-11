// Üst çubuk: çalıştırma denetimleri, PLC durum ışıkları, dosya menüsü, model, hız, tema.
import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown, Command, Download, FilePlus2, FileText, HelpCircle, Link2, Moon, Pause, Play, Power, Redo2, Save, SaveAll, SkipForward, Square, Sun, TriangleAlert, Undo2, Upload,
} from 'lucide-react';
import { PROFILES, hasErrors } from '../../core';
import { useStore } from '../state/store';
import { engine } from '../sim/engine';
import { useLive } from '../sim/useLive';
import { exportIl, saveCurrent, share, showLadderText } from './fileops';

export function Menu({ label, icon, children, right, id }: { label: string; icon?: React.ReactNode; children: (close: () => void) => React.ReactNode; right?: boolean; id?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', off);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', off);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="btn ghost" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} id={id}>
        {icon}
        <span className="hide-narrow">{label}</span>
        <ChevronDown style={{ width: 14, height: 14 }} />
      </button>
      {open && (
        <div className={'menu' + (right ? ' right' : '')} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function Status() {
  useLive();
  const diags = useStore((s) => s.doc.diagnostics);
  const m = engine.machine;
  const mode = engine.mode;
  const err = !m || hasErrors(diags);
  return (
    <>
      <div className="leds" title="PLC durum ışıkları" aria-label={`Durum: ${mode === 'run' ? 'RUN' : mode === 'pause' ? 'duraklatıldı' : 'STOP'}${err ? ', hata var' : ''}`}>
        <span className="led on">
          <i />
          POWER
        </span>
        <span className={'led' + (mode === 'run' ? ' on' : mode === 'pause' ? ' blink' : '')} id="led-run">
          <i />
          RUN
        </span>
        <span className={'led err' + (err ? ' on' : '')}>
          <i />
          ERROR
        </span>
      </div>
      <span className="scaninfo" id="scaninfo">
        {m ? `tarama ${m.scanCount} · ${(m.timeMs / 1000).toFixed(1)} s` : 'program çalıştırılamıyor'}
      </span>
      {m && engine.stale && (
        <span className="storewarn" id="stalewarn" role="status" title="Düzenleyicideki program hatalı (Sorunlar paneline bak). PLC, son hatasız sürümü çalıştırmaya devam ediyor; hata düzelince yeni sürüme bellek korunarak geçilir.">
          <TriangleAlert size={15} /> {mode === 'stop' ? 'Program hatalı; RUN son geçerli sürümü çalıştırır' : 'Program hatalı, son geçerli sürüm çalışıyor'}
        </span>
      )}
    </>
  );
}

function RunCtl() {
  useLive();
  const mode = engine.mode;
  const can = !!engine.machine;
  return (
    <div className="runctl" role="group" aria-label="Çalıştırma">
      <button className={'btn run' + (mode === 'run' ? ' on' : '')} id="bRun" disabled={!can} onClick={() => engine.run()} title="Çalıştır (F5)">
        <Play /> RUN
      </button>
      <button className={'btn icon pause' + (mode === 'pause' ? ' on' : '')} id="bPause" disabled={!can} onClick={() => (mode === 'pause' ? engine.run() : engine.pause())} title="Duraklat / devam (Boşluk)" aria-label="Duraklat">
        <Pause />
      </button>
      <button className="btn icon" id="bStep" disabled={!can} onClick={() => engine.step()} title="Tek tarama adımı (F10)" aria-label="Tek tarama">
        <SkipForward />
      </button>
      <button className="btn icon" id="bStop" onClick={() => engine.stop()} title="STOP (Shift+F5)" aria-label="Durdur">
        <Square />
      </button>
    </div>
  );
}

export function Toolbar() {
  const settings = useStore((s) => s.settings);
  const storageOk = useStore((s) => s.storageOk);
  const tab = useStore((s) => s.tabs[s.active]!);
  const hist = useStore((s) => s.hist[tab.id]);
  const st = useStore.getState;
  return (
    <header className="topbar">
      <div className="brand">
        <span className="mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 32 32">
            <path d="M3 16h9M20 16h9M12 7v18M20 7v18" stroke="var(--on)" strokeWidth="3.4" fill="none" strokeLinecap="round" />
          </svg>
        </span>
        Delta PLC <small>Simülatör</small>
      </div>
      <RunCtl />
      <Status />
      <span className="sep" />
      <button className="btn ghost icon" onClick={() => st().undo()} disabled={!hist?.undo.length} title="Geri al (Ctrl+Z)" aria-label="Geri al">
        <Undo2 />
      </button>
      <button className="btn ghost icon" onClick={() => st().redo()} disabled={!hist?.redo.length} title="Yinele (Ctrl+Y)" aria-label="Yinele">
        <Redo2 />
      </button>
      <Menu label="Dosya" icon={<FileText />} id="mFile">
        {(close) => (
          <>
            <button onClick={() => (close(), st().newBlankTab())}>
              <FilePlus2 /> Yeni sekme <kbd>Ctrl+Alt+N</kbd>
            </button>
            <button onClick={() => (close(), void saveCurrent())}>
              <Save /> Kaydet <kbd>Ctrl+S</kbd>
            </button>
            <button onClick={() => (close(), void saveCurrent(true))}>
              <SaveAll /> Farklı kaydet
            </button>
            <button onClick={() => (close(), st().set('leftTab', 'project'))}>
              <Upload /> Kayıtlar ve örnekler
            </button>
            <hr />
            <button onClick={() => (close(), exportIl())}>
              <Download /> IL'i indir (.txt)
            </button>
            <button onClick={() => (close(), void showLadderText())}>
              <FileText /> Ladder'ı metin olarak göster
            </button>
            <button onClick={() => (close(), void share())}>
              <Link2 /> Paylaşım bağlantısı
            </button>
          </>
        )}
      </Menu>
      <span className="grow" />
      {!storageOk && (
        <span className="storewarn" title="Tarayıcı depolamaya izin vermiyor (gizli sekme ya da gömülü tarayıcı). Kayıtlar sayfa kapanınca kaybolur; Dosya > IL'i indir ile sakla.">
          <TriangleAlert size={15} /> Kayıt yalnızca bu oturumda
        </span>
      )}
      <label className="hide-narrow" title="PLC modeli: adres aralıkları ve zamanlayıcı tabanları">
        <select className="select" value={settings.model} onChange={(e) => st().set('model', e.target.value)} aria-label="PLC modeli">
          {Object.values(PROFILES).map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === 'v1' ? 'v1 (sade)' : 'DVP-' + p.id}
            </option>
          ))}
        </select>
      </label>
      <select className="select" value={settings.speed} onChange={(e) => st().set('speed', parseFloat(e.target.value))} title="Simülasyon hızı" aria-label="Hız">
        {[0.25, 0.5, 1, 2, 5, 10].map((v) => (
          <option key={v} value={v}>
            ×{v.toString().replace('.', ',')}
          </option>
        ))}
      </select>
      <button className="btn ghost icon" onClick={() => engine.powerCycle()} title="Güç kes / aç: kalıcı bölgeler dahil tüm bellek silinir" aria-label="Güç kes">
        <Power />
      </button>
      <button className="btn ghost icon" onClick={() => st().setUi({ paletteOpen: true })} title="Komut paleti (Ctrl+K)" aria-label="Komut paleti">
        <Command />
      </button>
      <button className="btn ghost icon" onClick={() => st().set('theme', settings.theme === 'dark' ? 'light' : 'dark')} title="Açık / koyu tema" aria-label="Tema">
        {settings.theme === 'dark' ? <Sun /> : <Moon />}
      </button>
      <button className="btn ghost icon" onClick={() => st().setUi({ helpOpen: true })} title="Yardım (F1)" aria-label="Yardım">
        <HelpCircle />
      </button>
    </header>
  );
}
