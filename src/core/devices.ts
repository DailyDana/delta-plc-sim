// Cihaz adresleri: X/Y sekizlik, diğerleri onluk. Sabitler: K (onluk), H (onaltılık).

export type DevType = 'X' | 'Y' | 'M' | 'S' | 'T' | 'C' | 'D';
export const DEV_TYPES: readonly DevType[] = ['X', 'Y', 'M', 'S', 'T', 'C', 'D'];

export interface Address {
  type: DevType;
  /** Dizideki sıra (X/Y için sekizlik sayının onluk değeri: X10 → 8) */
  index: number;
  /** Normalleştirilmiş yazım (ör. "X10") */
  text: string;
}

export const isOctalType = (t: DevType): boolean => t === 'X' || t === 'Y';

export type AddressError = 'format' | 'octal';

/** "x10" → { type: 'X', index: 8, text: 'X10' }. Hata türünü ayrıca döndürür. */
export function parseAddress(raw: string): { addr: Address | null; error?: AddressError } {
  const m = /^([XYMSTCD])(\d+)$/i.exec(raw.trim());
  if (!m || m[1] === undefined || m[2] === undefined) return { addr: null, error: 'format' };
  const type = m[1].toUpperCase() as DevType;
  const digits = m[2];
  if (isOctalType(type)) {
    if (/[89]/.test(digits)) return { addr: null, error: 'octal' };
    return { addr: { type, index: parseInt(digits, 8), text: type + String(parseInt(digits, 8).toString(8)) } };
  }
  const index = parseInt(digits, 10);
  return { addr: { type, index, text: type + String(index) } };
}

export function formatAddress(type: DevType, index: number): string {
  return type + (isOctalType(type) ? index.toString(8) : String(index));
}

/** K123, K-5, H1F → sayı; değilse null */
export function parseConstant(raw: string): number | null {
  const s = raw.trim();
  let m = /^K(-?\d+)$/i.exec(s);
  if (m && m[1] !== undefined) return parseInt(m[1], 10);
  m = /^H([0-9A-F]+)$/i.exec(s);
  if (m && m[1] !== undefined) return parseInt(m[1], 16);
  return null;
}
