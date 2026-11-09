// Komut tablosu: ayrıştırıcı, denetleyici, sanal makine, yardım ve otomatik tamamlama aynı tablodan beslenir.

import type { DevType } from './devices';

export type ContactKind = 'NO' | 'NC' | 'P' | 'F';
export type OpClass = 'load' | 'and' | 'or' | 'block' | 'stack' | 'output' | 'end' | 'nop';
export type OperandKind = DevType | 'K';

export interface OperandSpec {
  name: string;
  kinds: readonly OperandKind[];
}

export interface InstrDef {
  mn: string;
  cls: OpClass;
  contact?: ContactKind;
  operands: readonly OperandSpec[];
  /** Kısa Türkçe açıklama (yardım ve otomatik tamamlama) */
  desc: string;
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
      { name: 'ayar', kinds: ['K'] },
    ],
    desc: 'Zamanlayıcı: akım sürdükçe sayar, ayar değerinde kontak kapanır',
  },
  {
    mn: 'CNT',
    cls: 'output',
    operands: [
      { name: 'sayıcı', kinds: ['C'] },
      { name: 'ayar', kinds: ['K'] },
    ],
    desc: '16 bit sayıcı: her yükselen kenarda +1',
  },
  { mn: 'PLS', cls: 'output', operands: [{ name: 'bit', kinds: ['Y', 'M'] }], desc: 'Yükselen kenarda tek taramalık darbe' },
  { mn: 'PLF', cls: 'output', operands: [{ name: 'bit', kinds: ['Y', 'M'] }], desc: 'Düşen kenarda tek taramalık darbe' },
  { mn: 'END', cls: 'end', operands: [], desc: 'Program sonu' },
  { mn: 'NOP', cls: 'nop', operands: [], desc: 'İşlem yok' },
];

export const INSTRUCTIONS: Readonly<Record<string, InstrDef>> = Object.fromEntries(DEFS.map((d) => [d.mn, d]));

export const CONTACT_MNEMONICS: Readonly<Record<ContactKind, readonly [load: string, and: string, or: string]>> = {
  NO: ['LD', 'AND', 'OR'],
  NC: ['LDI', 'ANI', 'ORI'],
  P: ['LDP', 'ANDP', 'ORP'],
  F: ['LDF', 'ANDF', 'ORF'],
};

export const COIL_TYPES = ['OUT', 'SET', 'RST', 'TMR', 'CNT', 'PLS', 'PLF'] as const;
export type CoilType = (typeof COIL_TYPES)[number];
export const isCoilType = (s: string): s is CoilType => (COIL_TYPES as readonly string[]).includes(s);

/** MPS en fazla kaç seviye iç içe olabilir (Delta: 8; kılavuz araştırmasıyla doğrulanacak) */
export const MAX_MPS_DEPTH = 8;
