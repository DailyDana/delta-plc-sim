// Ladder ağacı üzerinde düzenleme işlemleri. Hepsi verilen ağacı yerinde değiştirir; çağıran önce
// cloneLadder ile kopyalar (store değişmez kalır). Kimlikler korunur, böylece seçim düzenlemeden sonra da geçerli.

import { contact, parallel, rung as mkRung, type Block, type Coil, type Contact, type Ladder, type OutBranch, type Parallel, type Rung, type Series } from '../../core/ladder';
import { isOctalType, parseAddress } from '../../core/devices';
import type { CoilType, ContactKind } from '../../core/instructions';

let seq = 1;
const nid = (): string => 'u' + Date.now().toString(36) + (seq++).toString(36);

export const newCoilBranch = (c: Coil): OutBranch => ({ id: nid(), pre: [], coil: c });
export const newContact = (kind: ContactKind, op: string): Contact => ({ ...contact(kind, op), id: nid() });

// ------------------------------------------------------------------ konum bulma
export type SeriesRef = { owner: string; k: 'input' | 'pre' | number };
export type ListRef = { owner: string; k: 'outputs' | 'children' };

export interface ContactLoc {
  kind: 'contact';
  node: Contact;
  series: Series;
  index: number;
  /** Kontak paralel bir dalın içindeyse o paralel ve paralelin bulunduğu seri */
  parent: { par: Parallel; series: Series; index: number } | null;
  ri: number;
  r: Rung;
  /** Kontak bir çıkış dalının ön serisindeyse o dal */
  branch: OutBranch | null;
}
export interface OutputLoc {
  kind: 'output';
  o: OutBranch;
  list: OutBranch[];
  oi: number;
  /** Üst dal (iç içe MPS); en üst düzeyde null */
  up: OutBranch | null;
  ri: number;
  r: Rung;
}
export interface RungLoc {
  kind: 'rung';
  ri: number;
  r: Rung;
}
export type Loc = ContactLoc | OutputLoc | RungLoc;

function findInSeries(s: Series, id: string, parent: ContactLoc['parent']): Omit<ContactLoc, 'ri' | 'r' | 'branch'> | null {
  for (let i = 0; i < s.length; i++) {
    const b = s[i]!;
    if (b.t === 'c' && b.id === id) return { kind: 'contact', node: b, series: s, index: i, parent };
    if (b.t === 'p')
      for (const br of b.branches) {
        const f = findInSeries(br, id, { par: b, series: s, index: i });
        if (f) return f;
      }
  }
  return null;
}

export function locate(l: Ladder, id: string | null): Loc | null {
  if (!id) return null;
  for (let ri = 0; ri < l.rungs.length; ri++) {
    const r = l.rungs[ri]!;
    if (r.id === id) return { kind: 'rung', ri, r };
    const f = findInSeries(r.input, id, null);
    if (f) return { ...f, ri, r, branch: null };
    const walk = (list: OutBranch[], up: OutBranch | null): Loc | null => {
      for (let oi = 0; oi < list.length; oi++) {
        const o = list[oi]!;
        if (o.id === id) return { kind: 'output', o, list, oi, up, ri, r };
        const g = findInSeries(o.pre, id, null);
        if (g) return { ...g, ri, r, branch: o };
        if (o.children) {
          const h = walk(o.children, o);
          if (h) return h;
        }
      }
      return null;
    };
    const w = walk(r.outputs, null);
    if (w) return w;
  }
  return null;
}

/** Bir id'nin bulunduğu satır (rung) indeksi */
export const rungIndexOf = (l: Ladder, id: string | null): number => {
  const loc = locate(l, id);
  return loc ? loc.ri : -1;
};

function findPar(l: Ladder, id: string): Parallel | null {
  let found: Parallel | null = null;
  const scan = (s: Series) => {
    for (const b of s) {
      if (found) return;
      if (b.t === 'p') {
        if (b.id === id) found = b;
        else b.branches.forEach(scan);
      }
    }
  };
  for (const r of l.rungs) {
    scan(r.input);
    const walk = (list: OutBranch[]) => list.forEach((o) => (scan(o.pre), o.children && walk(o.children)));
    walk(r.outputs);
  }
  return found;
}

function findBranch(l: Ladder, id: string): OutBranch | null {
  for (const r of l.rungs) {
    const walk = (list: OutBranch[]): OutBranch | null => {
      for (const o of list) {
        if (o.id === id) return o;
        if (o.children) {
          const f = walk(o.children);
          if (f) return f;
        }
      }
      return null;
    };
    const f = walk(r.outputs);
    if (f) return f;
  }
  return null;
}

export function resolveSeries(l: Ladder, ref: SeriesRef): Series | null {
  if (ref.k === 'input') return l.rungs.find((r) => r.id === ref.owner)?.input ?? null;
  if (ref.k === 'pre') return findBranch(l, ref.owner)?.pre ?? null;
  return findPar(l, ref.owner)?.branches[ref.k] ?? null;
}

export function resolveList(l: Ladder, ref: ListRef): OutBranch[] | null {
  if (ref.k === 'outputs') return l.rungs.find((r) => r.id === ref.owner)?.outputs ?? null;
  return findBranch(l, ref.owner)?.children ?? null;
}

// ------------------------------------------------------------------ toparlama
/** Boş dalları, tek dallı paralelleri ve tek çocuklu ara düğümleri temizler (ağaç geçerli kalsın). */
export function tidy(l: Ladder): void {
  const ser = (s: Series): void => {
    for (let i = 0; i < s.length; i++) {
      const b = s[i]!;
      if (b.t !== 'p') continue;
      b.branches.forEach(ser);
      b.branches = b.branches.filter((br) => br.length > 0);
      if (b.branches.length === 0) {
        s.splice(i, 1);
        i--;
      } else if (b.branches.length === 1) {
        s.splice(i, 1, ...b.branches[0]!);
        i--;
      }
    }
  };
  const outs = (list: OutBranch[]): void => {
    for (let i = 0; i < list.length; i++) {
      const o = list[i]!;
      ser(o.pre);
      if (o.children) {
        outs(o.children);
        if (o.children.length === 0) {
          list.splice(i, 1);
          i--;
        } else if (o.children.length === 1) {
          const c = o.children[0]!;
          const merged: OutBranch = { id: o.id, pre: [...o.pre, ...c.pre] };
          if (c.coil) merged.coil = c.coil;
          if (c.children) merged.children = c.children;
          list[i] = merged;
          i--;
        } else if (o.pre.length === 0) {
          list.splice(i, 1, ...o.children);
          i--;
        }
      }
    }
  };
  for (const r of l.rungs) {
    ser(r.input);
    outs(r.outputs);
  }
}

// ------------------------------------------------------------------ yeni parçalar
/** Programda bobin olarak kullanılmayan ilk adres (Y0 doluysa Y1…) */
export function nextFree(l: Ladder, d: 'Y' | 'M' | 'T' | 'C'): string {
  const used = new Set<string>();
  const walk = (list: OutBranch[]) => list.forEach((o) => (o.coil && used.add(o.coil.op.toUpperCase()), o.children && walk(o.children)));
  l.rungs.forEach((r) => walk(r.outputs));
  for (let i = 0; i < 256; i++) {
    const op = d + (isOctalType(d) ? i.toString(8) : String(i));
    if (!used.has(op)) return op;
  }
  return d + '0';
}

export function makeCoil(l: Ladder, type: CoilType): Coil {
  switch (type) {
    case 'TMR': return { type, op: nextFree(l, 'T'), k: '50' };
    case 'CNT': return { type, op: nextFree(l, 'C'), k: '5' };
    case 'OUT': return { type, op: nextFree(l, 'Y'), k: '' };
    case 'RST': return { type, op: 'M0', k: '' };
    default: return { type, op: 'M0', k: '' };
  }
}

export const newRung = (l: Ladder): Rung => {
  const r = mkRung([newContact('NO', 'X0')], [newCoilBranch(makeCoil(l, 'OUT'))]);
  return { ...r, id: nid() };
};

// ------------------------------------------------------------------ işlemler
export type Action =
  | 'addLeft' | 'addRight' | 'parContact' | 'parSeries' | 'delete' | 'duplicate'
  | 'addOutput' | 'addBranchContact' | 'rungAbove' | 'rungBelow' | 'rungUp' | 'rungDown';

export interface EditResult {
  /** İşlemden sonra seçilecek öğe */
  sel: string | null;
  /** Kullanıcıya gösterilecek ret nedeni (işlem yapılmadı) */
  refuse?: string;
}

function removeContact(loc: ContactLoc): void {
  loc.series.splice(loc.index, 1);
}

export function apply(l: Ladder, id: string | null, act: Action): EditResult {
  const loc = locate(l, id);
  if (!loc) return { sel: id, refuse: 'Önce ladder\'da bir öğe seç' };
  let sel: string | null = id;
  switch (act) {
    case 'addLeft':
    case 'addRight': {
      const n = newContact('NO', 'X0');
      if (loc.kind === 'contact') loc.series.splice(loc.index + (act === 'addRight' ? 1 : 0), 0, n);
      else if (loc.kind === 'output') act === 'addLeft' ? loc.o.pre.unshift(n) : loc.o.pre.push(n);
      else loc.r.input.push(n);
      sel = n.id;
      break;
    }
    case 'parContact': {
      if (loc.kind !== 'contact') return { sel, refuse: 'Paralel ekleme kontaklar içindir' };
      const n = newContact('NO', 'X0');
      if (loc.parent && loc.series.length === 1) loc.parent.par.branches.push([n]);
      else loc.series[loc.index] = { ...parallel([[loc.node], [n]]), id: nid() };
      sel = n.id;
      break;
    }
    case 'parSeries': {
      if (loc.kind !== 'contact') return { sel, refuse: 'Paralel ekleme kontaklar içindir' };
      const n = newContact('NO', 'X0');
      const old = loc.series.splice(0, loc.series.length);
      loc.series.push({ ...parallel([old, [n]]), id: nid() });
      sel = n.id;
      break;
    }
    case 'addBranchContact': {
      if (loc.kind !== 'output') return { sel, refuse: 'Bu işlem çıkışlar içindir' };
      const n = newContact('NO', 'X0');
      loc.o.pre.push(n);
      sel = n.id;
      break;
    }
    case 'addOutput': {
      const o = newCoilBranch(makeCoil(l, 'OUT'));
      if (loc.kind === 'output') loc.list.splice(loc.oi + 1, 0, o);
      else if (loc.kind === 'contact' && loc.branch) {
        const list = locate(l, loc.branch.id) as OutputLoc;
        list.list.splice(list.oi + 1, 0, o);
      } else loc.r.outputs.push(o);
      sel = o.id;
      break;
    }
    case 'delete': {
      if (loc.kind === 'contact') {
        removeContact(loc);
        const b = loc.series[Math.min(loc.index, loc.series.length - 1)];
        sel = b && b.t === 'c' ? b.id : loc.r.id;
      } else if (loc.kind === 'output') {
        const top = loc.up === null;
        if (top && loc.r.outputs.length <= 1) return { sel, refuse: 'Satırın en az bir çıkışı olmalı; satırı silmek için satır numarasını seç' };
        loc.list.splice(loc.oi, 1);
        sel = loc.r.id;
      } else {
        l.rungs.splice(loc.ri, 1);
        const nr = l.rungs[Math.min(loc.ri, l.rungs.length - 1)];
        sel = nr ? nr.id : null;
      }
      break;
    }
    case 'duplicate': {
      if (loc.kind === 'contact') {
        const n = newContact(loc.node.kind, loc.node.op);
        loc.series.splice(loc.index + 1, 0, n);
        sel = n.id;
      } else if (loc.kind === 'output') {
        const c = copyBranch(loc.o);
        loc.list.splice(loc.oi + 1, 0, c);
        sel = c.id;
      } else {
        const r: Rung = { id: nid(), comment: loc.r.comment, input: copySeries(loc.r.input), outputs: loc.r.outputs.map(copyBranch) };
        l.rungs.splice(loc.ri + 1, 0, r);
        sel = r.id;
      }
      break;
    }
    case 'rungAbove':
    case 'rungBelow': {
      const r = newRung(l);
      l.rungs.splice(loc.ri + (act === 'rungBelow' ? 1 : 0), 0, r);
      sel = r.id;
      break;
    }
    case 'rungUp':
    case 'rungDown': {
      const j = loc.ri + (act === 'rungUp' ? -1 : 1);
      if (j < 0 || j >= l.rungs.length) return { sel, refuse: act === 'rungUp' ? 'Zaten en üstte' : 'Zaten en altta' };
      const a = l.rungs[loc.ri]!;
      l.rungs[loc.ri] = l.rungs[j]!;
      l.rungs[j] = a;
      break;
    }
  }
  tidy(l);
  if (sel && !locate(l, sel)) sel = loc.r && l.rungs.includes(loc.r) ? loc.r.id : null;
  return { sel };
}

export function copySeries(s: Series): Series {
  return s.map((b): Block => (b.t === 'c' ? newContact(b.kind, b.op) : { t: 'p', id: nid(), branches: b.branches.map(copySeries) }));
}
export function copyBranch(o: OutBranch): OutBranch {
  const n: OutBranch = { id: nid(), pre: copySeries(o.pre) };
  if (o.coil) n.coil = { ...o.coil };
  if (o.children) n.children = o.children.map(copyBranch);
  return n;
}

// ------------------------------------------------------------------ özellik değişiklikleri
export function setContact(l: Ladder, id: string, patch: Partial<Pick<Contact, 'kind' | 'op'>>): void {
  const loc = locate(l, id);
  if (loc?.kind === 'contact') Object.assign(loc.node, patch);
}

export function setCoil(l: Ladder, id: string, patch: Partial<Coil>): void {
  const loc = locate(l, id);
  if (loc?.kind !== 'output' || !loc.o.coil) return;
  const c = loc.o.coil;
  const typeChanged = patch.type && patch.type !== c.type;
  Object.assign(c, patch);
  if (typeChanged) {
    // Tür değişince işleneni uyumlu hâle getir (TMR→T, CNT→C, OUT/SET… T/C kullanamaz)
    const a = parseAddress(c.op).addr;
    if (c.type === 'TMR') {
      if (a?.type !== 'T') c.op = nextFree(l, 'T');
      if (!c.k) c.k = '50';
    } else if (c.type === 'CNT') {
      if (a?.type !== 'C') c.op = nextFree(l, 'C');
      if (!c.k) c.k = '5';
    } else if (c.type !== 'RST' && (a?.type === 'T' || a?.type === 'C' || a?.type === 'X' || a?.type === 'D')) c.op = nextFree(l, 'Y');
  }
}

export function setComment(l: Ladder, rungId: string, text: string): void {
  const r = l.rungs.find((x) => x.id === rungId);
  if (r) r.comment = text;
}

export function setLabel(l: Ladder, op: string, text: string): void {
  const key = parseAddress(op).addr ? op.toUpperCase() : op;
  if (text) l.labels[key] = text;
  else delete l.labels[key];
}

// ------------------------------------------------------------------ sürükle-bırak
export type Slot =
  | { t: 'c'; ser: SeriesRef; index: number; ctx: 'input' | 'branch' | 'pre'; x: number; y: number }
  | { t: 'p'; id: string; x: number; y: number }
  | { t: 'o'; list: ListRef; index: number; rungId: string; x: number; y: number }
  | { t: 'r'; index: number; x: number; y: number; x0: number; x1: number };

export type DragPayload =
  | { src: 'palette'; g: 'c'; k: ContactKind }
  | { src: 'palette'; g: 'o'; k: CoilType }
  | { src: 'ladder'; id: string; g: 'c' | 'o' };

/** Bu nokta bu parçayı kabul eder mi? */
export function slotAccepts(l: Ladder, s: Slot, p: DragPayload): boolean {
  if (p.g === 'c') {
    if (s.t === 'o') return false;
    if (p.src === 'ladder' && s.t === 'p' && s.id === p.id) return false;
    return true;
  }
  if (s.t === 'c' || s.t === 'p') return false;
  if (p.src === 'ladder' && s.t === 'o') {
    const loc = locate(l, p.id);
    if (loc?.kind === 'output') {
      const list = resolveList(l, s.list);
      if (list === loc.list && (s.index === loc.oi || s.index === loc.oi + 1)) return false;
    }
  }
  return true;
}

export function slotLabel(s: Slot, p: DragPayload, copy: boolean, rungCount: number): string {
  const verb = p.src === 'palette' ? '' : copy ? 'kopyala: ' : 'taşı: ';
  switch (s.t) {
    case 'c':
      if (s.ctx === 'pre') return verb + 'bu çıkışın dalına';
      if (s.ctx === 'branch') return verb + 'paralel dalın içine seri';
      return verb + (s.index === 0 ? 'satır başına seri' : 'seri bağla');
    case 'p':
      return verb + 'altına paralel (OR)';
    case 'o':
      return verb + 'alta çıkış ekle';
    case 'r':
      return verb + (s.index >= rungCount ? 'yeni satır (en alta)' : 'buraya yeni satır');
  }
}

/** Bırakmayı uygula: önce yeni düğüm yerine konur, sonra (taşımada) eskisi silinir. */
export function drop(l: Ladder, p: DragPayload, s: Slot, copy: boolean): EditResult {
  const moving = p.src === 'ladder' && !copy;
  let node: Contact | OutBranch;
  let g: 'c' | 'o';
  if (p.src === 'palette') {
    g = p.g;
    node = p.g === 'c' ? newContact(p.k, 'X0') : newCoilBranch(makeCoil(l, p.k));
  } else {
    const loc = locate(l, p.id);
    if (!loc || loc.kind === 'rung') return { sel: null };
    g = loc.kind === 'contact' ? 'c' : 'o';
    if (loc.kind === 'contact') node = newContact(loc.node.kind, loc.node.op);
    else {
      if (moving && loc.up === null && loc.r.outputs.length === 1) return { sel: p.id, refuse: 'Satırın tek çıkışı taşınamaz; Ctrl basılı bırakıp kopyala ya da önce başka çıkış ekle' };
      node = copyBranch(loc.o);
    }
  }
  switch (s.t) {
    case 'c': {
      const ser = resolveSeries(l, s.ser);
      if (!ser || g !== 'c') return { sel: null };
      ser.splice(s.index, 0, node as Contact);
      break;
    }
    case 'p': {
      const loc = locate(l, s.id);
      if (loc?.kind !== 'contact' || g !== 'c') return { sel: null };
      if (loc.parent && loc.series.length === 1) loc.parent.par.branches.push([node as Contact]);
      else loc.series[loc.index] = { ...parallel([[loc.node], [node as Contact]]), id: nid() };
      break;
    }
    case 'o': {
      const list = resolveList(l, s.list);
      if (!list || g !== 'o') return { sel: null };
      list.splice(s.index, 0, node as OutBranch);
      break;
    }
    case 'r': {
      const r: Rung =
        g === 'c'
          ? { id: nid(), comment: '', input: [node as Contact], outputs: [newCoilBranch(makeCoil(l, 'OUT'))] }
          : { id: nid(), comment: '', input: [newContact('NO', 'X0')], outputs: [node as OutBranch] };
      l.rungs.splice(s.index, 0, r);
      break;
    }
  }
  if (moving && p.src === 'ladder') {
    const old = locate(l, p.id);
    if (old?.kind === 'contact') removeContact(old);
    else if (old?.kind === 'output') old.list.splice(old.oi, 1);
  }
  tidy(l);
  return { sel: node.id };
}

/** Panodaki parçaya tıklama: seçili öğenin yanına ekle */
export function insertPart(l: Ladder, selId: string | null, p: Extract<DragPayload, { src: 'palette' }>): EditResult {
  const loc = locate(l, selId);
  if (p.g === 'c') {
    const c = newContact(p.k, 'X0');
    if (!loc) l.rungs.push({ id: nid(), comment: '', input: [c], outputs: [newCoilBranch(makeCoil(l, 'OUT'))] });
    else if (loc.kind === 'contact') loc.series.splice(loc.index + 1, 0, c);
    else if (loc.kind === 'output') loc.o.pre.push(c);
    else loc.r.input.push(c);
    tidy(l);
    return { sel: c.id };
  }
  const o = newCoilBranch(makeCoil(l, p.k));
  if (!loc) l.rungs.push({ id: nid(), comment: '', input: [newContact('NO', 'X0')], outputs: [o] });
  else if (loc.kind === 'output') loc.list.splice(loc.oi + 1, 0, o);
  else loc.r.outputs.push(o);
  tidy(l);
  return { sel: o.id };
}

/** Sil (silgi ya da çöpe sürükleme) */
export const remove = (l: Ladder, id: string): EditResult => apply(l, id, 'delete');

// ------------------------------------------------------------------ pano (kopyala / kes / yapıştır)
export type Clip = { k: 'rung'; r: Rung } | { k: 'contact'; c: Contact } | { k: 'output'; o: OutBranch };

/** Seçili öğenin kopyası (yapıştırırken yeniden kimliklenir) */
export function takeClip(l: Ladder, id: string | null): Clip | null {
  const loc = locate(l, id);
  if (!loc) return null;
  if (loc.kind === 'contact') return { k: 'contact', c: { ...loc.node } };
  if (loc.kind === 'output') return { k: 'output', o: copyBranch(loc.o) };
  return { k: 'rung', r: { id: loc.r.id, comment: loc.r.comment, input: copySeries(loc.r.input), outputs: loc.r.outputs.map(copyBranch) } };
}

export function pasteClip(l: Ladder, sel: string | null, clip: Clip): EditResult {
  const loc = locate(l, sel);
  if (clip.k === 'rung') {
    const r: Rung = { id: nid(), comment: clip.r.comment, input: copySeries(clip.r.input), outputs: clip.r.outputs.map(copyBranch) };
    l.rungs.splice(loc ? loc.ri + 1 : l.rungs.length, 0, r);
    return { sel: r.id };
  }
  if (clip.k === 'contact') {
    const c = newContact(clip.c.kind, clip.c.op);
    if (!loc) return { sel, refuse: 'Kontağı yapıştırmak için bir satır ya da kontak seç' };
    if (loc.kind === 'contact') loc.series.splice(loc.index + 1, 0, c);
    else if (loc.kind === 'output') loc.o.pre.push(c);
    else loc.r.input.push(c);
    tidy(l);
    return { sel: c.id };
  }
  if (!loc) return { sel, refuse: 'Çıkışı yapıştırmak için bir satır ya da çıkış seç' };
  const o = copyBranch(clip.o);
  if (loc.kind === 'output') loc.list.splice(loc.oi + 1, 0, o);
  else loc.r.outputs.push(o);
  tidy(l);
  return { sel: o.id };
}
