// IL (komut listesi) ayrıştırıcı, işlenen denetimi ve yapısal analiz.
// Sanal makine doğrudan bu komut dizisini çalıştırır; ladder ağacı yalnızca düzenleyici içindir.

import { parseAddress, parseConstant, type Address } from './devices';
import { diag, type Diagnostic } from './diagnostics';
import { INSTRUCTIONS, MAX_MPS_DEPTH, type InstrDef } from './instructions';
import { counterRange, getProfile, type Profile } from './profiles';

export interface Operand {
  raw: string;
  addr?: Address;
  k?: number;
  /** İşlenen geçersizse true: makine okurken 0, yazarken yok sayar */
  invalid?: boolean;
}

export interface Instr {
  mn: string;
  def: InstrDef;
  ops: Operand[];
  /** IL metnindeki satır (1'den başlar) */
  line: number;
  /** Bu komuttan hemen önceki açıklama satırları */
  comment?: string;
}

export interface IlProgram {
  instrs: Instr[];
  /** Cihaz etiketleri: { X0: 'start' } */
  labels: Record<string, string>;
}

export interface RungSpan {
  start: number;
  /** Hariç */
  end: number;
  comment?: string;
}

export interface ParseResult {
  program: IlProgram;
  diagnostics: Diagnostic[];
}

const OPERAND_HINT: Record<string, string> = {
  OUT: 'OUT yalnızca Y, M, S ile kullanılır (T için TMR, C için CNT)',
  SET: 'SET yalnızca Y, M, S ile kullanılır',
  PLS: 'PLS yalnızca Y, M ile kullanılır',
  PLF: 'PLF yalnızca Y, M ile kullanılır',
  RST: 'RST girişlere (X) yazamaz',
  TMR: 'TMR yalnızca T zamanlayıcı ile kullanılır (ör. TMR T0 K50)',
  CNT: 'CNT yalnızca C sayıcı ile kullanılır (ör. CNT C0 K5)',
};

/** IL metnini komutlara çevirir ve işlenenleri profile göre denetler. */
export function parseIl(text: string, profile: Profile = getProfile()): ParseResult {
  const instrs: Instr[] = [];
  const labels: Record<string, string> = {};
  const diagnostics: Diagnostic[] = [];
  let pending: string[] = [];

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    let raw = (lines[i] ?? '').trim();
    if (!raw) continue;
    if (raw[0] === '#') {
      const m = /^#\s*([XYMSTCD]\d+)\s*[=:]?\s*(.*)$/i.exec(raw);
      if (m && m[1] !== undefined) {
        const a = parseAddress(m[1]).addr;
        labels[a ? a.text : m[1].toUpperCase()] = (m[2] ?? '').trim();
      }
      continue;
    }
    if (raw[0] === ';' || raw.startsWith('//')) {
      const c = raw.replace(/^(;|\/\/)\s*/, '');
      if (!/^---/.test(c)) pending.push(c);
      continue;
    }
    raw = raw.replace(/(;|\/\/).*$/, '').trim();
    if (!raw) continue;
    const tok = raw.split(/[\s,]+/);
    const mn = (tok[0] ?? '').toUpperCase();
    if (mn === 'END') break;
    if (mn === 'NOP') continue;
    const def = INSTRUCTIONS[mn];
    if (!def) {
      diagnostics.push(diag('E_UNKNOWN_OP', `Bilinmeyen komut: ${tok[0]}`, { line }));
      continue;
    }
    const args = tok.slice(1).filter(Boolean);
    const at = { line, instr: instrs.length };
    if (args.length < def.operands.length) {
      diagnostics.push(diag('E_OPERAND_MISSING', `${mn}: ${def.operands.map((o) => o.name).join(', ')} eksik`, at));
    } else if (args.length > def.operands.length) {
      diagnostics.push(diag('E_OPERAND_EXTRA', `${mn}: fazla işlenen (${args.slice(def.operands.length).join(' ')})`, at));
    }
    const ops: Operand[] = def.operands.map((spec, j) => checkOperand(mn, spec.kinds, args[j] ?? '', profile, diagnostics, at));
    const instr: Instr = { mn, def, ops, line };
    if (pending.length) {
      instr.comment = pending.join('\n');
      pending = [];
    }
    instrs.push(instr);
  }
  return { program: { instrs, labels }, diagnostics };
}

function checkOperand(
  mn: string,
  kinds: readonly string[],
  raw: string,
  profile: Profile,
  out: Diagnostic[],
  at: { line: number; instr: number },
): Operand {
  const op: Operand = { raw: raw.toUpperCase() };
  const bad = (code: Parameters<typeof diag>[0], msg: string): Operand => {
    out.push(diag(code, msg, at));
    op.invalid = true;
    return op;
  };
  if (!raw) return bad('E_OPERAND_MISSING', `${mn}: işlenen eksik`);
  if (kinds.includes('K')) {
    const k = parseConstant(raw);
    if (k !== null) {
      op.k = k;
      if ((mn === 'TMR' || mn === 'CNT') && !(k >= profile.minK && k <= 32767)) return bad('E_CONST_RANGE', `${mn} için K değeri ${profile.minK}–32767 olmalı (${raw})`);
      return op;
    }
    if (/^\d+$/.test(raw)) {
      // v1 uyumu: "TMR T0 50" yazımı K50 sayılır
      op.k = parseInt(raw, 10);
      op.raw = 'K' + op.k;
      if (!(op.k >= profile.minK && op.k <= 32767)) return bad('E_CONST_RANGE', `${mn} için K değeri ${profile.minK}–32767 olmalı (${raw})`);
      return op;
    }
  }
  const { addr, error } = parseAddress(raw);
  if (!addr) {
    if (error === 'octal') return bad('E_ADDR_OCTAL', `${raw.toUpperCase()}: X/Y adresleri SEKİZLİK sayılır (X0–X7, X10–X17...). 8 ve 9 rakamı yoktur`);
    if (kinds.includes('K') && kinds.length === 1) return bad('E_CONST_RANGE', `${mn}: "${raw}" geçerli bir sabit değil (ör. K50)`);
    return bad('E_ADDR_FORMAT', `"${raw}" geçerli bir adres değil (X, Y, M, S, T, C, D + numara)`);
  }
  op.addr = addr;
  op.raw = addr.text;
  // Önce tür: adres düzeltilse bile geçmeyecek hata daha yararlı
  if (!kinds.includes(addr.type)) {
    if (addr.type === 'X' && mn !== 'TMR' && mn !== 'CNT') return bad('E_OPERAND_KIND', `${mn} ${addr.text}: X girişine yazılamaz (girişler dışarıdan gelir)`);
    const def0 = INSTRUCTIONS[mn];
    if (def0 && def0.contact) return bad('E_OPERAND_KIND', `${mn} ${addr.text}: kontak olarak X, Y, M, S, T, C kullanılır (${addr.type} kontak olamaz)`);
    return bad('E_OPERAND_KIND', `${mn} ${addr.text}: ${OPERAND_HINT[mn] ?? `${mn} bu cihaz türüyle kullanılmaz`}`);
  }
  const max = profile.max[addr.type];
  if (addr.index > max) {
    const lim = addr.type === 'X' || addr.type === 'Y' ? max.toString(8) : String(max);
    return bad('E_ADDR_RANGE', `${addr.text}: aralık dışı (${addr.type}0–${addr.type}${lim})`);
  }
  const def = INSTRUCTIONS[mn];
  if (def && def.cls === 'output' && profile.readOnly.includes(addr.text)) {
    return bad('E_SPECIAL_READONLY', `${addr.text} özel röledir, sadece okunur`);
  }
  if (mn === 'CNT' && counterRange(profile, addr.index)?.bits === 32) {
    return bad('E_OPERAND_KIND', `${addr.text}: 32 bit sayıcıdır (DCNT ile kullanılır); CNT için 16 bit sayıcı seç`);
  }
  return op;
}

/**
 * Yapısal analiz: komutları satırlara böler ve blok/MPS yığınlarını denetler.
 * Satır, bir çıkış komutundan sonra gelen ilk yükleme (LD…) komutuyla başlar (v1 ile aynı kural).
 */
export function analyze(program: IlProgram): { rungs: RungSpan[]; diagnostics: Diagnostic[] } {
  const rungs: RungSpan[] = [];
  const diagnostics: Diagnostic[] = [];
  const ins = program.instrs;
  let start = -1;
  let depth = 0;
  let mps = 0;
  let outputs = 0;
  let lastWasOutput = false;
  const coilRung = new Map<string, number>();

  const close = (end: number) => {
    if (start < 0) return;
    const ri = rungs.length;
    const first = ins[start];
    if (outputs === 0) diagnostics.push(diag('E_NO_OUTPUT', 'Satırda çıkış (bobin) yok', { line: first?.line ?? 0, instr: start, rung: ri }));
    if (mps > 0) diagnostics.push(diag('W_MPS_UNCLOSED', 'MPS açıldı ama MPP ile kapatılmadı', { line: ins[end - 1]?.line ?? 0, instr: end - 1, rung: ri }));
    const span: RungSpan = { start, end };
    if (first?.comment) span.comment = first.comment;
    rungs.push(span);
  };

  ins.forEach((it, i) => {
    const at = { line: it.line, instr: i, rung: rungs.length };
    switch (it.def.cls) {
      case 'load':
        if (start < 0 || lastWasOutput) {
          close(i);
          start = i;
          depth = 1;
          mps = 0;
          outputs = 0;
          at.rung = rungs.length;
        } else depth++;
        lastWasOutput = false;
        break;
      case 'and':
      case 'or':
        if (start < 0 || depth === 0) diagnostics.push(diag('E_NEED_LOAD', `${it.mn}: önce LD ile başlamalı`, at));
        lastWasOutput = false;
        break;
      case 'block':
        if (depth < 2) diagnostics.push(diag('E_BLOCK_UNDERFLOW', `${it.mn}: birleştirilecek iki blok yok (her blok LD ile başlar)`, at));
        else depth--;
        lastWasOutput = false;
        break;
      case 'stack':
        if (it.mn === 'MPS') {
          if (start < 0) diagnostics.push(diag('E_NEED_LOAD', 'MPS: önce LD ile başlamalı', at));
          else if (depth !== 1) diagnostics.push(diag('E_OPEN_BLOCK', 'MPS öncesi açık blok var (ANB/ORB eksik)', at));
          mps++;
          if (mps > MAX_MPS_DEPTH) diagnostics.push(diag('E_MPS_DEPTH', `MPS en fazla ${MAX_MPS_DEPTH} seviye iç içe olabilir`, at));
        } else if (mps === 0) {
          diagnostics.push(diag('E_MPS_UNDERFLOW', `${it.mn}: önce MPS gerekir`, at));
        } else if (it.mn === 'MPP') mps--;
        lastWasOutput = false;
        break;
      case 'output': {
        if (start < 0) diagnostics.push(diag('E_NEED_LOAD', `${it.mn}: önce LD ile başlamalı`, at));
        else if (depth !== 1) diagnostics.push(diag('E_OPEN_BLOCK', `${it.mn} öncesi açık blok var (ANB/ORB eksik)`, at));
        outputs++;
        lastWasOutput = true;
        const target = it.ops[0];
        if ((it.mn === 'OUT' || it.mn === 'TMR' || it.mn === 'CNT') && target?.addr) {
          const prev = coilRung.get(target.addr.text);
          if (prev !== undefined && prev !== rungs.length) {
            diagnostics.push(diag('W_DOUBLE_COIL', `${target.addr.text} birden çok satırda bobin olarak kullanılmış (çift bobin): son yazan satır kazanır`, at));
          } else coilRung.set(target.addr.text, rungs.length);
        }
        break;
      }
      default:
        break;
    }
  });
  close(ins.length);
  return { rungs, diagnostics };
}

/** Ayrıştır + analiz et: tüm tanılamalar satır sırasıyla */
export function checkIl(text: string, profile: Profile = getProfile()) {
  const parsed = parseIl(text, profile);
  const an = analyze(parsed.program);
  const diagnostics = [...parsed.diagnostics, ...an.diagnostics].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return { program: parsed.program, rungs: an.rungs, diagnostics };
}

/** Komut dizisini IL metnine yazar (etiketler + açıklamalar korunur). */
export function writeIl(program: IlProgram): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(program.labels)) if (v) out.push(`#${k} ${v}`);
  if (out.length) out.push('');
  for (const it of program.instrs) {
    if (it.comment) for (const c of it.comment.split('\n')) out.push('; ' + c);
    out.push([it.mn, ...it.ops.map((o) => o.raw)].join(' '));
  }
  out.push('END');
  return out.join('\n');
}
