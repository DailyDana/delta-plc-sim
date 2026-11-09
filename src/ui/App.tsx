// Uygulama iskeleti: IDE düzeni ve genel klavye kısayolları.
import { useEffect, useRef, useState } from 'react';
import { PanelLeft, TriangleAlert, X } from 'lucide-react';
import { useStore } from './state/store';
import { engine } from './sim/engine';
import { Toolbar } from './components/Toolbar';
import { TabBar } from './components/TabBar';
import { LeftPanel } from './components/LeftPanel';
import { PropsPanel } from './components/PropsPanel';
import { IoPanel, pressInput } from './components/IoPanel';
import { BottomPanel } from './components/BottomPanel';
import { LadderView } from './ladder/LadderView';
import { DialogHost } from './components/dialogs';
import { CommandPalette, HelpModal, Toast } from './components/Overlays';
import { saveCurrent } from './components/fileops';
import { PartIcon } from './components/symbols';
import { useDrag } from './ladder/drag';

function Splitter({ dir, onDrag }: { dir: 'v' | 'h'; onDrag: (d: number) => void }) {
  const [on, setOn] = useState(false);
  return (
    <div
      className={'splitter ' + dir + (on ? ' drag' : '')}
      role="separator"
      aria-orientation={dir === 'v' ? 'vertical' : 'horizontal'}
      onPointerDown={(e) => {
        e.preventDefault();
        setOn(true);
        let last = dir === 'v' ? e.clientX : e.clientY;
        const move = (ev: PointerEvent) => {
          const p = dir === 'v' ? ev.clientX : ev.clientY;
          onDrag(p - last);
          last = p;
        };
        const up = () => {
          setOn(false);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    />
  );
}

function DragGhost() {
  const d = useDrag();
  if (!d.active || !d.payload) return null;
  const g = d.payload.src === 'palette' ? d.payload.g : d.payload.g;
  const k = d.payload.src === 'palette' ? d.payload.k : g === 'c' ? 'NO' : 'OUT';
  const txt = d.overTrash ? 'Bırak: sil' : d.hot ? '' : d.name + (d.inLadder ? ': mavi bir noktaya yaklaştır' : '');
  return (
    <div className={'dragghost' + (d.overTrash ? ' del' : '') + (!d.hot && !d.overTrash ? ' nodrop' : '')} style={{ transform: `translate(${d.x + 14}px, ${d.y + 14}px)` }}>
      <PartIcon g={g} k={k} />
      {txt && <span>{txt}</span>}
    </div>
  );
}

const typing = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable || !!el.closest?.('.cm-editor');
};

function useShortcuts() {
  useEffect(() => {
    const held = new Set<number>();
    const down = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;
      // her yerde geçerli olanlar
      if (mod && k.toLowerCase() === 's') {
        e.preventDefault();
        void saveCurrent(e.shiftKey);
        return;
      }
      if (mod && k.toLowerCase() === 'k') {
        e.preventDefault();
        s.setUi({ paletteOpen: !s.paletteOpen });
        return;
      }
      if (k === 'F5') {
        e.preventDefault();
        if (e.shiftKey) engine.stop();
        else engine.run();
        return;
      }
      if (k === 'F10') {
        e.preventDefault();
        engine.step();
        return;
      }
      if (k === 'F1') {
        e.preventDefault();
        s.setUi({ helpOpen: true });
        return;
      }
      if (mod && k.toLowerCase() === 'j') {
        e.preventDefault();
        if (s.settings.bottomOpen && s.settings.bottomTab === 'il') s.set('bottomOpen', false);
        else {
          s.set('bottomOpen', true);
          s.set('bottomTab', 'il');
        }
        return;
      }
      if (mod && e.altKey && k.toLowerCase() === 'n') {
        e.preventDefault();
        s.newBlankTab();
        return;
      }
      if (typing(e.target) || document.querySelector('.overlay')) return;
      if (mod && !e.shiftKey && k.toLowerCase() === 'z') {
        e.preventDefault();
        s.undo();
      } else if (mod && (k.toLowerCase() === 'y' || (e.shiftKey && k.toLowerCase() === 'z'))) {
        e.preventDefault();
        s.redo();
      } else if (k === ' ' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        if (engine.mode === 'run') engine.pause();
        else engine.run();
      } else if (/^[0-7]$/.test(k) && !mod && !e.altKey) {
        e.preventDefault();
        if (e.repeat) return;
        const i = parseInt(k, 10);
        held.add(i);
        pressInput(i, true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (/^[0-7]$/.test(e.key)) {
        const i = parseInt(e.key, 10);
        if (held.delete(i)) pressInput(i, false);
      }
    };
    const blur = () => {
      held.forEach((i) => pressInput(i, false));
      held.clear();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
}

function useWindowWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const f = () => setW(window.innerWidth);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return w;
}

function StorageBanner() {
  const ok = useStore((s) => s.storageOk);
  const [hidden, setHidden] = useState(false);
  if (ok || hidden) return null;
  return (
    <div className="banner" role="alert" id="storeWarn">
      <TriangleAlert size={16} />
      Bu tarayıcı kayıt yapmaya izin vermiyor (gizli sekme ya da gömülü pencere). Çalışmaların sayfa kapanınca kaybolur; saklamak için Dosya → IL'i indir ya da Kayıtlar → Metin.
      <button className="btn ghost icon sm" onClick={() => setHidden(true)} aria-label="Kapat">
        <X />
      </button>
    </div>
  );
}

export function App() {
  const st = useStore((s) => s.settings);
  const set = useStore.getState().set;
  const migrated = useStore((s) => s.migrated);
  const work = useRef<HTMLDivElement>(null);
  useShortcuts();
  useEffect(() => {
    if (migrated) useStore.getState().showToast(`Önceki sürümdeki ${migrated} sekme/kayıt aktarıldı`);
  }, [migrated]);

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  // Dar pencere (gömülü tarayıcı, küçük dizüstü): yan paneller oranla sınırlanır; çok darsa pano çekmeceye geçer
  const w = useWindowWidth();
  const narrow = w < 860;
  const [drawer, setDrawer] = useState(false);
  const leftW = narrow ? 0 : Math.min(st.leftW, Math.max(170, Math.round(w * 0.19)));
  const rightW = Math.min(st.rightW, Math.max(230, Math.round(w * (narrow ? 0.4 : 0.26))));
  return (
    <div className="app">
      <Toolbar />
      <TabBar />
      <div className="work" ref={work} style={{ gridTemplateColumns: `${leftW}px 0 minmax(0,1fr) 0 ${rightW}px` }}>
        {narrow ? <div /> : <LeftPanel />}
        <Splitter dir="v" onDrag={(d) => set('leftW', clamp(useStore.getState().settings.leftW + d, 170, 420))} />
        <main className="center" style={{ gridTemplateRows: st.bottomOpen ? `minmax(0,1fr) 0 ${st.bottomH}px` : 'minmax(0,1fr)' }}>
          <LadderView />
          {narrow && (
            <>
              <button className="btn sm drawer-toggle" aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>
                {drawer ? <X /> : <PanelLeft />} Parçalar
              </button>
              {drawer && (
                <div className="drawer">
                  <LeftPanel />
                </div>
              )}
            </>
          )}
          {st.bottomOpen && (
            <>
              <Splitter dir="h" onDrag={(d) => set('bottomH', clamp(useStore.getState().settings.bottomH - d, 120, window.innerHeight - 220))} />
              <BottomPanel />
            </>
          )}
          {!st.bottomOpen && (
            <button className="btn sm" style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 4 }} onClick={() => set('bottomOpen', true)}>
              IL · İzleme · Sorunlar (Ctrl+J)
            </button>
          )}
        </main>
        <Splitter dir="v" onDrag={(d) => set('rightW', clamp(useStore.getState().settings.rightW - d, 240, 460))} />
        <aside className="side right" aria-label="Özellikler ve G/Ç">
          <div className="pbody" style={{ flex: 'none', maxHeight: '55%', borderBottom: '1px solid var(--line)' }}>
            <PropsPanel />
          </div>
          <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
            <IoPanel />
          </div>
        </aside>
      </div>
      <DragGhost />
      <DialogHost />
      <CommandPalette />
      <HelpModal />
      <StorageBanner />
      <Toast />
    </div>
  );
}
