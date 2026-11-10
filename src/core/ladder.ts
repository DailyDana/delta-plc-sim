// Ladder ağacı modeli ve IL ↔ ağaç dönüşümü (düzenleyici için).
// Ağaç her zaman geçerli bir devre üretir; IL'ye kayıpsız çevrilir. Bazı IL kalıpları (ör. çıkıştan
// sonra OR) ağaçla gösterilemez: o durumda program çalışır ama ladder'a çevrilemediği bildirilir.

import { diag, type Diagnostic } from './diagnostics';
import { CONTACT_MNEMONICS, cmpMnemonic, isCoilType, type CmpOp, type ContactKind } from './instructions';
import { analyze, parseIl, type IlProgram } from './il';
import { getProfile, type Profile } from './profiles';

export interface Contact {
  t: 'c';
  id: string;
  kind: ContactKind;
  /** Cihaz (CMP'de ilk işlenen S1; INV'de boş) */
  op: string;
  /** Karşılaştırma kontağı: işleç, ikinci işlenen, 32 bit */
  cmp?: CmpOp;
  op2?: string;
  d32?: boolean;
}
export interface Parallel {
  t: 'p';
  id: string;
  branches: Series[];
}
export type Block = Contact | Parallel;
export type Series = Block[];

export interface Coil {
  /** OUT, SET, RST, TMR, CNT, PLS, PLF ya da uygulama komutu (MOV, ADDP, DMOV…) */
  type: string;
  /** İlk işlenen */
  op: string;
  /** TMR/CNT ayar değeri: sayı metni ("50") ya da kaydedici ("D0") */
  k: string;
  /** Uygulama komutunun ilk işlenenden sonraki işlenenleri */
  args?: string[];
}

/** Bobin yalnızca temel bobin mi (OUT/SET/…); değilse uygulama komutu kutusu */
export const isBasicCoil = (c: Coil): boolean => isCoilType(c.type);

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
export const contact = (kind: ContactKind, op: string, extra: Partial<Pick<Contact, 'cmp' | 'op2' | 'd32'>> = {}): Contact => ({ t: 'c', id: nid(), kind, op, ...extra });
export const parallel = (branches: Series[]): Parallel => ({ t: 'p', id: nid(), branches });
export const coilBranch = (pre: Series, c: Coil): OutBranch => ({ id: nid(), pre, coil: c });
export const rung = (input: Series, outputs: OutBranch[], comment = ''): Rung => ({ id: nid(), input, outputs, comment });

export function cloneSeries(s: Series): Series {
  return s.map((b) => (b.t === 'c' ? { ...b, id: nid() } : parallel(b.branches.map(cloneSeries))));
}

/** Kimlikleri koruyarak derin kopya (düzenleyici değişmez durum için kullanır) */
export function cloneLadder(l: Ladder): Ladder {
  const s = (x: Series): Series => x.map((b) => (b.t === 'c' ? { ...b } : { t: 'p', id: b.id, branches: b.branches.map(s) }));
  const o = (b: OutBranch): OutBranch => {
    const n: OutBranch = { id: b.id, pre: s(b.pre) };
    if (b.coil) n.coil = { ...b.coil, ...(b.coil.args ? { args: [...b.coil.args] } : {}) };
    if (b.children) n.children = b.children.map(o);
    return n;
  };
  return { labels: { ...l.labels }, rungs: l.rungs.map((r) => ({ id: r.id, comment: r.comment, input: s(r.input), outputs: r.outputs.map(o) })) };
}

/** Öğenin komut adı ve işlenenleri (anlık hata denetimi için: checkInstrOperands(mn, ops)) */
export function contactOperands(c: Contact): { mn: string; ops: string[] } {
  if (c.kind === 'CMP') return { mn: cmpMnemonic(c.cmp ?? '=', 0, !!c.d32), ops: [c.op, c.op2 ?? ''] };
  if (c.kind === 'INV') return { mn: 'INV', ops: [] };
  return { mn: CONTACT_MNEMONICS[c.kind][0], ops: [c.op] };
}
export function coilOperands(c: Coil): { mn: string; ops: string[] } {
  if (c.type === 'TMR' || c.type === 'CNT') return { mn: c.type, ops: [c.op, c.k] };
  return { mn: c.type, ops: [c.op, ...(c.args ?? [])] };
}

// ------------------------------------------------------------------ ağaç → IL
/** Satır yazıcı: her IL satırının hangi ladder öğesinden geldiği (kontak id'si ya da bobinli dal id'si) */
class Out {
  lines: string[] = [];
  refs: (string | undefined)[] = [];
  push(line: string, ref?: string): void {
    this.lines.push(line);
    this.refs.push(ref);
  }
}

function contactLine(c: Contact, pos: 0 | 1 | 2): string {
  if (c.kind === 'CMP') return `${cmpMnemonic(c.cmp ?? '=', pos, !!c.d32)} ${c.op} ${c.op2 ?? '?'}`;
  if (c.kind === 'INV') return 'INV';
  return CONTACT_MNEMONICS[c.kind][pos] + ' ' + c.op;
}

function genSeries(series: Series, out: Out, mode: 'load' | 'and'): void {
  series.forEach((b, j) => {
    const first = j === 0 && mode === 'load';
    if (b.t === 'c') {
      // INV bir sonuç ister: serinin başındaysa önce her zaman 1 olan M1000 yüklenir
      if (b.kind === 'INV' && first) out.push('LD M1000');
      out.push(contactLine(b, first && b.kind !== 'INV' ? 0 : 1), b.id);
    }
    else {
      genPar(b, out);
      if (!first) out.push('ANB');
    }
  });
}

function genPar(p: Parallel, out: Out): void {
  p.branches.forEach((br, k) => {
    const only = br[0];
    if (k > 0 && br.length === 1 && only && only.t === 'c' && only.kind !== 'INV') out.push(contactLine(only, 2), only.id);
    else {
      genSeries(br, out, 'load');
      if (k > 0) out.push('ORB');
    }
  });
}

function coilLine(c: Coil): string {
  if (c.type === 'TMR' || c.type === 'CNT') {
    if (/^D\d+$/i.test(c.k.trim())) return `${c.type} ${c.op} ${c.k.trim().toUpperCase()}`;
    const k = parseInt(c.k, 10);
    return `${c.type} ${c.op} K${Number.isNaN(k) ? '?' : k}`;
  }
  return [c.type, c.op, ...(c.args ?? [])].join(' ');
}

function genBranchBody(b: OutBranch, out: Out): void {
  genSeries(b.pre, out, 'and');
  if (b.children && b.children.length) genOutputs(b.children, out);
  else if (b.coil) out.push(coilLine(b.coil), b.id);
}

function genOutputs(list: OutBranch[], out: Out): void {
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
  return ladderToIlMapped(l).text;
}

/**
 * Ladder → IL + kaynak eşlemesi: refs[i] = IL'nin i. satırını (0'dan) üreten öğe.
 * Kontak satırları kontak id'sine, bobin satırları bobinin bulunduğu çıkış dalının id'sine bağlanır.
 */
export function ladderToIlMapped(l: Ladder): { text: string; refs: (string | undefined)[] } {
  const out = new Out();
  for (const k of Object.keys(l.labels)) if (l.labels[k]) out.push(`#${k} ${l.labels[k]}`);
  if (out.lines.length) out.push('');
  l.rungs.forEach((r, i) => {
    if (r.comment) r.comment.split('\n').forEach((c) => out.push('; ' + c));
    else out.push(`; --- satır ${i + 1}`);
    if (r.input.length === 0) out.push('LD M1000');
    else genSeries(r.input, out, 'load');
    genOutputs(r.outputs, out);
  });
  out.push('END');
  return { text: out.lines.join('\n'), refs: out.refs };
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

const track = <T extends { id: string }>(x: T, i: number): T => {
  srcOf?.set(x.id, i);
  return x;
};

/** IL komutundan kontak (karşılaştırma kontağı ve INV dahil) */
function contactOf(it: IlProgram['instrs'][number]): Contact {
  const kind = it.def.contact ?? 'NO';
  if (kind === 'CMP') return contact('CMP', it.ops[0]?.raw ?? '?', { cmp: it.def.cmp ?? '=', op2: it.ops[1]?.raw ?? '?', d32: !!it.def.d32 });
  if (kind === 'INV') return contact('INV', '');
  return contact(kind, it.ops[0]?.raw ?? '?');
}

/** IL çıkış komutundan bobin / fonksiyon kutusu */
function coilOf(it: IlProgram['instrs'][number]): Coil {
  const op = it.ops[0]?.raw ?? '?';
  if (isCoilType(it.mn)) {
    const k = it.ops[1];
    const kText = !k ? '' : k.addr ? k.addr.text : k.k !== undefined ? String(k.k) : k.raw;
    return { type: it.mn, op, k: kText };
  }
  return { type: it.mn, op, k: '', args: it.ops.slice(1).map((o) => o.raw || '?') };
}

/** Boş ön kontaklı ara düğümleri üst listeye aç; tek çocuklu düğümleri birleştir */
/** ilToLadder sırasında: ladder öğe id'si → onu üreten komutun sırası */
let srcOf: Map<string, number> | null = null;

/** Kopyalarken kaynak eşlemesini de taşı (çıkış dallarının ön serileri kopyalanır) */
function cloneTracked(s: Series): Series {
  return s.map((b) => {
    if (b.t === 'c') {
      const n = { ...b, id: nid() };
      const src = srcOf?.get(b.id);
      if (src !== undefined) srcOf!.set(n.id, src);
      return n;
    }
    return parallel(b.branches.map(cloneTracked));
  });
}

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
        const cs = srcOf?.get(c.id);
        if (cs !== undefined) srcOf!.set(b.id, cs); // birleşen dal, alttaki bobinin komutunu taşır
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
export function ilToLadder(program: IlProgram): { ladder: Ladder | null; diagnostics: Diagnostic[]; instrOf: Map<string, number> } {
  const diagnostics: Diagnostic[] = [];
  const map = new Map<string, number>();
  srcOf = map;
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
          stack.push([track(contactOf(it), i)]);
          break;
        case 'and': {
          const top = stack[stack.length - 1];
          if (!top) fail(it.line, `${it.mn}: önce LD gerekir`);
          else top.push(track(contactOf(it), i));
          break;
        }
        case 'or': {
          if (phaseB && stack.length === 1) {
            fail(it.line, `${it.mn}: çıkıştan sonra OR ladder'da gösterilemez (program çalışır; ladder için paralel kısmı LD…ORB bloğu yap)`, 'L_OR_AFTER_OUTPUT');
            break;
          }
          const top = stack[stack.length - 1];
          if (!top) fail(it.line, `${it.mn}: önce LD gerekir`);
          else stack[stack.length - 1] = orCombine(top, [track(contactOf(it), i)]);
          break;
        }
        case 'inv': {
          const top = stack[stack.length - 1];
          if (!top) fail(it.line, 'INV: önce LD gerekir');
          else top.push(track(contactOf(it), i));
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
          const br = coilBranch(cloneTracked(stack[0]!), coilOf(it));
          map.set(br.id, i);
          active.push(br);
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
  srcOf = null;
  return { ladder: failedAny ? null : { rungs, labels: { ...program.labels } }, diagnostics, instrOf: map };
}

/**
 * Programın her komutunu ladder öğesine bağlar (canlı akım gösterimi için).
 * Program, ladder'dan üretilecek IL ile komut komut aynıysa eşleme döner; değilse (kullanıcı IL'i
 * farklı ama eşdeğer yazmışsa) null döner ve arayüz cihaz durumlarından yaklaşık gösterime düşer.
 */
export function mapProgramToLadder(program: IlProgram, l: Ladder, profile: Profile = getProfile()): (string | undefined)[] | null {
  const gen = ladderToIlMapped(l);
  const g = parseIl(gen.text, profile).program.instrs;
  const u = program.instrs;
  if (g.length !== u.length) return null;
  const key = (it: IlProgram['instrs'][number]) =>
    it.mn + ' ' + it.ops.map((o) => (o.addr ? o.addr.type + o.addr.index : o.k !== undefined ? 'K' + o.k : o.raw.toUpperCase())).join(' ');
  const refs: (string | undefined)[] = [];
  for (let i = 0; i < u.length; i++) {
    if (key(u[i]!) !== key(g[i]!)) return null;
    refs.push(gen.refs[g[i]!.line - 1]);
  }
  return refs;
}

/** IL metni → ladder (ayrıştırma + dönüşüm) */
export function parseLadder(text: string, profile: Profile = getProfile()): { ladder: Ladder | null; diagnostics: Diagnostic[] } {
  const parsed = parseIl(text, profile);
  const conv = ilToLadder(parsed.program);
  return { ladder: conv.ladder, diagnostics: [...parsed.diagnostics, ...conv.diagnostics] };
}
