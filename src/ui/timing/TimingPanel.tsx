// Alt paneldeki "Zaman" sekmesi: canlı kayıttan zaman diyagramı, cihaz seçimi (sekme başına hatırlanır).

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { parseTraceKey, traceKeyName } from '../../core';
import { activeTab, useStore } from '../state/store';
import { engine } from '../sim/engine';
import { clearRecording, recorder } from '../sim/recording';
import { candidateKeys, useSelection, useTiming } from './selection';
import { Waveform, type WaveRow } from './Waveform';

const liveTrace = () => recorder.trace();
const subscribe = (cb: () => void) => engine.subscribe(cb);

export function TimingPanel() {
  const { keys, custom, tabId } = useSelection();
  const program = useStore((s) => s.doc.program);
  const model = useStore((s) => s.settings.model);
  const tabName = useStore((s) => activeTab(s).name);
  const [add, setAdd] = useState('');
  const setKeys = (k: string[] | null) => useTiming.getState().setFor(tabId, k);

  const rows: WaveRow[] = useMemo(() => {
    const base = (k: string) => (k.endsWith('.v') ? k.slice(0, -2) : k);
    return keys.map((k) => ({ key: k, label: program.labels[base(k)] || undefined }));
  }, [keys, program]);

  const cands = useMemo(() => candidateKeys(program, model).filter((k) => !keys.includes(k)), [program, model, keys]);

  const addKey = () => {
    const k = parseTraceKey(add);
    if (!k) {
      useStore.getState().showToast(`Cihaz anlaşılamadı: "${add}" (ör. M0, T0, T0.v, D0)`, true);
      return;
    }
    if (!keys.includes(k)) setKeys([...keys, k]);
    setAdd('');
  };

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= keys.length) return;
    const k = keys.slice();
    [k[i], k[j]] = [k[j]!, k[i]!];
    setKeys(k);
  };

  const safeName = tabName.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'devre';

  return (
    <Waveform
      rows={rows}
      trace={liveTrace}
      subscribe={subscribe}
      pngName={`zaman-diyagrami-${safeName}.png`}
      pngTitle={`${tabName} — zaman diyagramı`}
      emptyText="Seçili cihaz yok. Yukarıdan cihaz ekle (ör. X0, Y0, T0)."
      idleText={
        <>
          Kayıt yok. <kbd>F5</kbd> RUN ya da <kbd>F10</kbd> tek adım: seçili cihazların değişimleri PLC zamanıyla burada çizilir.
        </>
      }
      rowActions={(r, i) => (
        <>
          <button className="btn ghost icon xs" title="Yukarı" aria-label={`${traceKeyName(r.key)} yukarı`} onClick={() => move(i, -1)} disabled={i === 0}>
            <ArrowUp />
          </button>
          <button className="btn ghost icon xs" title="Aşağı" aria-label={`${traceKeyName(r.key)} aşağı`} onClick={() => move(i, 1)} disabled={i === keys.length - 1}>
            <ArrowDown />
          </button>
          <button className="btn ghost icon xs" title="Çıkar" aria-label={`${traceKeyName(r.key)} çıkar`} onClick={() => setKeys(keys.filter((k) => k !== r.key))}>
            <X />
          </button>
        </>
      )}
      toolbarEnd={
        <>
          <form
            className="wave-add"
            onSubmit={(e) => {
              e.preventDefault();
              addKey();
            }}
          >
            <input className="input" list="wave-cands" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Cihaz ekle" aria-label="Cihaz ekle" />
            <datalist id="wave-cands">
              {cands.map((k) => (
                <option key={k} value={k}>
                  {traceKeyName(k)}
                </option>
              ))}
            </datalist>
            <button className="btn sm icon" type="submit" title="Ekle" aria-label="Ekle" disabled={!add.trim()}>
              <Plus />
            </button>
          </form>
          {custom && (
            <button className="btn sm icon" onClick={() => setKeys(null)} title="Varsayılan seçime dön (kullanılan X, Y, T, C)" aria-label="Varsayılan seçim">
              <RotateCcw />
            </button>
          )}
          <button className="btn sm" onClick={clearRecording} title="Kaydı sil; çalışıyorsa şimdiden yeniden başlar">
            <Trash2 /> Temizle
          </button>
        </>
      }
    />
  );
}
