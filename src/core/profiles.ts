// PLC model profilleri: adres aralıkları, zamanlayıcı tabanları, sayıcı türleri, kalıcı bölgeler.
// Değerler Delta'nın programlama kılavuzlarından alınmıştır (kaynak ve sayfa her profilde).
// Kılavuzda doğrulanamayan davranışlar `notes` içinde açıkça belirtilir.

import type { DevType } from './devices';

export interface TimerRange {
  from: number;
  to: number;
  baseMs: number;
  /** Birikimli: akım kesilince değer korunur, yeniden gelince kaldığı yerden devam eder */
  accumulative: boolean;
}

export interface CounterRange {
  from: number;
  to: number;
  bits: 16 | 32;
}

/** [başlangıç, bitiş] (dahil) */
export type Span = readonly [number, number];

export interface Profile {
  id: string;
  name: string;
  /** Her cihaz türü için en büyük geçerli sıra (X/Y için onluk değer: X377 → 255) */
  max: Record<DevType, number>;
  timers: TimerRange[];
  counters: CounterRange[];
  /** Kalıcı (latched) bölgeler: STOP→RUN geçişinde silinmez */
  latched: Partial<Record<DevType, Span[]>>;
  /** Salt okunur özel röleler */
  readOnly: readonly string[];
  /** RUN başında işlenen zaten ON ise LDP/ANDP/ORP ilk taramada iletir mi */
  risingOnStartup: boolean;
  /** TMR/CNT ayar değerinin alt sınırı */
  minK: number;
  verified: boolean;
  source: string;
  /** Modellenmeyen ya da kılavuzda doğrulanamayan noktalar */
  notes: readonly string[];
}

const SPECIAL_RO = ['M1000', 'M1001', 'M1002', 'M1003', 'M1011', 'M1012', 'M1013', 'M1014'] as const;

const COMMON_NOTES = [
  'TMR değerinin ayar değerine ulaşınca durup durmadığı kılavuzda yazmıyor; simülatörde ayar değerinde durur.',
  'Yüksek hızlı sayıcılar, sayıcı yön röleleri (M1200…) ve M1028/M1038 çözünürlük anahtarları modellenmedi.',
  'STOP→RUN geçişinde LDP ilk tarama davranışı kılavuzda yalnızca "güç açılışı" için yazıyor; simülatör RUN başına da uygular.',
];

/**
 * v1 profili: tarayıcıdaki ilk sürümün kullandığı sadeleştirilmiş değerler. v2 çekirdeği bu profil ile
 * v1 ile birebir aynı sonucu vermek zorundadır (tests/equivalence.test.ts).
 */
export const V1: Profile = {
  id: 'v1',
  name: 'Sadeleştirilmiş (v1 ile uyumlu)',
  max: { X: 255, Y: 255, M: 4095, S: 1023, T: 255, C: 255, D: 9999 },
  timers: [
    { from: 0, to: 199, baseMs: 100, accumulative: false },
    { from: 200, to: 239, baseMs: 10, accumulative: false },
    { from: 240, to: 255, baseMs: 1, accumulative: false },
  ],
  counters: [
    { from: 0, to: 199, bits: 16 },
    { from: 200, to: 255, bits: 32 },
  ],
  latched: {},
  readOnly: SPECIAL_RO,
  risingOnStartup: false,
  minK: 1,
  verified: false,
  source: 'v1 sürümündeki sadeleştirilmiş tablo (Delta kılavuzuyla doğrulanmadı)',
  notes: ['Gerçek modelden farklıdır: T240–T255 burada 1 ms ve birikimsiz; kalıcı bölge yok.'],
};

const ES2_SOURCE =
  'Delta DVP-ES2/EX2/SS2/SA2/SX2/SE&TP Operation Manual – Programming (2018): cihaz tablosu s.2-2…2-5, kalıcı bölgeler s.2-10, zamanlayıcılar s.2-24/2-25, sayıcılar s.2-26, LDP s.3-275, MPS s.3-7';

/** DVP-ES2/EX2 */
export const ES2: Profile = {
  id: 'ES2',
  name: 'DVP-ES2 / EX2',
  max: { X: 255, Y: 255, M: 4095, S: 1023, T: 255, C: 254, D: 9999 },
  timers: [
    { from: 0, to: 126, baseMs: 100, accumulative: false },
    { from: 127, to: 127, baseMs: 1, accumulative: false },
    { from: 128, to: 199, baseMs: 100, accumulative: false }, // T184–T199 altprogram zamanlayıcıları
    { from: 200, to: 239, baseMs: 10, accumulative: false },
    { from: 240, to: 245, baseMs: 10, accumulative: true },
    { from: 246, to: 249, baseMs: 1, accumulative: true },
    { from: 250, to: 255, baseMs: 100, accumulative: true },
  ],
  counters: [
    { from: 0, to: 199, bits: 16 },
    { from: 200, to: 254, bits: 32 },
  ],
  latched: {
    M: [[512, 767], [2048, 4095]],
    S: [[0, 127], [912, 1023]],
    T: [[240, 255]],
    C: [[112, 127], [224, 231]],
    D: [[408, 599], [2000, 3919]],
  },
  readOnly: SPECIAL_RO,
  risingOnStartup: true,
  minK: 0,
  verified: true,
  source: ES2_SOURCE,
  notes: [
    'ES2 zamanlayıcıları END komutunda işler; simülatör TMR komutunda işler (aynı taramada T kontağını TMR\'den sonra okuyan devrelerde bir tarama fark olabilir).',
    'Kılavuz T240–T255 için tabloda "non-latched", metinde "güç kesilince değer korunur" diyor; simülatör kalıcı kabul eder.',
    ...COMMON_NOTES,
  ],
};

/** DVP-SS2/SA2/SX2: ES2 ile aynı, D aralığı ve kalıcı C bölgesi farklı */
export const SS2: Profile = {
  ...ES2,
  id: 'SS2',
  name: 'DVP-SS2 / SA2 / SX2',
  max: { ...ES2.max, D: 4999 },
  latched: { ...ES2.latched, C: [[112, 127], [224, 232]] },
  source: ES2_SOURCE,
};

/** DVP-EH3/SV2 */
export const EH3: Profile = {
  id: 'EH3',
  name: 'DVP-EH3 / SV2',
  max: { X: 255, Y: 255, M: 4095, S: 1023, T: 255, C: 254, D: 11999 },
  timers: [
    { from: 0, to: 199, baseMs: 100, accumulative: false }, // T192–T199 altprogram zamanlayıcıları
    { from: 200, to: 239, baseMs: 10, accumulative: false },
    { from: 240, to: 245, baseMs: 10, accumulative: true },
    { from: 246, to: 249, baseMs: 1, accumulative: true },
    { from: 250, to: 255, baseMs: 100, accumulative: true },
  ],
  counters: [
    { from: 0, to: 199, bits: 16 },
    { from: 200, to: 254, bits: 32 },
  ],
  // Varsayılan kalıcı bölgeler (EH3/SV2'de D1200–D1219 parametreleriyle değiştirilebilir; burada sabit)
  latched: {
    M: [[500, 999], [2000, 4095]],
    S: [[500, 899]],
    T: [[240, 255]],
    C: [[100, 199], [220, 234]],
    D: [[200, 999], [2000, 9799], [10000, 11999]],
  },
  readOnly: SPECIAL_RO,
  risingOnStartup: true,
  minK: 0,
  verified: true,
  source:
    'Delta DVP-PLC Application Manual: Programming, DVP-0959720-06 (2017): cihaz tablosu s.2-6, kalıcı bölgeler s.2-8/2-15, zamanlayıcılar s.2-15…2-17, sayıcılar s.2-18/2-19, LDP s.3-13',
  notes: ['Kalıcı bölge parametreleri (D1200–D1219) modellenmedi; kılavuzdaki varsayılanlar kullanılır.', 'MPS iç içelik sınırı EH3 kılavuzunda yazmıyor; ES2 ile aynı (8) kabul edildi.', ...COMMON_NOTES],
};

export const PROFILES: Record<string, Profile> = { ES2, SS2, EH3, v1: V1 };
export const DEFAULT_PROFILE_ID = 'ES2';

export function getProfile(id?: string): Profile {
  const p = PROFILES[id ?? DEFAULT_PROFILE_ID] ?? PROFILES[(id ?? '').toUpperCase()];
  if (!p) throw new Error(`Bilinmeyen model profili: ${id} (olanlar: ${Object.keys(PROFILES).join(', ')})`);
  return p;
}

export function timerRange(p: Profile, index: number): TimerRange | undefined {
  return p.timers.find((r) => index >= r.from && index <= r.to);
}

export function counterRange(p: Profile, index: number): CounterRange | undefined {
  return p.counters.find((r) => index >= r.from && index <= r.to);
}

export function isLatched(p: Profile, type: DevType, index: number): boolean {
  return (p.latched[type] ?? []).some(([a, b]) => index >= a && index <= b);
}
