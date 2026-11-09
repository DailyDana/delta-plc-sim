// Klavyeyle hızlı ekleme: seçili öğenin yanına komut yazarak parça ekle.
//   X1, LD X1, AND X1      → sağa seri açık kontak       /X1, ANI X1 → kapalı
//   P X1, ANDP X1          → yükselen kenar               F X1        → düşen kenar
//   |X1, OR X1, ORI X1     → seçili kontağa paralel
//   OUT Y1, SET M0, TMR T0 K50, CNT C0 5, RST C0, PLS M1 → çıkış ekle

import { parseAddress } from '../../core/devices';
import { isCoilType, type CoilType, type ContactKind } from '../../core/instructions';
import type { Ladder } from '../../core';
import { locate, newCoilBranch, newContact, tidy, type EditResult } from '../state/edit';
import { parallel } from '../../core/ladder';

export type QuickCmd =
  | { t: 'contact'; kind: ContactKind; op: string; par: boolean }
  | { t: 'coil'; type: CoilType; op: string; k: string };

const CONTACT_MN: Record<string, [ContactKind, boolean]> = {
  LD: ['NO', false], AND: ['NO', false], LDI: ['NC', false], ANI: ['NC', false],
  LDP: ['P', false], ANDP: ['P', false], LDF: ['F', false], ANDF: ['F', false],
  OR: ['NO', true], ORI: ['NC', true], ORP: ['P', true], ORF: ['F', true],
};

/** Metni çöz; hata varsa açıklama döner */
export function parseQuick(text: string): QuickCmd | string {
  let s = text.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!s) return 'Bir komut ya da adres yaz (ör. X1, /X2, |X3, OUT Y1, TMR T0 K50)';
  let par = false;
  if (s.startsWith('|')) {
    par = true;
    s = s.slice(1).trim();
  }
  const parts = s.split(' ');
  const head = parts[0]!;
  if (isCoilType(head)) {
    const op = parts[1] ?? '';
    if (!parseAddress(op).addr) return `${head} için adres yaz (ör. ${head} ${head === 'TMR' ? 'T0 K50' : head === 'CNT' ? 'C0 K5' : 'Y1'})`;
    let k = '';
    if (head === 'TMR' || head === 'CNT') {
      const kr = (parts[2] ?? '').replace(/^K/, '');
      if (!/^\d+$/.test(kr)) return `${head} için ayar değeri yaz (ör. ${head} ${op} K50)`;
      k = String(parseInt(kr, 10));
    }
    return { t: 'coil', type: head, op, k };
  }
  const m = CONTACT_MN[head];
  if (m) {
    const op = parts[1] ?? '';
    if (!parseAddress(op).addr) return `${head} için adres yaz (ör. ${head} X1)`;
    return { t: 'contact', kind: m[0], op, par: par || m[1] };
  }
  let kind: ContactKind = 'NO';
  if (s.startsWith('/')) {
    kind = 'NC';
    s = s.slice(1).trim();
  } else if (/^[PF] /.test(s)) {
    kind = s[0] as ContactKind;
    s = s.slice(2).trim();
  }
  const a = parseAddress(s);
  if (!a.addr) return a.error === 'octal' ? `${s}: X/Y sekizliktir (X0–X7, X10–X17)` : `"${text.trim()}" anlaşılmadı`;
  return { t: 'contact', kind, op: a.addr.text, par };
}

/** Komutu seçili öğeye göre uygula */
export function applyQuick(l: Ladder, sel: string | null, q: QuickCmd): EditResult {
  const loc = locate(l, sel);
  if (q.t === 'contact') {
    const c = newContact(q.kind, q.op);
    if (!loc) l.rungs.push({ id: 'q' + c.id, comment: '', input: [c], outputs: [newCoilBranch({ type: 'OUT', op: 'Y0', k: '' })] });
    else if (q.par) {
      if (loc.kind !== 'contact') return { sel, refuse: 'Paralel için önce bir kontak seç' };
      if (loc.parent && loc.series.length === 1) loc.parent.par.branches.push([c]);
      else loc.series[loc.index] = { ...parallel([[loc.node], [c]]), id: 'q' + c.id };
    } else if (loc.kind === 'contact') loc.series.splice(loc.index + 1, 0, c);
    else if (loc.kind === 'output') loc.o.pre.push(c);
    else loc.r.input.push(c);
    tidy(l);
    return { sel: c.id };
  }
  const o = newCoilBranch({ type: q.type, op: q.op, k: q.k });
  if (!loc) l.rungs.push({ id: 'q' + o.id, comment: '', input: [newContact('NO', 'X0')], outputs: [o] });
  else if (loc.kind === 'output') loc.list.splice(loc.oi + 1, 0, o);
  else loc.r.outputs.push(o);
  tidy(l);
  return { sel: o.id };
}
