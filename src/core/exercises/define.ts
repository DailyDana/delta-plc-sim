// Alıştırma içeriği yazmak için kısa yardımcılar. Zamanlar saniye cinsinden verilir, ms'ye çevrilir.
// (Yalnızca tür içe aktarılır: exercise.ts bu klasörü çalışma anında içe aktardığı için döngü oluşmaz.)

import type { Edge, Exercise, ExerciseIo, Invariant, IoKind, Sample, Scenario, TimingExpect } from '../exercise';

const ms = (s: number): number => Math.round(s * 1000);

export const io = (dev: string, label: string, kind: IoKind): ExerciseIo => ({ dev, label, kind });

/** `s` saniyesinde `dev` 1 olmalı (kenarlardan en az ~0,2 s uzak seç) */
export const on = (s: number, dev: string, note?: string): Sample => (note ? { t: ms(s), dev, v: 1, note } : { t: ms(s), dev, v: 1 });
export const off = (s: number, dev: string, note?: string): Sample => (note ? { t: ms(s), dev, v: 0, note } : { t: ms(s), dev, v: 0 });

export const never = (dev: string, note?: string): Invariant => (note ? { kind: 'never', dev, note } : { kind: 'never', dev });
export const notBoth = (a: string, b: string, note?: string): Invariant => (note ? { kind: 'notBoth', a, b, note } : { kind: 'notBoth', a, b });

/**
 * Zamanlama: `afterDev`'in `n`. `afterEdge` kenarından `s` ± `tol` saniye sonra `dev`'de `edge` olmalı.
 * Varsayılan tolerans 0,1 s (100 ms tabanlı zamanlayıcının çözünürlüğü + birkaç tarama).
 */
export function delay(afterDev: string, afterEdge: Edge, s: number, dev: string, edge: Edge, o: { n?: number; tol?: number; note?: string } = {}): TimingExpect {
  const t: TimingExpect = { after: { dev: afterDev, edge: afterEdge }, dev, edge, delay: ms(s), tol: ms(o.tol ?? 0.1) };
  if (o.n) t.after.n = o.n;
  if (o.note) t.note = o.note;
  return t;
}

export function scenario(name: string, events: string, durationS: number, samples: Sample[], extra: { invariants?: Invariant[]; timing?: TimingExpect[] } = {}): Scenario {
  const s: Scenario = { name, events, duration: ms(durationS), samples };
  if (extra.invariants) s.invariants = extra.invariants;
  if (extra.timing) s.timing = extra.timing;
  return s;
}

/** Başlangıç IL'i: görev özeti yorumu + etiket satırları + END (çözüm içermez) */
export function starterIl(title: string, summary: string, ios: ExerciseIo[]): string {
  return [`; Alıştırma: ${title}`, `; ${summary}`, '; Programını END satırının üstüne yaz.', ...ios.map((i) => `#${i.dev} ${i.label}`), '', 'END'].join('\n');
}

export type ExerciseDef = Omit<Exercise, 'starterIl'> & { summary: string };

export function define(d: ExerciseDef): Exercise {
  const { summary, ...rest } = d;
  return { ...rest, starterIl: starterIl(d.title, summary, [...d.inputs, ...d.outputs]) };
}
