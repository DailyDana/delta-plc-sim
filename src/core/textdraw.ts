// Ladder'ı düz metin olarak çizer (terminal / CLI için).
//   1 ├┬──┤ X0 ├──┬──┤/X1 ├────( Y0 )
//     │└──┤ Y0 ├──┘

import { isMcrRung, type Contact, type Ladder, type OutBranch, type Parallel, type Series } from './ladder';

/** Kontak hücresindeki metin: "X0", karşılaştırmada "D0>=K10", INV için "INV" */
const cText = (b: Contact): string => (b.kind === 'CMP' ? `${b.d32 ? 'D' : ''}${b.op}${b.cmp}${b.op2}` : b.kind === 'INV' ? 'INV' : b.op);

class Canvas {
  private rows: string[][] = [];
  put(x: number, y: number, s: string): void {
    const row = (this.rows[y] ??= []);
    const chars = [...s];
    for (let i = 0; i < chars.length; i++) row[x + i] = chars[i]!;
  }
  fill(x0: number, x1: number, y: number, ch = '─'): void {
    for (let x = x0; x < x1; x++) this.put(x, y, ch);
  }
  toString(): string {
    return this.rows.map((r) => Array.from(r ?? [], (c) => c ?? ' ').join('').replace(/\s+$/, '')).join('\n');
  }
}

export function drawLadderText(l: Ladder): string {
  // Kontak hücresi genişliği: en uzun adres + 8 ("──┤ " + adres + " ├──")
  let L = 2;
  const scanOps = (s: Series): void =>
    s.forEach((b) => {
      if (b.t === 'c') L = Math.max(L, cText(b).length);
      else b.branches.forEach(scanOps);
    });
  const scanOuts = (list: OutBranch[]): void =>
    list.forEach((b) => {
      scanOps(b.pre);
      if (b.children) scanOuts(b.children);
    });
  l.rungs.forEach((r) => {
    scanOps(r.input);
    scanOuts(r.outputs);
  });
  const CW = L + 8;

  const bw = (b: Series[number]): number => (b.t === 'c' ? CW : Math.max(0, ...b.branches.map(sw)) + 2);
  const bh = (b: Series[number]): number => (b.t === 'c' ? 1 : b.branches.reduce((a, br) => a + sh(br), 0));
  const sw = (s: Series): number => s.reduce((a, b) => a + bw(b), 0);
  const sh = (s: Series): number => Math.max(1, ...s.map(bh));
  const ow = (list: OutBranch[]): number => (list.length > 1 ? 1 : 0) + Math.max(0, ...list.map((b) => sw(b.pre) + (b.children ? ow(b.children) : 0)));
  const obh = (b: OutBranch): number => Math.max(sh(b.pre), b.children ? oh(b.children) : 1);
  const oh = (list: OutBranch[]): number => Math.max(1, list.reduce((a, b) => a + obh(b), 0));

  const X0 = 5;
  const coilX = Math.max(...l.rungs.map((r) => X0 + sw(r.input) + ow(r.outputs)), X0 + 10) + 3;
  const cv = new Canvas();

  const connector = (x: number, y: number, starts: number[], right: boolean): void => {
    const last = starts[starts.length - 1] ?? y;
    for (let r = y; r <= last; r++) {
      const isStart = starts.includes(r);
      let ch = '│';
      if (r === y) ch = '┬';
      else if (r === last) ch = right ? '┘' : '└';
      else if (isStart) ch = right ? '┤' : '├';
      cv.put(x, r, ch);
    }
  };

  const drawSeries = (s: Series, x: number, y: number, w: number): void => {
    let cx = x;
    for (const b of s) {
      if (b.t === 'c') {
        if (b.kind === 'INV') cv.put(cx, y, `──┤╱${'INV'.padEnd(L)} ├──`);
        else if (b.kind === 'CMP') cv.put(cx, y, `──[${cText(b).padEnd(L)} ]──`);
        else {
          const sym = b.kind === 'NC' ? '/' : b.kind === 'P' ? '↑' : b.kind === 'F' ? '↓' : ' ';
          cv.put(cx, y, `──┤${sym}${b.op.padEnd(L)} ├──`);
        }
      } else drawPar(b, cx, y);
      cx += bw(b);
    }
    cv.fill(cx, x + w, y);
  };

  const drawPar = (p: Parallel, x: number, y: number): void => {
    const W = bw(p);
    const starts: number[] = [];
    let by = y;
    for (const br of p.branches) {
      starts.push(by);
      drawSeries(br, x + 1, by, W - 2);
      by += sh(br);
    }
    connector(x, y, starts, false);
    connector(x + W - 1, y, starts, true);
  };

  const coilText = (b: OutBranch): string => {
    const c = b.coil!;
    if (c.type === 'OUT') return `( ${c.op} )`;
    if (c.type === 'TMR' || c.type === 'CNT') return `[${c.type} ${c.op} ${/^D/i.test(c.k) ? c.k.toUpperCase() : 'K' + c.k}]`;
    return `[${[c.type, c.op, ...(c.args ?? [])].join(' ')}]`;
  };

  const drawOuts = (list: OutBranch[], x: number, y: number): void => {
    const x1 = list.length > 1 ? x + 1 : x;
    const starts: number[] = [];
    let yb = y;
    for (const b of list) {
      starts.push(yb);
      drawSeries(b.pre, x1, yb, sw(b.pre));
      const nx = x1 + sw(b.pre);
      if (b.children && b.children.length) drawOuts(b.children, nx, yb);
      else {
        cv.fill(nx, coilX, yb);
        cv.put(coilX, yb, coilText(b));
      }
      yb += obh(b);
    }
    if (list.length > 1) connector(x, y, starts, false);
  };

  let y = 0;
  l.rungs.forEach((r, ri) => {
    if (r.comment) cv.put(X0, y++, '; ' + r.comment.split('\n')[0]);
    const h = Math.max(sh(r.input), oh(r.outputs));
    cv.put(0, y, String(ri + 1).padStart(3) + ' ├');
    for (let k = 1; k < h; k++) cv.put(4, y + k, '│');
    if (r.input.length === 0 && !isMcrRung(r)) cv.put(X0, y, '──┤ M1000 ├──');
    drawSeries(r.input, X0, y, sw(r.input));
    drawOuts(r.outputs, X0 + sw(r.input), y);
    y += h;
    cv.put(4, y++, '│');
  });

  let text = cv.toString();
  const labels = Object.entries(l.labels).filter(([, v]) => v);
  if (labels.length) text += '\n\nEtiketler: ' + labels.map(([k, v]) => `${k} = ${v}`).join(', ');
  return text;
}
