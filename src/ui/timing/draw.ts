// Dalga biçimi çizimi (canvas, React'siz). Ekrandaki görünüm ve PNG dışa aktarımı aynı işlevleri kullanır.
// Girdi yalnızca iz (Trace) ve görünür zaman aralığıdır; kayıttan bağımsızdır.

import { diffRanges, formatMs, isWordKey, niceTickStep, signalIndex, valueAt, type Trace, type TraceSignal } from '../../core';

export interface WavePalette {
  bg: string;
  band: string;
  grid: string;
  ink: string;
  ink2: string;
  ink3: string;
  on: string;
  onSoft: string;
  word: string;
  wordSoft: string;
  err: string;
  errSoft: string;
  curA: string;
  curB: string;
}

/** Ekrandaki renkler: app.css belirteçlerinden */
export function readPalette(el: Element): WavePalette {
  const cs = getComputedStyle(el);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return {
    bg: v('--canvas', '#fbfcfa'),
    band: v('--panel-2', '#e6eae8'),
    grid: v('--line-2', '#d6dcd9'),
    ink: v('--ink', '#1c2225'),
    ink2: v('--ink-2', '#47525a'),
    ink3: v('--ink-3', '#75817f'),
    on: v('--on', '#0f9a4b'),
    onSoft: v('--on-soft', 'rgba(15,154,75,0.14)'),
    word: v('--accent', '#1f4fa3'),
    wordSoft: v('--accent-2', '#e3ebf8'),
    err: v('--err', '#c2362b'),
    errSoft: v('--err-soft', '#fbe9e7'),
    curA: v('--accent', '#1f4fa3'),
    curB: v('--warn', '#9a6408'),
  };
}

/** Baskıya uygun açık palet (PNG): beyaz zemin, koyu çizgi */
export const PRINT_PALETTE: WavePalette = {
  bg: '#ffffff',
  band: '#f3f5f4',
  grid: '#dde2e0',
  ink: '#111111',
  ink2: '#333333',
  ink3: '#6b7472',
  on: '#111111',
  onSoft: 'rgba(15, 154, 75, 0.16)',
  word: '#1f4fa3',
  wordSoft: '#e3ebf8',
  err: '#c2362b',
  errSoft: '#fbe0dc',
  curA: '#1f4fa3',
  curB: '#b06f00',
};

export interface WaveGeom {
  /** Çizim alanı genişliği (CSS px) */
  width: number;
  rowH: number;
  /** Görünür aralık (ms) */
  t0: number;
  t1: number;
}

export interface Cursors {
  a: number | null;
  b: number | null;
}

export const xOf = (g: WaveGeom, t: number): number => ((t - g.t0) / (g.t1 - g.t0)) * g.width;
export const tOf = (g: WaveGeom, x: number): number => g.t0 + (x / g.width) * (g.t1 - g.t0);

const MONO = "'JetBrains Mono', ui-monospace, Consolas, monospace";

/** Kelime izinin ölçeği (tüm iz üzerinden; kaydırınca değişmesin) */
function wordRange(...sigs: (TraceSignal | undefined)[]): [number, number] {
  let lo = 0;
  let hi = 0;
  for (const s of sigs) {
    if (!s) continue;
    lo = Math.min(lo, s.init);
    hi = Math.max(hi, s.init);
    for (const v of s.v) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (hi === lo) hi = lo + 1;
  return [lo, hi];
}

interface Seg {
  a: number;
  b: number;
  v: number;
}

/** Görünür aralıktaki sabit değerli bölümler (sinyalin bilindiği ve kaydın bittiği yere kadar) */
function segments(sig: TraceSignal, t0: number, t1: number, end: number): Seg[] {
  const from = Math.max(t0, sig.from ?? -Infinity);
  const to = Math.min(t1, end);
  const out: Seg[] = [];
  if (to <= from) return out;
  let i = signalIndex(sig, from);
  let cur = i < 0 ? sig.init : sig.v[i]!;
  let a = from;
  for (i = i + 1; i < sig.t.length; i++) {
    const t = sig.t[i]!;
    if (t > to) break;
    if (t > a) out.push({ a, b: t, v: cur });
    cur = sig.v[i]!;
    a = Math.max(a, t);
  }
  out.push({ a, b: to, v: cur });
  return out;
}

function drawBit(ctx: CanvasRenderingContext2D, g: WaveGeom, y0: number, sig: TraceSignal, end: number, color: string, fill: string | null, dashed: boolean): void {
  const hi = y0 + 7;
  const lo = y0 + g.rowH - 7;
  const segs = segments(sig, g.t0, g.t1, end);
  if (!segs.length) return;
  if (fill) {
    ctx.fillStyle = fill;
    for (const s of segs) if (s.v) ctx.fillRect(xOf(g, s.a), hi, Math.max(1, xOf(g, s.b) - xOf(g, s.a)), lo - hi);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = dashed ? 1.5 : 2;
  ctx.setLineDash(dashed ? [5, 4] : []);
  ctx.beginPath();
  let lastPx = NaN;
  segs.forEach((s, k) => {
    const xa = Math.round(xOf(g, s.a)) + 0.5;
    const xb = Math.round(xOf(g, s.b)) + 0.5;
    const y = s.v ? hi : lo;
    if (k === 0) ctx.moveTo(xa, y);
    else {
      if (xa === lastPx) {
        // aynı piksele düşen hızlı değişimler: dikey çizgi (etkinlik işareti)
        ctx.moveTo(xa, hi);
        ctx.lineTo(xa, lo);
        ctx.moveTo(xa, y);
      } else ctx.lineTo(xa, y);
    }
    ctx.lineTo(xb, y);
    lastPx = xb;
  });
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawWord(ctx: CanvasRenderingContext2D, g: WaveGeom, y0: number, sig: TraceSignal, end: number, range: [number, number], pal: WavePalette, dashed: boolean): void {
  const top = y0 + 6;
  const bot = y0 + g.rowH - 5;
  const yv = (v: number) => bot - ((v - range[0]) / (range[1] - range[0])) * (bot - top);
  const segs = segments(sig, g.t0, g.t1, end);
  if (!segs.length) return;
  if (!dashed) {
    ctx.fillStyle = pal.wordSoft;
    for (const s of segs) {
      const y = yv(s.v);
      const y0v = yv(Math.max(range[0], Math.min(0, range[1])));
      ctx.fillRect(xOf(g, s.a), Math.min(y, y0v), Math.max(1, xOf(g, s.b) - xOf(g, s.a)), Math.abs(y0v - y));
    }
  }
  ctx.strokeStyle = dashed ? pal.ink3 : pal.word;
  ctx.lineWidth = dashed ? 1.5 : 1.75;
  ctx.setLineDash(dashed ? [5, 4] : []);
  ctx.beginPath();
  segs.forEach((s, k) => {
    const y = yv(s.v);
    if (k === 0) ctx.moveTo(xOf(g, s.a), y);
    else ctx.lineTo(xOf(g, s.a), y);
    ctx.lineTo(xOf(g, s.b), y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  if (dashed) return;
  // değer etiketleri: yeterince geniş bölümlere
  ctx.font = `600 10.5px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = pal.ink;
  let lastRight = -Infinity;
  for (const s of segs) {
    const xa = xOf(g, s.a);
    const xb = xOf(g, s.b);
    const txt = String(s.v);
    const w = ctx.measureText(txt).width + 8;
    if (xb - xa < w) continue;
    const cx = (Math.max(0, xa) + Math.min(g.width, xb)) / 2;
    if (cx - w / 2 < lastRight || Math.min(g.width, xb) - Math.max(0, xa) < w) continue;
    const y = yv(s.v);
    const ty = y - 7 < top ? y + 8 : y - 7;
    ctx.fillText(txt, cx, Math.min(bot - 4, Math.max(top + 3, ty)));
    lastRight = cx + w / 2;
  }
}

export interface RowsInput {
  rows: { key: string }[];
  trace: Trace;
  expected?: Trace | null;
  /** Ayrışan aralıkları vurgula (expected verildiyse varsayılan açık) */
  showDiff?: boolean;
  cursors?: Cursors;
}

/** Saniye/işaret çizgileri için adım */
export const tickStep = (g: WaveGeom): number => niceTickStep((g.t1 - g.t0) / Math.max(1, g.width));

/** Satırları (0,0)'dan başlayarak çizer */
export function drawRows(ctx: CanvasRenderingContext2D, g: WaveGeom, inp: RowsInput, pal: WavePalette): void {
  const { rows, trace, expected } = inp;
  const h = rows.length * g.rowH;
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, g.width, h);
  // satır bantları
  rows.forEach((_, i) => {
    if (i % 2 === 1) {
      ctx.fillStyle = pal.band;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(0, i * g.rowH, g.width, g.rowH);
      ctx.globalAlpha = 1;
    }
  });
  // zaman ızgarası
  const step = tickStep(g);
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let t = Math.ceil(g.t0 / step) * step; t <= g.t1; t += step) {
    const x = Math.round(xOf(g, t)) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  ctx.stroke();
  // kaydın bittiği yerden sonrası (gelecek): hafif tarama
  const xe = xOf(g, trace.end);
  if (xe < g.width) {
    ctx.fillStyle = pal.band;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(Math.max(0, xe), 0, g.width - Math.max(0, xe), h);
    ctx.globalAlpha = 1;
  }
  const diffOn = !!expected && inp.showDiff !== false;
  const endE = expected ? expected.end : 0;
  rows.forEach((r, i) => {
    const y0 = i * g.rowH;
    const sig = trace.signals[r.key];
    const exp = expected?.signals[r.key];
    if (diffOn && exp) {
      const until = Math.min(trace.end, endE);
      ctx.fillStyle = pal.errSoft;
      for (const [a, b] of diffRanges(sig, exp, Math.max(g.t0, Math.min(trace.start, expected!.start)), Math.min(g.t1, until))) {
        const xa = xOf(g, a);
        ctx.fillRect(xa, y0 + 1, Math.max(2, xOf(g, b) - xa), g.rowH - 2);
      }
    }
    if (isWordKey(r.key)) {
      const range = wordRange(sig, exp);
      if (exp) drawWord(ctx, g, y0, exp, endE, range, pal, true);
      if (sig) drawWord(ctx, g, y0, sig, trace.end, range, pal, false);
    } else {
      if (exp) drawBit(ctx, g, y0, exp, endE, pal.ink3, null, true);
      if (sig) drawBit(ctx, g, y0, sig, trace.end, pal.on, pal.onSoft, false);
    }
    if (!sig && !exp) {
      ctx.fillStyle = pal.ink3;
      ctx.font = `11px ${MONO}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('kayıt yok', 8, y0 + g.rowH / 2);
    }
    ctx.fillStyle = pal.grid;
    ctx.fillRect(0, y0 + g.rowH - 1, g.width, 1);
  });
  drawCursorLines(ctx, g, h, inp.cursors, pal);
}

function drawCursorLines(ctx: CanvasRenderingContext2D, g: WaveGeom, h: number, c: Cursors | undefined, pal: WavePalette): void {
  if (!c) return;
  if (c.a !== null && c.b !== null) {
    const xa = xOf(g, Math.min(c.a, c.b));
    const xb = xOf(g, Math.max(c.a, c.b));
    ctx.fillStyle = pal.curA;
    ctx.globalAlpha = 0.07;
    ctx.fillRect(xa, 0, xb - xa, h);
    ctx.globalAlpha = 1;
  }
  for (const [t, col] of [
    [c.a, pal.curA],
    [c.b, pal.curB],
  ] as const) {
    if (t === null) continue;
    const x = Math.round(xOf(g, t)) + 0.5;
    if (x < -2 || x > g.width + 2) continue;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}

/** Saniye/işaret metni: 0 → "0 s", 1500 → "1,5 s", 20 → "20 ms" */
export function tickLabel(t: number, step: number): string {
  if (step < 100 && Math.abs(t) < 1000) return formatMs(t);
  return formatMs(Math.round(t));
}

/** Zaman ekseni (yükseklik h) ve imleç etiketleri */
export function drawAxis(ctx: CanvasRenderingContext2D, g: WaveGeom, h: number, pal: WavePalette, cursors?: Cursors): void {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, g.width, h);
  const step = tickStep(g);
  const minor = step / 5;
  ctx.strokeStyle = pal.ink3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let t = Math.ceil(g.t0 / minor) * minor; t <= g.t1; t += minor) {
    const x = Math.round(xOf(g, t)) + 0.5;
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    ctx.moveTo(x, h);
    ctx.lineTo(x, h - (major ? 7 : 3));
  }
  ctx.moveTo(0, h - 0.5);
  ctx.lineTo(g.width, h - 0.5);
  ctx.stroke();
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  const a = cursors?.a ?? null;
  const b = cursors?.b ?? null;
  // Δt etiketi: önce yeri hesaplanır, çakışan saniye etiketleri atlanır
  let dtBox: [number, number] | null = null;
  let dtTxt = '';
  let dtX = 0;
  if (a !== null && b !== null) {
    const xa = xOf(g, Math.min(a, b));
    const xb = xOf(g, Math.max(a, b));
    ctx.fillStyle = pal.curA;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(xa, 0, xb - xa, h);
    ctx.globalAlpha = 1;
    dtTxt = 'Δt ' + formatMs(Math.abs(b - a));
    ctx.font = `700 11px ${MONO}`;
    const w = ctx.measureText(dtTxt).width + 10;
    dtX = Math.max(w / 2, Math.min(g.width - w / 2, (xa + xb) / 2));
    dtBox = [dtX - w / 2, dtX + w / 2];
  }
  ctx.fillStyle = pal.ink2;
  ctx.font = `500 11px ${MONO}`;
  for (let t = Math.ceil(g.t0 / step) * step; t <= g.t1; t += step) {
    const x = xOf(g, t);
    if (x < 14 || x > g.width - 14) continue;
    const lbl = tickLabel(t, step);
    const half = ctx.measureText(lbl).width / 2 + 3;
    if (dtBox && x + half > dtBox[0] && x - half < dtBox[1]) continue;
    ctx.fillText(lbl, x, 3);
  }
  if (dtBox) {
    ctx.font = `700 11px ${MONO}`;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(dtBox[0], 2, dtBox[1] - dtBox[0], 15);
    ctx.fillStyle = pal.ink;
    ctx.fillText(dtTxt, dtX, 4);
  }
  for (const [t, col, name] of [
    [a, pal.curA, 'A'],
    [b, pal.curB, 'B'],
  ] as const) {
    if (t === null) continue;
    const x = xOf(g, t);
    if (x < -2 || x > g.width + 2) continue;
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x) - 7, h - 15, 14, 14);
    ctx.fillStyle = pal.bg;
    ctx.font = `700 10px ${MONO}`;
    ctx.fillText(name, Math.round(x), h - 13);
  }
}

/** Değer metni (başlıklarda ve PNG'de) */
export const valueText = (key: string, sig: TraceSignal | undefined, t: number): string => {
  if (!sig) return '—';
  if (sig.from !== undefined && t < sig.from) return '?';
  const v = valueAt(sig, t);
  return isWordKey(key) ? String(v) : v ? '1' : '0';
};
