// Senaryo simülasyonu: zaman damgalı giriş olayları → cihaz değişim izi.
// CLI'daki zaman çizelgesi, ileride zaman diyagramı ve alıştırma denetleyicisi bunu kullanır.

import { hasErrors, type Diagnostic } from './diagnostics';
import { Machine, type MachineOptions, type Snapshot } from './vm';

export interface InputEvent {
  /** ms */
  t: number;
  dev: string;
  v: 0 | 1;
}

export interface Change {
  t: number;
  dev: string;
  v: number;
}

export interface SimResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  changes: Change[];
  final: Snapshot | null;
  scans: number;
}

export interface SimOptions extends MachineOptions {
  events?: InputEvent[];
  /** Toplam süre (ms) */
  duration: number;
  /** Tarama süresi (ms), varsayılan 10 */
  dt?: number;
  /** İzlenecek cihazlar; verilmezse programdaki X/Y/M/S/T/C (T/C: kontak durumu) */
  watch?: string[];
}

/**
 * Olay metnini çözer: "0:X0=1 200:X0=0 1.5s:X1=1" ya da "X0@0=1".
 * Zaman ms cinsindendir; "s" soneki saniye demektir.
 */
export function parseEvents(text: string): InputEvent[] {
  const out: InputEvent[] = [];
  for (const tok of text.split(/[\s,;]+/).filter(Boolean)) {
    const m = /^(\d+(?:\.\d+)?)(ms|s)?:([A-Za-z]+\d+)=([01])$/.exec(tok) ?? /^([A-Za-z]+\d+)@(\d+(?:\.\d+)?)(ms|s)?=([01])$/.exec(tok);
    if (!m) throw new Error(`Olay anlaşılamadı: "${tok}" (biçim: 0:X0=1 ya da 1.5s:X0=0)`);
    let t: number, unit: string | undefined, dev: string;
    if (/^\d/.test(tok)) [t, unit, dev] = [parseFloat(m[1]!), m[2], m[3]!];
    else [dev, t, unit] = [m[1]!, parseFloat(m[2]!), m[3]];
    out.push({ t: unit === 's' ? t * 1000 : t, dev: dev.toUpperCase(), v: m[4] === '1' ? 1 : 0 });
  }
  return out.sort((a, b) => a.t - b.t);
}

export function simulate(text: string, opts: SimOptions): SimResult {
  const built = Machine.fromText(text, opts);
  const m = built.machine;
  if (!m) return { ok: false, diagnostics: built.diagnostics, changes: [], final: null, scans: 0 };
  const dt = opts.dt ?? 10;
  const events = [...(opts.events ?? [])].sort((a, b) => a.t - b.t);
  const used = m.usedDevices();
  const watch = opts.watch ?? [...used.X, ...used.Y, ...used.M, ...used.S, ...used.T, ...used.C];
  const last = new Map<string, number>();
  const changes: Change[] = [];
  const sample = (t: number, initial: boolean) => {
    for (const d of watch) {
      const v = d[0] === 'X' ? m.inputs[parseInt(d.slice(1), 8)] ?? 0 : m.bit(d);
      if (last.get(d) !== v) {
        if (!initial || v !== 0) changes.push({ t, dev: d, v });
        last.set(d, v);
      }
    }
  };
  m.reset();
  sample(0, true);
  let ei = 0;
  let t = 0;
  while (t < opts.duration) {
    while (ei < events.length && events[ei]!.t <= t) {
      const e = events[ei++]!;
      m.setInput(e.dev, e.v);
      // girişler olay anında raporlanır; çıkışlar tarama sonunda
      if (watch.includes(e.dev) && last.get(e.dev) !== e.v) {
        changes.push({ t: e.t, dev: e.dev, v: e.v });
        last.set(e.dev, e.v);
      }
    }
    m.scan(dt);
    t += dt;
    sample(Math.round(t), false);
  }
  return { ok: !hasErrors(built.diagnostics), diagnostics: built.diagnostics, changes, final: m.snapshot(), scans: m.scanCount };
}
