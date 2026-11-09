// G/Ç paneli: PLC gövdesi gibi. Üstte X girişleri (bas-bırak butonlar, ışıklı), altta Y çıkış lambaları.
import { useStore } from '../state/store';
import { engine } from '../sim/engine';
import { useLive } from '../sim/useLive';

const N = 16;
const octal = (p: string) => Array.from({ length: N }, (_, i) => p + i.toString(8));
export const XS = octal('X');
const YS = octal('Y');

export function pressInput(i: number, down: boolean): void {
  const s = useStore.getState();
  if (s.settings.xMode === 'toggle') {
    if (down) engine.setInput(i, !engine.inputs[i]);
    return;
  }
  if (down) engine.setInput(i, true);
  else if (!engine.locked[i]) engine.setInput(i, false);
}

export function IoPanel() {
  useLive();
  const labels = useStore((s) => s.doc.program.labels);
  const xMode = useStore((s) => s.settings.xMode);
  const used = useStore((s) => s.doc.program.instrs);
  const usedSet = new Set<string>();
  for (const it of used) for (const o of it.ops) if (o.addr) usedSet.add(o.addr.text);
  const live = engine.live;
  const out = engine.machine?.outputs;

  return (
    <div className="plcbody" aria-label="Giriş ve çıkışlar">
      <header>
        <span>GİRİŞLER X</span>
        <div className="seg" role="radiogroup" aria-label="Buton davranışı">
          <button className={xMode === 'push' ? 'on' : ''} role="radio" aria-checked={xMode === 'push'} onClick={() => useStore.getState().set('xMode', 'push')} title="Basılı tuttukça 1">
            Bas-bırak
          </button>
          <button className={xMode === 'toggle' ? 'on' : ''} role="radio" aria-checked={xMode === 'toggle'} onClick={() => useStore.getState().set('xMode', 'toggle')} title="Her tıklama 0/1 değiştirir (anahtar)">
            Anahtar
          </button>
        </div>
      </header>
      <div className="terms">
        {XS.map((x, i) => (
          <button
            key={x}
            className={'xbtn' + (engine.inputs[i] ? ' on' : '') + (engine.locked[i] ? ' lock' : '') + (usedSet.has(x) ? ' used' : '')}
            data-x={x}
            aria-pressed={!!engine.inputs[i]}
            title={`${x}${labels[x] ? ' — ' + labels[x] : ''}\nTıkla/basılı tut: giriş · sağ tık: kilitle${i < 8 ? ` · klavye: ${i}` : ''}`}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              pressInput(i, true);
            }}
            onPointerUp={() => pressInput(i, false)}
            onPointerCancel={() => pressInput(i, false)}
            onKeyDown={(e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                e.preventDefault();
                pressInput(i, true);
              }
            }}
            onKeyUp={(e) => {
              if (e.key === ' ' || e.key === 'Enter') pressInput(i, false);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              engine.toggleLock(i);
            }}
          >
            <b>{x}</b>
            <small>{labels[x] ?? ' '}</small>
          </button>
        ))}
      </div>
      <div className="lbl2">
        <span>ÇIKIŞLAR Y</span>
        <span>{live ? '' : 'STOP: çıkışlar kapalı'}</span>
      </div>
      <div className="lamps">
        {YS.map((y, i) => (
          <div key={y} className={'lamp' + (live && out?.[i] ? ' on' : '') + (usedSet.has(y) ? ' used' : '')} data-y={y} title={y + (labels[y] ? ' — ' + labels[y] : '')}>
            <i />
            <b>{y}</b>
            <small>{labels[y] ?? ' '}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
