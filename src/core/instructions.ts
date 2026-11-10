// Komut tablosu: ayrıştırıcı, denetleyici, sanal makine, yardım ve otomatik tamamlama aynı tablodan beslenir.
// Uygulama komutlarının davranışı Delta DVP-ES2 programlama kılavuzundan (sayfa numaraları docs/kilavuz-notlari.md).

import type { DevType } from './devices';

/** CMP: karşılaştırma kontağı (LD= D0 K10), INV: akımı ters çevirir */
export type ContactKind = 'NO' | 'NC' | 'P' | 'F' | 'CMP' | 'INV';
export type CmpOp = '=' | '>' | '<' | '<>' | '<=' | '>=';
export const CMP_OPS: readonly CmpOp[] = ['=', '>', '<', '<>', '<=', '>='];
export type OpClass = 'load' | 'and' | 'or' | 'inv' | 'block' | 'stack' | 'output' | 'end' | 'nop';
/**
 * İşlenen türleri: bit cihazları (X…C), K sabit (TMR/CNT ayarı),
 * WS kelime kaynağı (K, H, KnX/Y/M/S, T, C, D), WD kelime hedefi (KnY/M/S, T, C, D),
 * KD ayar değeri (K ya da D), N sayı sabiti (K/H).
 */
export type OperandKind = DevType | 'K' | 'WS' | 'WD' | 'KD' | 'N';

export interface OperandSpec {
  name: string;
  kinds: readonly OperandKind[];
}

export interface InstrDef {
  mn: string;
  cls: OpClass;
  contact?: ContactKind;
  /** Karşılaştırma kontağı işleci */
  cmp?: CmpOp;
  operands: readonly OperandSpec[];
  /** Kısa Türkçe açıklama (yardım ve otomatik tamamlama) */
  desc: string;
  /** Uygulama komutu: D/P önekleri olmadan temel ad (MOV, ADD…) */
  base?: string;
  /** 32 bit (D öneki) */
  d32?: boolean;
  /** Darbe biçimi (P soneki): yalnızca sürücü akımın yükselen kenarında bir kez */
  pulse?: boolean;
  /** Delta API numarası */
  api?: number;
}

const BIT_SRC: readonly OperandKind[] = ['X', 'Y', 'M', 'S', 'T', 'C'];
const src = [{ name: 'cihaz', kinds: BIT_SRC }] as const;

const contact = (mn: string, cls: OpClass, kind: ContactKind, desc: string): InstrDef => ({ mn, cls, contact: kind, operands: src, desc });

const DEFS: InstrDef[] = [
  contact('LD', 'load', 'NO', 'Normalde açık kontakla yeni satır/blok başlat'),
  contact('LDI', 'load', 'NC', 'Normalde kapalı kontakla yeni satır/blok başlat'),
  contact('LDP', 'load', 'P', 'Yükselen kenar kontağıyla başlat'),
  contact('LDF', 'load', 'F', 'Düşen kenar kontağıyla başlat'),
  contact('AND', 'and', 'NO', 'Seri normalde açık kontak'),
  contact('ANI', 'and', 'NC', 'Seri normalde kapalı kontak'),
  contact('ANDP', 'and', 'P', 'Seri yükselen kenar kontağı'),
  contact('ANDF', 'and', 'F', 'Seri düşen kenar kontağı'),
  contact('OR', 'or', 'NO', 'Paralel normalde açık kontak'),
  contact('ORI', 'or', 'NC', 'Paralel normalde kapalı kontak'),
  contact('ORP', 'or', 'P', 'Paralel yükselen kenar kontağı'),
  contact('ORF', 'or', 'F', 'Paralel düşen kenar kontağı'),
  { mn: 'INV', cls: 'inv', contact: 'INV', operands: [], desc: 'O ana kadarki sonucu ters çevir (API 98)' },
  { mn: 'ANB', cls: 'block', operands: [], desc: 'İki bloğu seri bağla' },
  { mn: 'ORB', cls: 'block', operands: [], desc: 'İki bloğu paralel bağla' },
  { mn: 'MPS', cls: 'stack', operands: [], desc: 'Dallanma noktasını sakla' },
  { mn: 'MRD', cls: 'stack', operands: [], desc: 'Dallanma noktasını oku' },
  { mn: 'MPP', cls: 'stack', operands: [], desc: 'Dallanma noktasını oku ve bitir' },
  { mn: 'OUT', cls: 'output', operands: [{ name: 'bobin', kinds: ['Y', 'M', 'S'] }], desc: 'Bobin: akım varsa 1, yoksa 0' },
  { mn: 'SET', cls: 'output', operands: [{ name: 'bit', kinds: ['Y', 'M', 'S'] }], desc: 'Akım gelince 1 yap ve tut' },
  { mn: 'RST', cls: 'output', operands: [{ name: 'cihaz', kinds: ['Y', 'M', 'S', 'T', 'C', 'D'] }], desc: 'Akım gelince sıfırla (T/C: değer ve kontak)' },
  {
    mn: 'TMR',
    cls: 'output',
    operands: [
      { name: 'zamanlayıcı', kinds: ['T'] },
      { name: 'ayar (K ya da D)', kinds: ['KD'] },
    ],
    desc: 'Zamanlayıcı: akım sürdükçe sayar, ayar değerinde kontak kapanır',
  },
  {
    mn: 'CNT',
    cls: 'output',
    operands: [
      { name: 'sayıcı', kinds: ['C'] },
      { name: 'ayar (K ya da D)', kinds: ['KD'] },
    ],
    desc: '16 bit sayıcı: her yükselen kenarda +1',
  },
  { mn: 'PLS', cls: 'output', operands: [{ name: 'bit', kinds: ['Y', 'M'] }], desc: 'Yükselen kenarda tek taramalık darbe' },
  { mn: 'PLF', cls: 'output', operands: [{ name: 'bit', kinds: ['Y', 'M'] }], desc: 'Düşen kenarda tek taramalık darbe' },
  { mn: 'END', cls: 'end', operands: [], desc: 'Program sonu' },
  { mn: 'NOP', cls: 'nop', operands: [], desc: 'İşlem yok' },
];

// ------------------------------------------------------------------ uygulama komutları (API)
const S = (name: string): OperandSpec => ({ name, kinds: ['WS'] });
const Dw = (name: string): OperandSpec => ({ name, kinds: ['WD'] });
const B3 = (name: string): OperandSpec => ({ name, kinds: ['Y', 'M', 'S'] });

interface ApiBase {
  base: string;
  api: number;
  operands: readonly OperandSpec[];
  desc: string;
  /** 32 bit biçiminin adı (DMOV, DAND…); yoksa 32 bit biçimi yok */
  d32?: string;
  /** P biçimi var mı (hepsinde var) */
  pulse?: boolean;
}

const APIS: ApiBase[] = [
  { base: 'MOV', api: 12, operands: [S('kaynak S'), Dw('hedef D')], desc: 'S değerini D\'ye kopyala', d32: 'DMOV' },
  { base: 'CMP', api: 10, operands: [S('S1'), S('S2'), B3('sonuç D (3 bit)')], desc: 'Karşılaştır: D = S1>S2, D+1 = eşit, D+2 = S1<S2', d32: 'DCMP' },
  { base: 'ZCP', api: 11, operands: [S('alt sınır S1'), S('üst sınır S2'), S('değer S'), B3('sonuç D (3 bit)')], desc: 'Bölge karşılaştır: D = altında, D+1 = arasında, D+2 = üstünde', d32: 'DZCP' },
  { base: 'ADD', api: 20, operands: [S('S1'), S('S2'), Dw('toplam D')], desc: 'D = S1 + S2 (M1020 sıfır, M1021 borç, M1022 elde)', d32: 'DADD' },
  { base: 'SUB', api: 21, operands: [S('S1'), S('S2'), Dw('fark D')], desc: 'D = S1 − S2 (M1020 sıfır, M1021 borç, M1022 elde)', d32: 'DSUB' },
  { base: 'MUL', api: 22, operands: [S('S1'), S('S2'), Dw('çarpım D (32 bit: D, D+1)')], desc: '(D+1, D) = S1 × S2', d32: 'DMUL' },
  { base: 'DIV', api: 23, operands: [S('bölünen S1'), S('bölen S2'), Dw('bölüm D, kalan D+1')], desc: 'D = S1 ÷ S2, D+1 = kalan (sıfıra bölmede yürütülmez)', d32: 'DDIV' },
  { base: 'INC', api: 24, operands: [Dw('D')], desc: 'D = D + 1 (genelde INCP ile, yoksa her taramada artar)', d32: 'DINC' },
  { base: 'DEC', api: 25, operands: [Dw('D')], desc: 'D = D − 1 (genelde DECP ile)', d32: 'DDEC' },
  { base: 'WAND', api: 26, operands: [S('S1'), S('S2'), Dw('D')], desc: 'Bit bit VE: D = S1 AND S2', d32: 'DAND' },
  { base: 'WOR', api: 27, operands: [S('S1'), S('S2'), Dw('D')], desc: 'Bit bit VEYA: D = S1 OR S2', d32: 'DOR' },
  { base: 'WXOR', api: 28, operands: [S('S1'), S('S2'), Dw('D')], desc: 'Bit bit ÖZEL VEYA: D = S1 XOR S2', d32: 'DXOR' },
  {
    base: 'ZRST',
    api: 40,
    operands: [
      { name: 'başlangıç D1', kinds: ['Y', 'M', 'S', 'T', 'C', 'D'] },
      { name: 'bitiş D2', kinds: ['Y', 'M', 'S', 'T', 'C', 'D'] },
    ],
    desc: 'D1…D2 aralığını sıfırla (aynı tür; genelde ZRSTP ile)',
  },
  { base: 'ALT', api: 66, operands: [{ name: 'bit D', kinds: ['Y', 'M', 'S'] }], desc: 'Her yürütmede D\'yi değiştir (ALTP: her basışta bir kez)' },
];

for (const a of APIS) {
  const forms: [string, boolean, boolean][] = [
    [a.base, false, false],
    [a.base + 'P', false, true],
  ];
  if (a.d32) forms.push([a.d32, true, false], [a.d32 + 'P', true, true]);
  for (const [mn, d32, pulse] of forms) {
    DEFS.push({
      mn,
      cls: 'output',
      operands: a.operands,
      desc: (d32 ? '32 bit: ' : '') + (pulse ? 'Darbe: ' : '') + a.desc,
      base: a.base,
      d32,
      pulse,
      api: a.api,
    });
  }
}

// ------------------------------------------------------------------ karşılaştırma kontakları (API 224–246)
const CMP_API: Record<CmpOp, number> = { '=': 224, '>': 225, '<': 226, '<>': 228, '<=': 229, '>=': 230 };
const CMP_TEXT: Record<CmpOp, string> = { '=': 'eşitse', '>': 'büyükse', '<': 'küçükse', '<>': 'eşit değilse', '<=': 'küçük ya da eşitse', '>=': 'büyük ya da eşitse' };
for (const op of CMP_OPS) {
  (['LD', 'AND', 'OR'] as const).forEach((head, k) => {
    for (const d32 of [false, true]) {
      DEFS.push({
        mn: (d32 ? 'D' : '') + head + op,
        cls: (['load', 'and', 'or'] as const)[k]!,
        contact: 'CMP',
        cmp: op,
        operands: [S('S1'), S('S2')],
        desc: `${d32 ? '32 bit ' : ''}karşılaştırma kontağı: S1 ${op} S2 ${CMP_TEXT[op]} kapalı (${['başlat', 'seri', 'paralel'][k]})`,
        d32,
        api: CMP_API[op] + k * 8,
      });
    }
  });
}

export const INSTRUCTIONS: Readonly<Record<string, InstrDef>> = Object.fromEntries(DEFS.map((d) => [d.mn, d]));

/** Temel kontak komutları (CMP ve INV hariç; onların adı işleçten/konumdan üretilir) */
export const CONTACT_MNEMONICS: Readonly<Record<'NO' | 'NC' | 'P' | 'F', readonly [load: string, and: string, or: string]>> = {
  NO: ['LD', 'AND', 'OR'],
  NC: ['LDI', 'ANI', 'ORI'],
  P: ['LDP', 'ANDP', 'ORP'],
  F: ['LDF', 'ANDF', 'ORF'],
};

/** Karşılaştırma kontağının komut adı: konum 0 LD, 1 AND, 2 OR */
export const cmpMnemonic = (op: CmpOp, pos: 0 | 1 | 2, d32 = false): string => (d32 ? 'D' : '') + ['LD', 'AND', 'OR'][pos] + op;

export const COIL_TYPES = ['OUT', 'SET', 'RST', 'TMR', 'CNT', 'PLS', 'PLF'] as const;
export type CoilType = (typeof COIL_TYPES)[number];
export const isCoilType = (s: string): s is CoilType => (COIL_TYPES as readonly string[]).includes(s);

/** Uygulama komutlarının temel adları (pano ve özellikler için) */
export const API_BASES: readonly string[] = APIS.map((a) => a.base);
/** Temel ad + 32 bit + darbe → komut adı (ör. MOV, true, true → DMOVP); biçim yoksa null */
export function apiMnemonic(base: string, d32: boolean, pulse: boolean): string | null {
  const a = APIS.find((x) => x.base === base);
  if (!a) return null;
  if (d32 && !a.d32) return null;
  return (d32 ? a.d32! : a.base) + (pulse ? 'P' : '');
}

/** MPS en fazla kaç seviye iç içe olabilir (Delta: 8) */
export const MAX_MPS_DEPTH = 8;
