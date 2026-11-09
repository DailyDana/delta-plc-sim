// Ladder ağacını çizilecek sahneye çevirir (saf fonksiyon: test edilebilir, React'ten bağımsız).
// Her tel bir "güç anahtarı" taşır; canlı görünümde anahtarın değeri teli yeşile boyar.

import type { Coil, ContactKind, Ladder, OutBranch, Series, Block } from '../../core';
import type { Slot } from '../state/edit';

export const CW = 92; // kontak hücresi
export const RH = 64; // satır yüksekliği
export const HEAD = 22; // satır üstü açıklama payı
export const LEFT = 56; // sol ray
export const COILW = 196; // bobin alanı
export const GAP = 20;

export interface WireItem {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Güç anahtarı; yoksa tel hiç enerjilenmez (bobin sonrası) */
  pw?: string;
}
export interface ContactItem {
  id: string;
  kind: ContactKind;
  op: string;
  x: number;
  cy: number;
  ri: number;
}
export interface CoilItem {
  id: string;
  coil: Coil;
  x: number;
  cy: number;
  ri: number;
}
export interface RungItem {
  id: string;
  ri: number;
  y: number;
  h: number;
  top: number;
  comment: string;
}
export interface Scene {
  width: number;
  height: number;
  coilX: number;
  rightX: number;
  bottomY: number;
  wires: WireItem[];
  contacts: ContactItem[];
  coils: CoilItem[];
  rungs: RungItem[];
  slots: Slot[];
  /** Klavye gezintisi için öğelerin görsel sırası: satır satır, soldan sağa */
  order: { id: string; ri: number; x: number; y: number }[];
}

interface Size {
  w: number;
  h: number;
}
const bsz = (b: Block): Size => {
  if (b.t === 'c') return { w: 1, h: 1 };
  let w = 0;
  let h = 0;
  for (const br of b.branches) {
    const s = ssz(br);
    w = Math.max(w, s.w);
    h += s.h;
  }
  return { w, h };
};
export const ssz = (s: Series): Size => {
  let w = 0;
  let h = 1;
  for (const b of s) {
    const z = bsz(b);
    w += z.w;
    h = Math.max(h, z.h);
  }
  return { w, h };
};
const osz = (o: OutBranch): Size => {
  const p = ssz(o.pre);
  if (!o.children || !o.children.length) return p;
  let w = 0;
  let h = 0;
  for (const c of o.children) {
    const z = osz(c);
    w = Math.max(w, z.w);
    h += z.h;
  }
  return { w: p.w + w, h: Math.max(p.h, h) };
};
const listSize = (list: OutBranch[]): Size => {
  let w = 0;
  let h = 0;
  for (const o of list) {
    const z = osz(o);
    w = Math.max(w, z.w);
    h += z.h;
  }
  return { w, h: Math.max(1, h) };
};

export function layout(l: Ladder): Scene {
  let cols = 3;
  for (const r of l.rungs) cols = Math.max(cols, ssz(r.input).w + listSize(r.outputs).w + 1);
  const colEnd = LEFT + cols * CW;
  const coilX = colEnd + GAP;
  const rightX = coilX + COILW + 14;
  const sc: Scene = { width: rightX + 18, height: 0, coilX, rightX, bottomY: 0, wires: [], contacts: [], coils: [], rungs: [], slots: [], order: [] };
  const wire = (x1: number, y1: number, x2: number, y2: number, pw?: string) => sc.wires.push(pw === undefined ? { x1, y1, x2, y2 } : { x1, y1, x2, y2, pw });

  let ri = 0;
  // ctx: bırakma noktası türü; null = nokta yok
  const drawSeries = (s: Series, owner: { owner: string; k: 'input' | 'pre' | number }, x: number, y: number, w: number, pw: string, ctx: 'input' | 'branch' | 'pre' | null): string => {
    let cx = x;
    const cy = y + RH / 2;
    const inset = ctx === 'branch' ? 14 : ctx === 'pre' ? 16 : 0;
    if (ctx && s.length === 0) sc.slots.push({ t: 'c', ser: owner, index: 0, ctx, x: x + 26, y: cy });
    s.forEach((b, i) => {
      if (ctx) sc.slots.push({ t: 'c', ser: owner, index: i, ctx, x: cx + (i === 0 ? inset : 0), y: cy });
      const z = bsz(b);
      drawBlock(b, cx, y, z, pw);
      pw = b.id + ':out';
      cx += z.w * CW;
    });
    if (ctx && s.length) sc.slots.push({ t: 'c', ser: owner, index: s.length, ctx, x: cx - (ctx === 'branch' ? 14 : ctx === 'input' ? 6 : 0), y: cy });
    const ex = x + w * CW;
    if (ex > cx + 0.5) wire(cx, cy, ex, cy, pw);
    return pw;
  };

  const drawBlock = (b: Block, x: number, y: number, z: Size, pw: string): void => {
    if (b.t === 'c') {
      const cy = y + RH / 2;
      const m = x + CW / 2;
      wire(x, cy, m - 10, cy, b.id + ':in');
      wire(m + 10, cy, x + CW, cy, b.id + ':out');
      sc.contacts.push({ id: b.id, kind: b.kind, op: b.op, x, cy, ri });
      sc.order.push({ id: b.id, ri, x: m, y: cy });
      sc.slots.push({ t: 'p', id: b.id, x: m, y: cy + RH / 2 - 4 });
      return;
    }
    const W = z.w * CW;
    let by = y;
    let last = y + RH / 2;
    b.branches.forEach((br, k) => {
      last = by + RH / 2;
      drawSeries(br, { owner: b.id, k }, x, by, z.w, b.id + ':in', 'branch');
      by += ssz(br).h * RH;
    });
    wire(x, y + RH / 2, x, last, b.id + ':in');
    wire(x + W, y + RH / 2, x + W, last, b.id + ':out');
    // paralel bloğa giren güç = önceki öğenin çıkışı (anahtar eşlemesi power.ts'te)
    void pw;
  };

  const drawOutputs = (list: OutBranch[], listRef: { owner: string; k: 'outputs' | 'children' }, J: number, y: number, pwJ: string, rungId: string, showPre: boolean): number => {
    let oy = y;
    let prevCy: number | null = null;
    list.forEach((o, oi) => {
      const cy = oy + RH / 2;
      if (prevCy !== null) wire(J, prevCy, J, cy, pwJ);
      const pz = ssz(o.pre);
      const hasKids = !!(o.children && o.children.length);
      // Ön seri: bobinliyse kolon sonuna kadar uzar; alt dallıysa yalnızca kendi genişliği kadar
      const preW = hasKids ? pz.w : Math.max(pz.w, (colEnd - J) / CW);
      const pout = drawSeries(o.pre, { owner: o.id, k: 'pre' }, J, oy, preW, pwJ, showPre ? 'pre' : null);
      const pkey = o.pre.length ? pout : pwJ;
      let h = pz.h;
      if (hasKids) {
        const kh = drawOutputs(o.children!, { owner: o.id, k: 'children' }, J + pz.w * CW, oy, pkey, rungId, true);
        h = Math.max(h, kh);
      } else if (o.coil) {
        wire(colEnd, cy, coilX, cy, o.id + ':q');
        sc.coils.push({ id: o.id, coil: o.coil, x: coilX, cy, ri });
        sc.order.push({ id: o.id, ri, x: coilX + COILW / 2, y: cy });
      }
      if (!hasKids) sc.slots.push({ t: 'o', list: listRef, index: oi + 1, rungId, x: coilX + COILW / 2, y: oy + h * RH - 3 });
      prevCy = cy;
      oy += h * RH;
    });
    return Math.max(1, (oy - y) / RH);
  };

  let y = 8;
  l.rungs.forEach((r, i) => {
    ri = i;
    const iz = ssz(r.input);
    const oz = listSize(r.outputs);
    const rows = Math.max(iz.h, oz.h);
    const top = y + HEAD;
    const H = rows * RH;
    sc.rungs.push({ id: r.id, ri: i, y, h: HEAD + H, top, comment: r.comment });
    sc.slots.push({ t: 'r', index: i, x: (LEFT + rightX) / 2, y: y + 1, x0: LEFT, x1: rightX });
    sc.order.push({ id: r.id, ri: i, x: LEFT - 20, y: top + RH / 2 - 0.5 });
    let pwJ = drawSeries(r.input, { owner: r.id, k: 'input' }, LEFT, top, iz.w, '1', 'input');
    if (r.input.length === 0) pwJ = '1';
    const J = LEFT + iz.w * CW;
    // Tek çıkışlı satırda "çıkış dalına kontak" ile "satır sonuna seri" aynı şeydir: ayrı nokta gösterme
    const preSlots = r.outputs.length > 1 || r.outputs.some((o) => o.pre.length || o.children);
    drawOutputs(r.outputs, { owner: r.id, k: 'outputs' }, J, top, pwJ, r.id, preSlots);
    if (r.outputs.length === 0) wire(J, top + RH / 2, coilX, top + RH / 2, pwJ);
    y = top + H + 10;
  });
  sc.bottomY = y;
  sc.slots.push({ t: 'r', index: l.rungs.length, x: (LEFT + rightX) / 2, y: y + 24, x0: LEFT, x1: rightX });
  sc.height = y + 60;
  // görsel sıra: satır, sonra y, sonra x
  sc.order.sort((a, b) => a.ri - b.ri || a.y - b.y || a.x - b.x);
  return sc;
}
