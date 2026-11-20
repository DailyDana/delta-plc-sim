// Dışarıdan sürme API'si (tarayıcı konsolu, Playwright, Claude): window.plc
// ve paylaşım bağlantısıyla açma (#il=<base64url>&ad=<ad>&run=1, #ornek=<n>).

import { EXAMPLES, decodeShare, drawLadderText, formatAddress, hasErrors, parseAddress, type Diagnostic, type Trace } from '../core';
import { useStore } from './state/store';
import { engine, SCAN_MS } from './sim/engine';
import { recorder } from './sim/recording';
import { useTiming } from './timing/selection';
import { exerciseIdFromHash } from './exercise/progress';
import { EXERCISE_LIST, activeExerciseId, checkActive, openExercise, useExercises } from './exercise/store';

export interface PlcApi {
  load(il: string, name?: string): { ok: boolean; errors: Diagnostic[]; warnings: Diagnostic[]; rungs: number };
  getIL(): string;
  getLadder(): string | null;
  diagnostics(): Diagnostic[];
  run(): Record<string, number | string>;
  pause(): Record<string, number | string>;
  stop(): Record<string, number | string>;
  step(): Record<string, number | string>;
  powerCycle(): Record<string, number | string>;
  set(x: string, v: boolean | number): Record<string, number | string>;
  press(x: string, ms?: number): Record<string, number | string>;
  advance(ms: number): Record<string, number | string>;
  state(): Record<string, number | string>;
  model(id?: string): string;
  /**
   * Zaman diyagramı kaydının kopyası (PLC zamanı, ms): { start, end, signals: { Y0: { init, t: [..], v: [..] } } }.
   * devs verilirse yalnızca o anahtarlar ("Y0", "T0", "T0.v", "D0").
   */
  trace(devs?: string[]): Trace;
  /** Alıştırma listesi (referans çözüm içermez) */
  exercises(): { id: string; title: string; level: number; solved: boolean }[];
  /** Alıştırmayı aç (açıksa o sekmeye geç) */
  openExercise(id: string): { ok: boolean; id: string | null; il: string };
  /** Etkin alıştırma sekmesini denetle; sonuç görev panelinde de görünür */
  checkExercise(): { ok: boolean; passed: boolean; blocked: boolean; message: string; scenarios: { name: string; passed: boolean; message: string | null }[] } | { ok: false; error: string };
  /** İlerleme: çözülenler, öğrencinin son IL'leri, açılan ipucu sayıları */
  exerciseProgress(): { solved: string[]; il: Record<string, string>; hints: Record<string, number> };
}

function xIndex(x: string): number {
  const a = parseAddress(String(x).toUpperCase()).addr;
  if (!a || a.type !== 'X' || a.index > 15) throw new Error(`Geçersiz giriş: ${x} (X0–X7, X10–X17)`);
  return a.index;
}

function state(): Record<string, number | string> {
  const m = engine.machine;
  const live = engine.live;
  const o: Record<string, number | string> = { mode: engine.mode, scan: m?.scanCount ?? 0, t: m ? Math.round(m.timeMs) / 1000 : 0 };
  if (!m) return o;
  const snap = m.snapshot();
  for (const [k, v] of Object.entries(snap)) if (k !== 'scan' && k !== 't') o[k] = v;
  for (let i = 0; i < 16; i++) {
    const x = formatAddress('X', i);
    if (x in o || engine.inputs[i]) o[x] = engine.inputs[i] ?? 0;
    const y = formatAddress('Y', i);
    if (y in o || (live && m.outputs[i])) o[y] = live ? m.outputs[i] ?? 0 : 0;
  }
  if (!live) for (const k of Object.keys(o)) if (/^[MS]\d+$/.test(k)) o[k] = m.bit(k);
  return o;
}

export const api: PlcApi = {
  load(il, name) {
    const s = useStore.getState();
    s.openInNewTab(name || 'Dışarıdan yüklenen', String(il));
    const d = useStore.getState().doc.diagnostics;
    const errors = d.filter((x) => x.severity === 'error');
    return { ok: !!engine.machine && !hasErrors(d), errors, warnings: d.filter((x) => x.severity === 'warning'), rungs: useStore.getState().doc.ladder?.rungs.length ?? 0 };
  },
  getIL: () => useStore.getState().doc.il,
  getLadder: () => {
    const l = useStore.getState().doc.ladder;
    return l ? drawLadderText(l) : null;
  },
  diagnostics: () => useStore.getState().doc.diagnostics,
  run() {
    engine.run();
    return state();
  },
  pause() {
    engine.pause();
    return state();
  },
  stop() {
    engine.stop();
    return state();
  },
  step() {
    engine.step();
    return state();
  },
  powerCycle() {
    engine.powerCycle();
    return state();
  },
  set(x, v) {
    engine.setInput(xIndex(x), !!v);
    return state();
  },
  press(x, ms = 100) {
    const i = xIndex(x);
    engine.setInput(i, true);
    engine.advance(ms);
    engine.setInput(i, false);
    engine.advance(SCAN_MS);
    return state();
  },
  advance(ms) {
    engine.advance(ms);
    return state();
  },
  state,
  model(id) {
    if (id) useStore.getState().set('model', id);
    return useStore.getState().settings.model;
  },
  trace(devs) {
    const tr = recorder.snapshot();
    if (devs) {
      const signals: Trace['signals'] = {};
      for (const d of devs) if (tr.signals[d]) signals[d] = tr.signals[d];
      tr.signals = signals;
    }
    return tr;
  },
  exercises() {
    const solved = useExercises.getState().progress.solved;
    return EXERCISE_LIST.map((e) => ({ id: e.id, title: e.title, level: e.level, solved: !!solved[e.id] }));
  },
  openExercise(id) {
    const ok = openExercise(String(id));
    return { ok, id: activeExerciseId(), il: useStore.getState().doc.il };
  },
  checkExercise() {
    const e = checkActive();
    if (!e) return { ok: false, error: 'Etkin sekme bir alıştırma değil' };
    const r = e.result;
    // yalnızca düz alanlar: izler (referansınki dahil) dışarı verilmez
    return { ok: true, passed: r.passed, blocked: r.blocked, message: r.message, scenarios: r.scenarios.map((s) => ({ name: s.name, passed: s.passed, message: s.message ?? null })) };
  },
  exerciseProgress() {
    const p = useExercises.getState().progress;
    return { solved: Object.keys(p.solved), il: { ...p.il }, hints: { ...p.hints } };
  },
};

// zaman diyagramı seçim kaydı modül yüklenince bağlanır (kayıt seçimdeki ek cihazları da tutsun)
void useTiming;

/** Adres çubuğundaki bağlantıyı aç; aynı devre zaten açıksa o sekmeye geç */
export function openFromHash(): void {
  const h = location.hash.replace(/^#/, '');
  if (!h) return;
  const exId = exerciseIdFromHash(h);
  if (exId) {
    history.replaceState(null, '', location.pathname + location.search);
    openExercise(exId);
    return;
  }
  const p = new URLSearchParams(h);
  let il: string | null = null;
  let name = p.get('ad') ?? '';
  try {
    if (p.get('il')) il = decodeShare(p.get('il')!);
    else if (p.get('ornek')) {
      const ex = EXAMPLES[parseInt(p.get('ornek')!, 10) - 1];
      if (ex) {
        il = ex.il;
        name = name || ex.name;
      }
    }
  } catch {
    useStore.getState().showToast('Bağlantı okunamadı (bozuk ya da eksik kopyalanmış)', true);
  }
  history.replaceState(null, '', location.pathname + location.search);
  if (il === null) return;
  const s = useStore.getState();
  const norm = (x: string) => x.replace(/\r/g, '').trim();
  const i = s.tabs.findIndex((t) => norm(t.il) === norm(il!));
  if (i >= 0) s.switchTab(i);
  else s.openInNewTab(name || 'Bağlantıdan açılan', il);
  if (p.get('run') === '1') engine.run();
}

declare global {
  interface Window {
    plc: PlcApi;
    PLC: { app: PlcApi };
    PLC_APP_OK?: boolean;
    __engine?: typeof engine;
    __store?: typeof useStore;
  }
}

export function installApi(): void {
  window.plc = api;
  window.PLC = { app: api }; // v1 ile aynı ad
  window.__engine = engine;
  window.__store = useStore;
  window.PLC_APP_OK = true;
  window.addEventListener('hashchange', openFromHash);
  openFromHash();
}
