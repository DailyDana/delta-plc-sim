// "Bu senaryoyu oynat": senaryonun giriş olaylarını gerçek motora PLC zamanıyla uygular (STOP → RUN).
// Olaylar her taramadan önce, makinenin zamanı olay zamanına ulaştığında yazılır (simulate() ile aynı kural:
// t anındaki olay t'de başlayan taramada görülür). Senaryo süresi dolunca motor duraklatılır.
// Kullanıcı STOP→RUN yaparsa, başka devreye geçerse ya da "Durdur"a basarsa oynatma biter.

import { create } from 'zustand';
import type { InputEvent, Machine } from '../../core';
import { engine } from '../sim/engine';

export interface PlayState {
  /** Oynatılan sekme ve senaryo */
  tabId: string;
  scenario: number;
  name: string;
  duration: number;
}

export const usePlayback = create<{ play: PlayState | null }>()(() => ({ play: null }));

let off: (() => void) | null = null;

const xIndex = (dev: string): number => (/^X[0-7]+$/.test(dev) ? parseInt(dev.slice(1), 8) : -1);

export function stopPlayback(pause = false): void {
  off?.();
  off = null;
  if (pause && engine.mode === 'run') engine.pause();
  if (usePlayback.getState().play) usePlayback.setState({ play: null });
}

export function playScenario(p: PlayState, events: readonly InputEvent[]): void {
  stopPlayback();
  const evs = [...events].sort((a, b) => a.t - b.t);
  engine.stop();
  // senaryonun girişleri bırakık başlasın (kilitli giriş varsa çözülür)
  for (const e of evs) {
    const i = xIndex(e.dev);
    if (i < 0) continue;
    engine.locked[i] = 0;
    engine.setInput(i, false);
  }
  engine.run();
  if (engine.mode !== 'run') return; // program çalıştırılamıyor
  let k = 0;
  let done = false;
  // Olaylar bir önceki taramanın sonunda motorun giriş dizisine yazılır: sonraki tarama onları okur ve
  // zaman diyagramı kaydı (o da beforeScan'de örnekler) değişimi doğru PLC zamanında görür.
  const apply = (m: Machine | null) => {
    const now = m?.timeMs ?? 0;
    while (k < evs.length && evs[k]!.t <= now + 1e-6) {
      const e = evs[k++]!;
      const i = xIndex(e.dev);
      if (i >= 0) engine.inputs[i] = e.v;
    }
  };
  apply(engine.machine);
  off = engine.addHooks({
    afterScan(m) {
      if (done) return;
      if (m.timeMs >= p.duration - 1e-6) {
        // süre doldu: son durumu göstermek için duraklat (aynı turdaki birkaç tarama daha yapılabilir; zararsız)
        done = true;
        queueMicrotask(() => stopPlayback(true));
        return;
      }
      apply(m);
    },
    started: () => stopPlayback(),
    fresh: () => stopPlayback(),
  });
  usePlayback.setState({ play: p });
}
