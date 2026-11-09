// Ladder ağacı modeli ve IL ↔ ağaç dönüşümü (düzenleyici için).
// Ağaç her zaman geçerli bir devre üretir; IL'ye kayıpsız çevrilir. Bazı IL kalıpları (ör. çıkıştan
// sonra OR) ağaçla gösterilemez: o durumda program çalışır ama ladder'a çevrilemediği bildirilir.

import { diag, type Diagnostic } from './diagnostics';
import { CONTACT_MNEMONICS, isCoilType, type CoilType, type ContactKind } from './instructions';
import { analyze, parseIl, type IlProgram } from './il';
import { getProfile, type Profile } from './profiles';

export interface Contact {
  t: 'c';
  id: string;
  kind: ContactKind;
  op: string;
}
export interface Parallel {
  t: 'p';
  id: string;
  branches: Series[];
}
export type Block = Contact | Parallel;
export type Series = Block[];

export interface Coil {
  type: CoilType;
  op: string;
  /** TMR/CNT ayar değeri (sayı metni, ör. "50") */
  k: string;
}

/** Çıkış dalı: ya bir bobinle biter ya da alt dallara ayrılır (iç içe MPS) */
export interface OutBranch {
  id: string;
  pre: Series;
  coil?: Coil;
  children?: OutBranch[];
}

export interface Rung {
  id: string;
  comment: string;
  input: Series;
  outputs: OutBranch[];
}

export interface Ladder {
  rungs: Rung[];
  labels: Record<string, string>;
}

let uid = 1;
const nid = (): string => 'n' + uid++;
export const contact = (kind: ContactKind, op: string): Contact => ({ t: 'c', id: nid(), kind, op });
export const parallel = (branches: Series[]): Parallel => ({ t: 'p', id: nid(), branches });
export const coilBranch = (pre: Series, c: Coil): OutBranch => ({ id: nid(), pre, coil: c });
export const rung = (input: Series, outputs: OutBranch[], comment = ''): Rung => ({ id: nid(), input, outputs, comment });

export function cloneSeries(s: Series): Series {
  return s.map((b) => (b.t === 'c' ? contact(b.kind, b.op) : parallel(b.branches.map(cloneSeries))));
}

// ------------------------------------------------------------------ ağaç → IL
function contactLine(c: Contact, pos: 0 | 1 | 2): string {
  return CONTACT_MNEMONICS[c.kind][pos] + ' ' + c.op;
}

function genSeries(series: Series, out: string[], mode: 'load' | 'and'): void {
  series.forEach((b, j) => {
    const first = j === 0 && mode === 'load';
    if (b.t === 'c') out.push(contactLine(b, first ? 0 : 1));
    else {
      genPar(b, out);
      if (!first) out.push('ANB');
    }
  });
}

function genPar(p: Parallel, out: string[]): void {
  p.branches.forEach((br, k) => {
    const only = br[0];
    if (k > 0 && br.length === 1 && only && only.t === 'c') out.push(contactLine(only, 2));
    else {
      genSeries(br, out, 'load');
      if (k > 0) out.push('ORB');
    }
  });
}

function coilLine(c: Coil): string {
  if (c.type === 'TMR' || c.type === 'CNT') {
    const k = parseInt(c.k, 10);
    return `${c.type} ${c.op} K${Number.isNaN(k) ? '?' : k}`;
  }
  return `${c.type} ${c.op}`;
}

function genBranchBody(b: OutBranch, out: string[]): void {
  genSeries(b.pre, out, 'and');
  if (b.children && b.children.length) genOutputs(b.children, out);
  else if (b.coil) out.push(coilLine(b.coil));
}

function genOutputs(list: OutBranch[], out: string[]): void {
  // Dallarda ek kontak ya da alt dal yoksa bobinler art arda yazılır; varsa MPS/MRD/MPP gerekir
  const needStack = list.length > 1 && list.some((b) => b.pre.length || (b.children && b.children.length));
  if (!needStack) {
    list.forEach((b) => genBranchBody(b, out));
    return;
  }
  const last = list.length - 1;
  list.forEach((b, i) => {
    out.push(i === 0 ? 'MPS' : i === last ? 'MPP' : 'MRD');
    genBranchBody(b, out);
  });
}

/** Ladder → IL metni (v1'in toIL çıktısıyla birebir aynı biçim) */
export function ladderToIl(l: Ladder): string {
  const lines: string[] = [];
  for (const k of Object.keys(l.labels)) if (l.labels[k]) lines.push(`#${k} ${l.labels[k]}`);
  if (lines.length) lines.push('');
  l.rungs.forEach((r, i) => {
    if (r.comment) r.comment.split('\n').forEach((c) => lines.push('; ' + c));
    else lines.push(`; --- satır ${i + 1}`);
    if (r.input.length === 0) lines.push('LD M1000');
    else genSeries(r.input, lines, 'load');
    genOutputs(r.outputs, lines);
  });
  lines.push('END');
  return lines.join('\n');
}

// ------------------------------------------------------------------ IL → ağaç
function orCombine(a: Series, b: Series): Series {
  const b0 = b[0];
  const bBranches = b.length === 1 && b0 && b0.t === 'p' ? b0.branches : [b];
  const a0 = a[0];
  if (a.length === 1 && a0 && a0.t === 'p') {
    a0.branches.push(...bBranches);
    return a;
  }
  return [parallel([a, ...bBranches])];
}

/** Boş ön kontaklı ara düğümleri üst listeye aç; tek çocuklu düğümleri birleştir */
function normalize(list: OutBranch[]): OutBranch[] {
  const out: OutBranch[] = [];
  for (const b of list) {
    if (b.children) {
      b.children = normalize(b.children);
      if (b.pre.length === 0) {
        out.push(...b.children);
        continue;
      }
      if (b.children.length === 1) {
        const c = b.children[0]!;
        const merged: OutBranch = { id: b.id, pre: [...b.pre, ...c.pre] };
        if (c.coil) merged.coil = c.coil;
        if (c.children) merged.children = c.children;
        out.push(merged);
        continue;
      }
    }
    out.push(b);
  }
  return out;
}

/** IL komutlarını ladder ağacına çevirir. Gösterilemeyen kalıplarda null + tanılama döner. */
export function ilToLadder(program: IlProgram): { ladder: Ladder | null; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const { rungs: spans } = analyze(program);
  const rungs: Rung[] = [];

  for (const [ri, span] of spans.entries()) {
    let stack: Series[] = [];
    let phaseB = false;
    let input: Series = [];
    const outputs: OutBranch[] = [];
    // MPS çerçeveleri: her biri bir düğümün alt dal listesi
    const frames: OutBranch[][] = [];
    let active: OutBranch[] = outputs;
    let failed = false;
    const fail = (line: number, msg: string, code: 'L_OR_AFTER_OUTPUT' | 'L_UNSUPPORTED' = 'L_UNSUPPORTED') => {
      if (!failed) diagnostics.push(diag(code, msg, { line, rung: ri }));
      failed = true;
    };
    const toPhaseB = (line: number): boolean => {
      if (phaseB) return true;
      if (stack.length !== 1) {
        fail(line, 'Açık blok kaldı: ANB/ORB eksik');
        return false;
      }
      input = stack[0]!;
      stack = [[]];
      phaseB = true;
      return true;
    };

    for (let i = span.start; i < span.end && !failed; i++) {
      const it = program.instrs[i]!;
      const op = it.ops[0];
      switch (it.def.cls) {
        case 'load':
          stack.push([contact(it.def.contact!, op?.raw ?? '?')]);
          break;
        case 'and': {
          const top = stack[stack.length - 1];
          if (!top) fail(it.line, `${it.mn}: önce LD gerekir`);
          else top.push(contact(it.def.contact!, op?.raw ?? '?'));
          break;
        }
        case 'or': {
          if (phaseB && stack.length === 1) {
            fail(it.line, `${it.mn}: çıkıştan sonra OR ladder'da gösterilemez (program çalışır; ladder için paralel kısmı LD…ORB bloğu yap)`, 'L_OR_AFTER_OUTPUT');
            break;
          }
          const top = stack[stack.length - 1];
          if (!top) fail(it.line, `${it.mn}: önce LD gerekir`);
          else stack[stack.length - 1] = orCombine(top, [contact(it.def.contact!, op?.raw ?? '?')]);
          break;
        }
        case 'block': {
          if (stack.length < 2) {
            fail(it.line, `${it.mn}: birleştirilecek iki blok yok`);
            break;
          }
          const b = stack.pop()!;
          const a = stack.pop()!;
          if (it.mn === 'ANB') stack.push(a.concat(b));
          else if (phaseB && stack.length === 0) fail(it.line, 'ORB: çıkış dalında ana bloğa OR ladder\'da gösterilemez', 'L_OR_AFTER_OUTPUT');
          else stack.push(a.length === 0 ? b : orCombine(a, b));
          break;
        }
        case 'stack': {
          if (!toPhaseB(it.line)) break;
          if (stack.length !== 1) {
            fail(it.line, `${it.mn} öncesi açık blok var`);
            break;
          }
          if (it.mn === 'MPS') {
            const node: OutBranch = { id: nid(), pre: stack[0]!, children: [] };
            active.push(node);
            frames.push(node.children!);
            active = node.children!;
          } else {
            const frame = it.mn === 'MRD' ? frames[frames.length - 1] : frames.pop();
            if (!frame) {
              fail(it.line, `${it.mn}: önce MPS gerekir`);
              break;
            }
            active = frame;
          }
          stack = [[]];
          break;
        }
        case 'output': {
          if (!toPhaseB(it.line)) break;
          if (stack.length !== 1) {
            fail(it.line, `${it.mn} öncesi açık blok var`);
            break;
          }
          if (!isCoilType(it.mn)) break;
          const k = it.ops[1];
          active.push(coilBranch(cloneSeries(stack[0]!), { type: it.mn, op: op?.raw ?? '?', k: k && k.k !== undefined ? String(k.k) : '' }));
          break;
        }
        default:
          break;
      }
    }
    if (failed) continue;
    if (!phaseB) continue; // çıkışsız satır (analiz zaten bildirdi)
    const first = program.instrs[span.start];
    rungs.push(rung(input, normalize(outputs), first?.comment ?? ''));
  }

  const failedAny = diagnostics.some((d) => d.code.startsWith('L_'));
  return { ladder: failedAny ? null : { rungs, labels: { ...program.labels } }, diagnostics };
}

/** IL metni → ladder (ayrıştırma + dönüşüm) */
export function parseLadder(text: string, profile: Profile = getProfile()): { ladder: Ladder | null; diagnostics: Diagnostic[] } {
  const parsed = parseIl(text, profile);
  const conv = ilToLadder(parsed.program);
  return { ladder: conv.ladder, diagnostics: [...parsed.diagnostics, ...conv.diagnostics] };
}
