// IL (komut listesi) ayrıştırıcı, işlenen denetimi ve yapısal analiz.
// Sanal makine doğrudan bu komut dizisini çalıştırır; ladder ağacı yalnızca düzenleyici içindir.

import { formatAddress, parseAddress, parseConstant, parseKn, type Address, type DevType, type WordRef } from './devices';
import { diag, type Diagnostic } from './diagnostics';
import { INSTRUCTIONS, MAX_MC_LEVEL, MAX_MPS_DEPTH, type InstrDef } from './instructions';
import { counterRange, getProfile, type Profile } from './profiles';

export interface Operand {
  raw: string;
  addr?: Address;
  k?: number;
  /** Kelime işlenen (uygulama komutları ve karşılaştırma kontakları) */
  word?: WordRef;
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
  let endSeen = false;

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
    if (mn === 'END') {
      // END programı bitirir: sonrasındaki komutlar hiç çalışmaz (ayrıştırılmaz); öğrenci bunu bilmeli
      endSeen = true;
      const after = commandLinesAfter(lines, i + 1);
      if (after.count) {
        diagnostics.push(diag('W_AFTER_END', `END'den sonraki ${after.count} komut çalışmaz (program END'de biter); bu komutları END'in önüne taşı`, { line: after.first }));
      }
      break;
    }
    if (mn === 'NOP') continue;
    const def = INSTRUCTIONS[mn];
    if (!def) {
      diagnostics.push(diag('E_UNKNOWN_OP', `Bilinmeyen komut: ${tok[0]}`, { line }));
      continue;
    }
    if (def.mc && profile.id === 'v1') {
      // v1 motoru ana kontrolü bilmez: komut düşürülür, program çalışmaz (aşağıdaki tanılama engelleyicidir)
      diagnostics.push(diag('E_UNSUPPORTED', `${mn}: v1 (sadeleştirilmiş) profilinde desteklenmiyor; MC/MCR için ES2, SS2 ya da EH3 modelini seç`, { line }));
      continue;
    }
    const args = tok.slice(1).filter(Boolean);
    const at = { line, instr: instrs.length };
    if (args.length < def.operands.length) {
      // Tek mesaj: hangi işlenenler eksik + doğru yazım örneği (eksik her işlenen için ayrıca hata basılmaz)
      const missing = def.operands.slice(args.length).map((o) => o.name);
      const names = missing.length > 1 ? missing.slice(0, -1).join(', ') + ' ve ' + missing[missing.length - 1] : missing[0];
      diagnostics.push(diag('E_OPERAND_MISSING', `${mn}: ${names} eksik. Örnek: ${exampleOf(def)}`, at));
    } else if (args.length > def.operands.length) {
      diagnostics.push(diag('E_OPERAND_EXTRA', `${mn}: fazla işlenen (${args.slice(def.operands.length).join(' ')}). Örnek: ${exampleOf(def)}`, at));
    }
    const ops: Operand[] = def.operands.map((spec, j) =>
      j < args.length ? checkOperand(mn, spec.kinds, args[j]!, profile, diagnostics, at, def) : { raw: '', invalid: true },
    );
    if (def.base === 'ZRST' && ops[0]?.addr && ops[1]?.addr && ops[0].addr.type !== ops[1].addr.type) {
      diagnostics.push(diag('E_OPERAND_KIND', `${mn}: D1 ve D2 aynı türde olmalı (${ops[0].addr.text}, ${ops[1].addr.text})`, at));
      ops[1].invalid = true;
    }
    const instr: Instr = { mn, def, ops, line };
    if (pending.length) {
      instr.comment = pending.join('\n');
      pending = [];
    }
    instrs.push(instr);
  }
  if (!endSeen && instrs.length) {
    diagnostics.push(diag('W_NO_END', 'Program END ile bitmeli: son komuttan sonra END yaz', { line: instrs[instrs.length - 1]!.line }));
  }
  return { program: { instrs, labels }, diagnostics };
}

/** END'den sonraki komut satırları (açıklama, etiket, boş satır, NOP ve tekrar END sayılmaz) */
function commandLinesAfter(lines: readonly string[], from: number): { count: number; first: number } {
  let count = 0;
  let first = 0;
  for (let j = from; j < lines.length; j++) {
    const r = (lines[j] ?? '').trim();
    if (!r || r[0] === '#' || r[0] === ';' || r.startsWith('//')) continue;
    const s = r.replace(/(;|\/\/).*$/, '').trim();
    if (!s) continue;
    const mn = (s.split(/[\s,]+/)[0] ?? '').toUpperCase();
    if (mn === 'END' || mn === 'NOP') continue;
    count++;
    if (!first) first = j + 1;
  }
  return { count, first };
}

/** Uygulama komutlarının örnek işlenenleri (eksik işlenen mesajı için) */
const API_EXAMPLE_OPS: Record<string, string> = {
  MOV: 'K10 D0',
  CMP: 'D0 K10 M0',
  ZCP: 'K10 K20 D0 M0',
  ADD: 'D0 K1 D2',
  SUB: 'D0 K1 D2',
  MUL: 'D0 K2 D10',
  DIV: 'D0 K2 D10',
  INC: 'D0',
  DEC: 'D0',
  WAND: 'D0 H00FF D2',
  WOR: 'D0 H00FF D2',
  WXOR: 'D0 H00FF D2',
  ZRST: 'M0 M10',
  ALT: 'Y0',
};

/** Komutun doğru yazımına bir örnek (ör. "TMR T0 K50 (T0 100 ms tabanlı: K50 = 5 s)") */
export function exampleOf(def: InstrDef): string {
  const mn = def.mn;
  if (def.base) return `${mn} ${API_EXAMPLE_OPS[def.base] ?? ''}`.trim();
  if (def.contact === 'CMP') return `${mn} D0 K10`;
  if (def.contact && def.operands.length) return `${mn} X0`;
  switch (mn) {
    case 'TMR': return 'TMR T0 K50 (T0 100 ms tabanlı: K50 = 5 s)';
    case 'CNT': return 'CNT C0 K5 (5 yükselen kenarda kontak kapanır)';
    case 'OUT':
    case 'SET':
    case 'RST':
      return `${mn} Y0`;
    case 'PLS':
    case 'PLF':
      return `${mn} M0`;
    case 'MC':
    case 'MCR':
      return `${mn} N0`;
    default:
      return mn;
  }
}

/** Bir cihaz adresi (tür + sıra) */
export interface DevRef {
  type: DevType;
  index: number;
}

/**
 * Komutun dokunduğu (okuduğu ya da yazdığı) bütün cihazlar. VM'nin usedDevices'ı, snapshot, simulate/CLI ve
 * G/Ç paneli bunu kullanır: KnY/KnM bit grupları, CMP/ZCP'nin D, D+1, D+2 bitleri, 32 bit çiftler (Dn+1, Tn+1, Cn+1),
 * MUL/DIV'in üst kelimesi/kalanı (D+1; 32 bitte D+1…D+3), ZRST aralığı, TMR/CNT ayarı D'den okunuyorsa o D.
 */
export function instrDevices(it: Instr, profile: Profile): DevRef[] {
  const out: DevRef[] = [];
  const add = (type: DevType, index: number): void => {
    if (index >= 0 && index <= profile.max[type]) out.push({ type, index });
  };
  const base = it.def.base;
  if (base === 'ZRST') {
    const a = it.ops[0];
    const b = it.ops[1];
    if (a?.addr && !a.invalid && b?.addr && !b.invalid && a.addr.type === b.addr.type) {
      const from = Math.min(a.addr.index, b.addr.index); // D1 > D2 ise yalnızca D2 (s.3-102)
      for (let k = from; k <= b.addr.index; k++) add(a.addr.type, k);
    } else for (const o of it.ops) if (o.addr && !o.invalid) add(o.addr.type, o.addr.index);
    return out;
  }
  it.ops.forEach((o, j) => {
    if (o.invalid) return;
    const w = o.word;
    if (w?.k === 'kn') {
      for (let b = 0; b < w.n * 4; b++) add(w.type, w.index + b);
      return;
    }
    if (w?.k === 'dev') {
      const isDst = !!it.def.operands[j]?.kinds.includes('WD');
      const n = wordDevices(profile, w.type, w.index, !!it.def.d32, isDst && (base === 'MUL' || base === 'DIV'));
      for (let k = 0; k < n; k++) add(w.type, w.index + k);
      return;
    }
    if (o.addr) add(o.addr.type, o.addr.index);
  });
  if (base === 'CMP' || base === 'ZCP') {
    const r = it.ops[it.ops.length - 1];
    if (r?.addr && !r.invalid) {
      add(r.addr.type, r.addr.index + 1);
      add(r.addr.type, r.addr.index + 2);
    }
  }
  return out;
}

/**
 * Kelime işleneninin kapladığı ardışık cihaz sayısı. 16 bit kelimeler (D, T, C0–C199): 32 bit komutta 2
 * (s.3-17: "D1 yüksek, D0 düşük kelime; bu kural T ve 16 bit C0–C199 için de geçerli"), MUL/DIV hedefinde ×2
 * (16 bitte D+1, 32 bitte D+1…D+3; s.3-77, 3-79). 32 bit sayıcı (C200+) tek başına 32 bittir: MUL/DIV hedefinde 2.
 */
export function wordDevices(profile: Profile, type: 'D' | 'T' | 'C', index: number, d32: boolean, mulDivDst: boolean): number {
  const c32 = type === 'C' && counterRange(profile, index)?.bits === 32;
  if (c32) return mulDivDst ? 2 : 1;
  return (d32 ? 2 : 1) * (mulDivDst ? 2 : 1);
}

/** Tek bir komutun işlenenlerini denetler (düzenleyicideki anlık hata gösterimi için) */
export function checkInstrOperands(mn: string, ops: readonly string[], profile: Profile = getProfile()): Diagnostic[] {
  const def = INSTRUCTIONS[mn];
  if (!def) return [diag('E_UNKNOWN_OP', `Bilinmeyen komut: ${mn}`)];
  const out: Diagnostic[] = [];
  def.operands.forEach((spec, i) => checkOperand(mn, spec.kinds, (ops[i] ?? '').trim(), profile, out, { line: 0, instr: 0 }, def));
  return out;
}

function checkOperand(
  mn: string,
  kinds: readonly string[],
  raw: string,
  profile: Profile,
  out: Diagnostic[],
  at: { line: number; instr: number },
  idef?: InstrDef,
): Operand {
  const op: Operand = { raw: raw.toUpperCase() };
  const bad = (code: Parameters<typeof diag>[0], msg: string): Operand => {
    out.push(diag(code, msg, at));
    op.invalid = true;
    return op;
  };
  if (!raw) return bad('E_OPERAND_MISSING', `${mn}: işlenen eksik`);
  if (kinds.includes('WS') || kinds.includes('WD')) {
    const mulDivDst = kinds.includes('WD') && (idef?.base === 'MUL' || idef?.base === 'DIV');
    return checkWord(mn, kinds.includes('WS'), raw, profile, op, bad, !!idef?.d32, mulDivDst);
  }
  if (kinds.includes('KD')) {
    // TMR/CNT ayar değeri: K0~K32767 ya da D0~D9999 (kılavuz s.3-281/282)
    const k = parseConstant(raw) ?? (/^\d+$/.test(raw) ? parseInt(raw, 10) : null);
    if (k !== null) {
      op.k = k;
      op.raw = 'K' + k;
      if (!(k >= profile.minK && k <= 32767)) return bad('E_CONST_RANGE', `${mn} için K değeri ${profile.minK}–32767 olmalı (${raw})`);
      return op;
    }
    const a = parseAddress(raw).addr;
    if (!a || a.type !== 'D') return bad('E_OPERAND_KIND', `${mn}: ayar değeri K sabiti ya da D kaydedicisi olmalı (ör. K50 ya da D0)`);
    if (a.index > Math.min(9999, profile.max.D)) return bad('E_ADDR_RANGE', `${a.text}: ayar değeri için D0–D9999 kullanılır`);
    op.addr = a;
    op.raw = a.text;
    op.word = { k: 'dev', type: 'D', index: a.index };
    return op;
  }
  if (kinds.includes('NL')) {
    // Ana kontrol seviyesi: N0–N7 (s.3-10). 'N' sayı sabiti türünden ayrı tutulur.
    const m = /^N(\d+)$/i.exec(raw);
    if (!m) return bad('E_OPERAND_KIND', `${mn} ${op.raw}: seviye N0–N7 yazılır (ör. ${mn} N0)`);
    const n = parseInt(m[1]!, 10);
    op.raw = 'N' + n;
    if (n > MAX_MC_LEVEL) return bad('E_MC_LEVEL', `${mn} N${n}: seviye N0–N7 olmalı (en çok 8 iç içe blok: dıştaki N0, içindeki N1, …)`);
    op.k = n;
    return op;
  }
  if (kinds.includes('N')) {
    const k = parseConstant(raw);
    if (k === null) return bad('E_CONST_RANGE', `${mn}: sayı sabiti olmalı (ör. K4)`);
    op.k = k;
    return op;
  }
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

/** Kelime işleneni denetle: sabit (yalnızca kaynakta), D, T/C değeri, KnX/KnY/KnM/KnS */
function checkWord(
  mn: string,
  isSource: boolean,
  raw: string,
  profile: Profile,
  op: Operand,
  bad: (code: Parameters<typeof diag>[0], msg: string) => Operand,
  d32: boolean,
  mulDivDst = false,
): Operand {
  const c = parseConstant(raw) ?? (/^-?\d+$/.test(raw) ? parseInt(raw, 10) : null);
  if (c !== null) {
    if (!isSource) return bad('E_OPERAND_KIND', `${mn}: sabit (${raw}) hedef olamaz; D, T, C ya da KnY/KnM/KnS yaz`);
    const isHex = /^H/i.test(raw);
    if (d32) {
      if (isHex ? c > 0xffffffff : c < -2147483648 || c > 2147483647) return bad('E_CONST_RANGE', `${raw}: 32 bit aralık dışı`);
      op.word = { k: 'const', v: c | 0 };
    } else {
      if (isHex ? c > 0xffff : c < -32768 || c > 32767) return bad('E_CONST_RANGE', `${raw}: 16 bit aralık dışı (K-32768–K32767, H0–HFFFF)`);
      op.word = { k: 'const', v: (c << 16) >> 16 };
    }
    op.k = op.word.v;
    op.raw = isHex ? raw.toUpperCase() : 'K' + c;
    return op;
  }
  const kn = parseKn(raw);
  if (kn === 'octal') return bad('E_ADDR_OCTAL', `${raw.toUpperCase()}: X/Y adresleri sekizlik sayılır (X0–X7, X10…)`);
  if (kn) {
    const maxN = d32 ? 8 : 4;
    if (kn.n < 1 || kn.n > maxN) return bad('E_OPERAND_KIND', `${kn.text}: Kn için K1–K${maxN} kullanılır (${d32 ? '32' : '16'} bit)`);
    if (!isSource && kn.type === 'X') return bad('E_OPERAND_KIND', `${mn} ${kn.text}: X girişine yazılamaz`);
    if (kn.index + kn.n * 4 - 1 > profile.max[kn.type]) return bad('E_ADDR_RANGE', `${kn.text}: ${kn.n * 4} bit aralık dışına taşıyor`);
    op.word = { k: 'kn', n: kn.n, type: kn.type, index: kn.index };
    op.raw = kn.text;
    return op;
  }
  const { addr, error } = parseAddress(raw);
  if (!addr) {
    if (error === 'octal') return bad('E_ADDR_OCTAL', `${raw.toUpperCase()}: X/Y adresleri sekizlik sayılır`);
    return bad('E_ADDR_FORMAT', `"${raw}" geçerli bir kelime işleneni değil (K10, H1F, D0, T0, C0, K1Y0)`);
  }
  op.raw = addr.text;
  if (addr.type !== 'D' && addr.type !== 'T' && addr.type !== 'C') {
    return bad('E_OPERAND_KIND', `${mn} ${addr.text}: tek bit kelime olamaz; bit grubu için K1${addr.text} gibi yaz (4 bit)`);
  }
  if (addr.index > profile.max[addr.type]) return bad('E_ADDR_RANGE', `${addr.text}: aralık dışı (${addr.type}0–${addr.type}${profile.max[addr.type]})`);
  if (!d32 && addr.type === 'C' && counterRange(profile, addr.index)?.bits === 32) {
    return bad('E_OPERAND_KIND', `${addr.text}: 32 bit sayıcıdır; 32 bit komut (D önekli) kullan`);
  }
  // Ardışık kelimeler: 32 bit komutta Dn+1/Tn+1/Cn+1 yüksek kelime (s.3-17), MUL/DIV hedefinde üst kelime/kalan (s.3-77, 3-79)
  const n = wordDevices(profile, addr.type, addr.index, d32, mulDivDst);
  if (n > 1) {
    const last = addr.index + n - 1;
    const lastText = formatAddress(addr.type, last);
    const why = mulDivDst ? `${mn} sonucu ${n} ardışık cihaz kaplar` : `32 bit işlem ${n} ardışık 16 bit cihaz kullanır (${addr.text} düşük, ${formatAddress(addr.type, addr.index + 1)} yüksek kelime)`;
    if (last > profile.max[addr.type]) return bad('E_ADDR_RANGE', `${addr.text}: ${why}; ${lastText} aralık dışı (${addr.type}0–${addr.type}${profile.max[addr.type]})`);
    if (addr.type === 'C') {
      const r0 = counterRange(profile, addr.index);
      const r1 = counterRange(profile, last);
      if (r0?.bits !== r1?.bits) return bad('E_ADDR_RANGE', `${addr.text}: ${why}; ${lastText} 32 bit sayıcıdır, 16 bit sayıcı çifti C0–C199 içinde kalmalı`);
    }
  }
  op.addr = addr;
  op.word = { k: 'dev', type: addr.type, index: addr.index };
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
  /** Açık blokları başlatan yükleme komutlarının sırası (ilki satırın kendisi; ANB/ORB en sondakini kapatır) */
  let loads: number[] = [];
  /** Kapatılmamış MPS komutlarının sırası */
  let mpsAt: number[] = [];
  let outputs = 0;
  let lastWasOutput = false;
  /** Bu satırda açık blok hatası bir kez söylendi mi */
  let openReported = false;
  /** Geçerli satır tek komutluk MCR satırı mı (ardından LD'siz komut gelemez) */
  let mcrRung = false;
  /** Geçerli satırdaki MC komutunun sırası (MC satırda tek çıkış olmalı); yoksa -1 */
  let rungMcAt = -1;
  /** Açık MC blokları (dıştan içe); block: çift bobin denetimi için blok kimliği */
  const mcStack: { n: number; line: number; instr: number; block: number }[] = [];
  let blockSeq = 0;
  const coilRung = new Map<string, { rung: number; line: number; block: number }>();
  const srcText = (k: number): string => {
    const x = ins[k];
    return x ? [x.mn, ...x.ops.map((o) => o.raw)].join(' ').trim() : '?';
  };
  /** "2. satırdaki LD X1 ile başlayan blok ANB/ORB ile birleştirilmedi" */
  const openBlockMsg = (head: string): string => {
    const open = loads.slice(1);
    const which = open.map((k) => `${ins[k]?.line}. satırdaki ${srcText(k)}`).join(', ');
    return `${head} öncesi açık blok var: ${which} ile başlayan ${open.length > 1 ? 'bloklar' : 'blok'} ANB ya da ORB ile birleştirilmedi (seri bağlamak için ANB, paralel için ORB; tek kontaksa LD yerine AND/OR yaz)`;
  };

  const close = (end: number) => {
    if (start < 0) return;
    const ri = rungs.length;
    const first = ins[start];
    if (outputs === 0) diagnostics.push(diag('E_NO_OUTPUT', 'Satırda çıkış (bobin) yok', { line: first?.line ?? 0, instr: start, rung: ri }));
    for (const k of mpsAt) {
      diagnostics.push(diag('W_MPS_UNCLOSED', 'MPS açıldı ama MPP ile kapatılmadı (son dal MPP ile başlamalı)', { line: ins[k]?.line ?? 0, instr: k, rung: ri }));
    }
    if (rungMcAt >= 0 && outputs > 1) {
      const mc = ins[rungMcAt]!;
      diagnostics.push(
        diag('E_MC_ALONE', `${srcText(rungMcAt)} satırda tek çıkış olmalı: aynı satırdaki diğer çıkışları ayrı satıra al (ör. "LD X0 / ${srcText(rungMcAt)}", altına yeni satır "LD X1 / OUT Y0")`, {
          line: mc.line,
          instr: rungMcAt,
          rung: ri,
        }),
      );
    }
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
          loads = [i];
          mpsAt = [];
          outputs = 0;
          openReported = false;
          mcrRung = false;
          rungMcAt = -1;
          at.rung = rungs.length;
        } else {
          depth++;
          loads.push(i);
        }
        lastWasOutput = false;
        break;
      case 'and':
      case 'inv':
      case 'or':
        if (start < 0 || depth === 0) diagnostics.push(diag('E_NEED_LOAD', `${it.mn}: önce LD ile başlamalı`, at));
        lastWasOutput = false;
        break;
      case 'block':
        if (depth < 2) diagnostics.push(diag('E_BLOCK_UNDERFLOW', `${it.mn}: birleştirilecek iki blok yok (her blok LD ile başlar)`, at));
        else {
          depth--;
          loads.pop();
        }
        lastWasOutput = false;
        break;
      case 'stack':
        if (it.mn === 'MPS') {
          if (start < 0 || mcrRung) diagnostics.push(diag('E_NEED_LOAD', 'MPS: önce LD ile başlamalı', at));
          else if (depth !== 1 && !openReported) {
            diagnostics.push(diag('E_OPEN_BLOCK', openBlockMsg('MPS'), at));
            openReported = true;
          }
          mpsAt.push(i);
          if (mpsAt.length > MAX_MPS_DEPTH) diagnostics.push(diag('E_MPS_DEPTH', `MPS en fazla ${MAX_MPS_DEPTH} seviye iç içe olabilir`, at));
        } else if (mpsAt.length === 0) {
          diagnostics.push(diag('E_MPS_UNDERFLOW', `${it.mn}: önce MPS gerekir`, at));
        } else if (it.mn === 'MPP') mpsAt.pop();
        lastWasOutput = false;
        break;
      case 'output': {
        const lv = it.ops[0]?.k;
        if (it.def.mc === 'MCR') {
          // MCR koşulsuz yazılır (s.3-10): önceki satırı kapatır, kendisi tek komutluk satırdır
          if (start >= 0 && !lastWasOutput) {
            diagnostics.push(
              diag('E_MCR_COND', `MCR koşulsuz yazılır: önündeki koşulu sil (${ins[start]?.line}. satırdaki ${srcText(start)} ile başlayan kontaklar). ${srcText(i)} tek başına bir satırdır`, at),
            );
            outputs++;
          } else {
            close(i);
            start = i;
            depth = 0;
            loads = [];
            mpsAt = [];
            outputs = 1;
            openReported = false;
            mcrRung = true;
            rungMcAt = -1;
            at.rung = rungs.length;
          }
          lastWasOutput = true;
          if (lv !== undefined) {
            let j = mcStack.length - 1;
            while (j >= 0 && mcStack[j]!.n !== lv) j--;
            if (j < 0) {
              diagnostics.push(diag('E_MCR_NO_MC', `MCR N${lv} için önünde açık MC N${lv} yok: bloğun başına "LD X0 / MC N${lv}" yaz ya da bu MCR'yi sil`, at));
            } else {
              for (const e of mcStack.slice(j + 1)) {
                diagnostics.push(
                  diag('E_MC_NO_MCR', `MC N${e.n} bloğu kapatılmadan ${it.line}. satırda MCR N${lv} geldi: MCR N${lv}'den önce tek başına bir satır olarak "MCR N${e.n}" yaz`, {
                    line: e.line,
                    instr: e.instr,
                  }),
                );
              }
              mcStack.length = j;
            }
          }
          break;
        }
        if (start < 0 || mcrRung) diagnostics.push(diag('E_NEED_LOAD', `${it.mn}: önce LD ile başlamalı`, at));
        else if (depth !== 1 && !openReported) {
          diagnostics.push(diag('E_OPEN_BLOCK', openBlockMsg(it.mn), at));
          openReported = true;
        }
        outputs++;
        lastWasOutput = true;
        const target = it.ops[0];
        const block = mcStack.length ? mcStack[mcStack.length - 1]!.block : 0;
        if ((it.mn === 'OUT' || it.mn === 'TMR' || it.mn === 'CNT') && target?.addr) {
          const prev = coilRung.get(target.addr.text);
          if (prev !== undefined && prev.rung !== rungs.length) {
            // Farklı MC bloklarında kullanmak çift bobini çözmez: kapalı bloktaki bobin de her taramada 0 yazılır
            const mcNote = prev.block !== block ? '; farklı MC bloklarında olması bunu değiştirmez, MC bloğu kapalıyken içindeki bobin de 0 yazılır' : '';
            diagnostics.push(diag('W_DOUBLE_COIL', `${target.addr.text} birden çok satırda bobin olarak kullanılmış (çift bobin; ilk kullanım ${prev.line}. satırda): son yazan satır kazanır${mcNote}`, at));
          } else if (prev === undefined) coilRung.set(target.addr.text, { rung: rungs.length, line: it.line, block });
        }
        if (it.def.mc === 'MC') {
          rungMcAt = i;
          if (lv !== undefined) {
            const top = mcStack[mcStack.length - 1];
            if (top && top.n >= lv) {
              const hint = top.n < MAX_MC_LEVEL ? ` (burada N${top.n + 1} kullan)` : '';
              diagnostics.push(
                diag(
                  'W_MC_ORDER',
                  `MC N${lv} iç içe sırası bozuk: ${top.line}. satırdaki MC N${top.n} bloğunun içinde; içteki numara dıştakinden büyük olmalı${hint}. Yoksa MCR N${lv}, N${lv} ve üstü bütün blokları açar: dıştaki blok kapalıyken de sonraki satırlar çalışır`,
                  at,
                ),
              );
            }
            mcStack.push({ n: lv, line: it.line, instr: i, block: ++blockSeq });
          }
        }
        break;
      }
      default:
        break;
    }
  });
  close(ins.length);
  for (const e of mcStack) {
    diagnostics.push(diag('E_MC_NO_MCR', `MC N${e.n} bloğunun sonu yok: bloğun bittiği yere tek başına bir satır olarak "MCR N${e.n}" yaz`, { line: e.line, instr: e.instr }));
  }
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
