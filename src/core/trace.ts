// Zaman diyagramı izi: cihaz → zaman damgalı değişim listesi. Kayıttan ve çizimden bağımsız saf veri.
//
// - İz (Trace) hem canlı kayıttan (arayüzdeki TraceRecorder) hem de simulate() sonucundan
//   (traceFromSim) üretilebilir; alıştırma modunda "senin devren ↔ beklenen" karşılaştırması
//   için iki iz aynı biçimdedir (diffRanges ile ayrıştıkları aralıklar bulunur).
// - Anahtarlar: "X0", "Y0", "M0", "S0", "T0"/"C0" (kontak, bit), "T0.v"/"C0.v" (anlık değer) ve "D0" (kelime).
// - Zaman PLC zamanıdır (ms; tarama zamanlarının toplamı), duvar saati değil.

import { parseAddress } from './devices';
import type { Change, SimResult } from './simulate';
import type { Machine } from './vm';

export interface TraceSignal {
  /** start anındaki (ilk değişimden önceki) değer */
  init: number;
  /** Değişim zamanları (ms, artan sırada) */
  t: number[];
  /** Değişimden sonraki değerler (t ile aynı uzunlukta) */
  v: number[];
  /** Bu cihaz kayda sonradan eklendiyse bilindiği ilk an (öncesi çizilmez) */
  from?: number;
}

export interface Trace {
  /** Kaydın başı (ms) */
  start: number;
  /** Kaydın sonu (ms): son taramanın bittiği an */
  end: number;
  signals: Record<string, TraceSignal>;
}

/** Kelime (sayı) izi mi? D kaydedicisi ve T/C anlık değeri ("T0.v") */
export const isWordKey = (key: string): boolean => /^D\d+$/.test(key) || /^[TC]\d+\.v$/.test(key);

/** Kullanıcı yazımını anahtara çevirir: "t0.v" → "T0.v", "x10" → "X10"; geçersizse null */
export function parseTraceKey(raw: string): string | null {
  const s = raw.trim();
  const m = /^([A-Za-z]+\d+)(\.v)?$/i.exec(s);
  if (!m) return null;
  const a = parseAddress(m[1]!).addr;
  if (!a) return null;
  if (m[2]) return a.type === 'T' || a.type === 'C' ? a.text + '.v' : null;
  return a.text;
}

/** Satır başlığı için okunur ad: "T0.v" → "T0 değeri" */
export const traceKeyName = (key: string): string => (key.endsWith('.v') ? key.slice(0, -2) + ' değeri' : key);

export const emptyTrace = (start = 0): Trace => ({ start, end: start, signals: {} });

/** t anında geçerli olan son değişimin sırası (t[i] <= t); yoksa -1 */
export function signalIndex(sig: TraceSignal, t: number): number {
  const a = sig.t;
  let lo = 0;
  let hi = a.length - 1;
  let r = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid]! <= t) {
      r = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return r;
}

export function valueAt(sig: TraceSignal | undefined, t: number): number {
  if (!sig) return 0;
  const i = signalIndex(sig, t);
  return i < 0 ? sig.init : sig.v[i]!;
}

/** [t0, t1] aralığındaki değişim zamanları */
export function edgeTimes(sig: TraceSignal | undefined, t0 = -Infinity, t1 = Infinity): number[] {
  if (!sig) return [];
  const out: number[] = [];
  for (let i = Math.max(0, signalIndex(sig, t0)); i < sig.t.length; i++) {
    const t = sig.t[i]!;
    if (t > t1) break;
    if (t >= t0) out.push(t);
  }
  return out;
}

/**
 * simulate() değişim listesinden iz. simulate ilk anda sıfır olan değerleri yazmaz, bu yüzden her cihazın
 * başlangıç değeri 0'dır. devs verilirse hiç değişmeyen cihazlar da (düz 0) izde yer alır.
 */
export function traceFromChanges(changes: readonly Change[], duration: number, devs?: readonly string[]): Trace {
  const signals: Record<string, TraceSignal> = {};
  const sig = (d: string): TraceSignal => (signals[d] ??= { init: 0, t: [], v: [] });
  for (const d of devs ?? []) sig(d);
  const sorted = [...changes].sort((a, b) => a.t - b.t);
  for (const c of sorted) {
    const s = sig(c.dev);
    const n = s.t.length;
    if (n && s.t[n - 1] === c.t) s.v[n - 1] = c.v; // aynı anda iki kayıt: sonuncusu geçerli
    else s.t.push(c.t), s.v.push(c.v);
    // değeri değiştirmeyen kayıtları at
    const k = s.t.length;
    const prev = k >= 2 ? s.v[k - 2]! : s.init;
    if (s.v[k - 1] === prev) s.t.pop(), s.v.pop();
  }
  const end = Math.max(duration, sorted.length ? sorted[sorted.length - 1]!.t : 0);
  return { start: 0, end, signals };
}

/** simulate() sonucundan iz: traceFromSim(simulate(il, { duration: 8000, events }), 8000) */
export const traceFromSim = (res: Pick<SimResult, 'changes'>, duration: number, devs?: readonly string[]): Trace =>
  traceFromChanges(res.changes, duration, devs);

/** İki sinyalin [t0, t1] içinde farklı değerde olduğu aralıklar (bitişikler birleştirilir) */
export function diffRanges(a: TraceSignal | undefined, b: TraceSignal | undefined, t0: number, t1: number): [number, number][] {
  if (t1 <= t0) return [];
  const times = new Set<number>([t0]);
  for (const s of [a, b]) for (const t of edgeTimes(s, t0, t1)) times.add(t);
  const ts = [...times].sort((x, y) => x - y);
  const out: [number, number][] = [];
  for (let i = 0; i < ts.length; i++) {
    const from = ts[i]!;
    const to = i + 1 < ts.length ? ts[i + 1]! : t1;
    if (to <= from) continue;
    if (valueAt(a, from) !== valueAt(b, from)) {
      const last = out[out.length - 1];
      if (last && last[1] === from) last[1] = to;
      else out.push([from, to]);
    }
  }
  return out;
}

/** İki izin anahtar başına ayrıştığı aralıklar (yalnızca ayrışanlar döner) */
export function traceDiff(actual: Trace, expected: Trace, keys?: readonly string[]): Record<string, [number, number][]> {
  const t0 = Math.min(actual.start, expected.start);
  const t1 = Math.max(actual.end, expected.end);
  const out: Record<string, [number, number][]> = {};
  for (const k of keys ?? Object.keys(expected.signals)) {
    const r = diffRanges(actual.signals[k], expected.signals[k], t0, t1);
    if (r.length) out[k] = r;
  }
  return out;
}

export interface Snap {
  t: number;
  /** Bir kenara yapıştı mı */
  snapped: boolean;
  /** Yapıştığı kenarın sinyali */
  key?: string;
}

/**
 * İmleci en yakın kenara yapıştır. Önce tercih edilen satırın (prefer, ör. farenin üstündeki satır)
 * kenarlarına, orada tol içinde kenar yoksa tüm satırlara bakılır.
 */
export function snapToEdge(trace: Trace, keys: readonly string[], t: number, tol: number, prefer?: string): Snap {
  const best = (ks: readonly string[]): Snap | null => {
    let r: Snap | null = null;
    let d = tol;
    for (const k of ks) {
      for (const e of edgeTimes(trace.signals[k], t - tol, t + tol)) {
        const dd = Math.abs(e - t);
        if (dd <= d) {
          d = dd;
          r = { t: e, snapped: true, key: k };
        }
      }
    }
    return r;
  };
  return (prefer ? best([prefer]) : null) ?? best(keys) ?? { t, snapped: false };
}

/** Süre metni: 120 → "120 ms", 5000 → "5 s", 5010 → "5,01 s", 65500 → "65,5 s" */
export function formatMs(ms: number): string {
  const a = Math.abs(ms);
  const sign = ms < 0 ? '−' : '';
  if (a < 1000) return sign + String(Math.round(a * 10) / 10).replace('.', ',') + ' ms';
  const s = (a / 1000).toFixed(3).replace(/\.?0+$/, '');
  return sign + s.replace('.', ',') + ' s';
}

const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000];

/** Eksen işaret aralığı (ms): iki işaret arası en az minPx piksel */
export function niceTickStep(msPerPx: number, minPx = 56): number {
  const want = msPerPx * minPx;
  for (const s of STEPS) if (s >= want) return s;
  return STEPS[STEPS.length - 1]!;
}

/** Bir makinede kaydedilebilecek tüm anahtarlar: programda geçen cihazlar + T/C anlık değerleri */
export function recordableKeys(m: Machine): string[] {
  const u = m.usedDevices();
  return [...u.X, ...u.Y, ...u.M, ...u.S, ...u.T, ...u.T.map((t) => t + '.v'), ...u.C, ...u.C.map((c) => c + '.v'), ...u.D];
}

/**
 * Anahtarın makinedeki değerini okuyan hızlı okuyucu (her taramada çağrılır, adres çözümlemesi bir kez).
 * X: makinenin bu taramada göreceği giriş (`inputs`); taramadan ÖNCE okunmalı. Diğerleri taramadan sonra.
 */
export function machineReader(m: Machine, key: string): (() => number) | null {
  const word = key.endsWith('.v');
  const a = parseAddress(word ? key.slice(0, -2) : key).addr;
  if (!a) return null;
  const i = a.index;
  switch (a.type) {
    case 'X': return () => m.inputs[i] ?? 0;
    case 'T': return word ? () => m.Tcv[i] ?? 0 : () => m.Tdone[i] ?? 0;
    case 'C': return word ? () => m.Ccv[i] ?? 0 : () => m.Cdone[i] ?? 0;
    case 'D': return () => m.D[i] ?? 0;
    default: {
      const t = a.type;
      return () => (m.read(t, i) ? 1 : 0);
    }
  }
}

interface RecSig extends TraceSignal {
  last: number;
}

/**
 * Canlı kayıt tamponu. Toplam değişim sayısı `capacity`'yi ya da kayıt süresi `maxSpanMs`'yi aşınca
 * en eski kısım topluca düşer (halka tampon); düşen kısmın son değeri sinyalin `init` değerine geçer,
 * `start` ileri kayar. Böylece bellek sınırlı kalır ve kalan kısım doğru çizilir.
 */
export class TraceRecorder {
  private sigs = new Map<string, RecSig>();
  private obj: Record<string, RecSig> = {};
  /** Tüm değişimlerin zamanları, kayıt sırasıyla (halka) */
  private ring: Float64Array;
  private head = 0;
  private count = 0;
  start = 0;
  end = 0;
  /** Kayıt sürüyor mu (begin ile başlar, clear ile biter) */
  active = false;
  /** Her değişimde artar (çizim önbelleği için) */
  version = 0;

  constructor(
    readonly capacity = 50000,
    readonly maxSpanMs = 30 * 60 * 1000,
  ) {
    this.ring = new Float64Array(capacity);
  }

  /** Yeni kayıt başlat: t anındaki değerler init olur */
  begin(t: number, init: Record<string, number> = {}): void {
    this.reset();
    this.start = this.end = t;
    this.active = true;
    for (const [k, v] of Object.entries(init)) this.ensure(k, v);
  }

  /** Kaydı sil, durdur */
  clear(): void {
    this.reset();
    this.active = false;
  }

  private reset(): void {
    this.sigs.clear();
    this.obj = {};
    this.head = this.count = 0;
    this.start = this.end = 0;
    this.version++;
  }

  /** Cihaz kayıtta yoksa ekle (v: şimdiki değer). Kayıt başladıktan sonra eklenen cihazın öncesi bilinmez. */
  ensure(key: string, v: number): void {
    if (this.sigs.has(key)) return;
    const s: RecSig = { init: v, t: [], v: [], last: v };
    if (this.end > this.start) s.from = this.end;
    this.sigs.set(key, s);
    this.obj[key] = s;
    this.version++;
  }

  has(key: string): boolean {
    return this.sigs.has(key);
  }

  /** t anında key = v (değişmediyse kayıt yok) */
  set(key: string, t: number, v: number): void {
    if (!this.active) return;
    const s = this.sigs.get(key);
    if (!s) {
      this.ensure(key, v);
      return;
    }
    if (t > this.end) this.end = t;
    if (s.last === v) return;
    s.last = v;
    const n = s.t.length;
    if (n && s.t[n - 1] === t) {
      // aynı anda ikinci değişim: üzerine yaz; önceki değere döndüyse kaydı sil
      const prev = n >= 2 ? s.v[n - 2]! : s.init;
      if (prev === v) {
        s.t.pop();
        s.v.pop();
      } else s.v[n - 1] = v;
      this.version++;
      return;
    }
    if (this.count === this.capacity) this.dropOldest();
    s.t.push(t);
    s.v.push(v);
    this.ring[(this.head + this.count) % this.capacity] = t;
    this.count++;
    this.version++;
  }

  /** Tarama bitti: kaydın sonu t */
  advance(t: number): void {
    if (!this.active) return;
    if (t > this.end) this.end = t;
    if (this.end - this.start > this.maxSpanMs) this.trim(this.end - this.maxSpanMs * 0.9);
  }

  /** Tampon dolu: en eski çeyreği düşür */
  private dropOldest(): void {
    let cut = this.ring[(this.head + Math.floor(this.capacity / 4)) % this.capacity]!;
    this.trim(cut);
    if (this.count === this.capacity) {
      cut += 1e-6;
      this.trim(cut);
    }
  }

  /** cut'tan önceki değişimleri düşür, start = cut */
  private trim(cut: number): void {
    if (cut <= this.start) return;
    for (const s of this.sigs.values()) {
      let k = 0;
      while (k < s.t.length && s.t[k]! < cut) k++;
      if (k) {
        s.init = s.v[k - 1]!;
        s.t.splice(0, k);
        s.v.splice(0, k);
      }
      if (s.from !== undefined && s.from <= cut) delete s.from;
    }
    while (this.count && this.ring[this.head]! < cut) {
      this.head = (this.head + 1) % this.capacity;
      this.count--;
    }
    this.start = cut;
    this.version++;
  }

  /** Toplam kayıtlı değişim sayısı */
  get size(): number {
    return this.count;
  }

  /** Canlı iz (kopya değil; çizim için). Saklamak gerekiyorsa snapshot() kullan. */
  trace(): Trace {
    return { start: this.start, end: this.end, signals: this.obj };
  }

  /** Bağımsız kopya (JSON'a uygun) */
  snapshot(): Trace {
    const signals: Record<string, TraceSignal> = {};
    for (const [k, s] of this.sigs) {
      signals[k] = { init: s.init, t: [...s.t], v: [...s.v] };
      if (s.from !== undefined) signals[k].from = s.from;
    }
    return { start: this.start, end: this.end, signals };
  }
}
