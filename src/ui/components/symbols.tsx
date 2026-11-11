// Küçük ladder sembolleri (pano, özellikler, sürükleme hayaleti): ladder'daki çizimle aynı dil.
import type { CoilType, ContactKind } from '../../core';

const S = { stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' as const };
const MONO = 'JetBrains Mono, monospace';

export function PartIcon({ g, k }: { g: 'c' | 'o'; k: ContactKind | CoilType | string }) {
  if (g === 'c' && k === 'CMP') {
    return (
      <svg className="pi" viewBox="0 0 76 24" aria-hidden="true">
        <path d="M2 12h12M62 12h12" {...S} strokeWidth={2} />
        <rect x="14" y="3" width="48" height="18" rx="2" {...S} strokeWidth={2} />
        <text x="38" y="16.5" textAnchor="middle" fill="currentColor" fontFamily={MONO} fontWeight={700} fontSize={11}>
          ≥
        </text>
      </svg>
    );
  }
  if (g === 'c' && k === 'INV') {
    return (
      <svg className="pi" viewBox="0 0 76 24" aria-hidden="true">
        <path d="M4 12h26M46 12h26" {...S} strokeWidth={2} />
        <path d="M31 20L45 4" {...S} strokeWidth={2.6} />
      </svg>
    );
  }
  if (g === 'c') {
    return (
      <svg className="pi" viewBox="0 0 76 24" aria-hidden="true">
        <path d="M4 12h28M44 12h28" {...S} strokeWidth={2} />
        <path d="M32 3v18M44 3v18" {...S} strokeWidth={2.6} />
        {k === 'NC' && <line x1="29" y1="20" x2="47" y2="4" {...S} strokeWidth={2.2} />}
        {k === 'P' && <path d="M38 17V8M34.5 11.5L38 8l3.5 3.5" {...S} strokeWidth={1.8} />}
        {k === 'F' && <path d="M38 7v9M34.5 12.5L38 16l3.5-3.5" {...S} strokeWidth={1.8} />}
      </svg>
    );
  }
  if (k === 'OUT')
    return (
      <svg className="pi" viewBox="0 0 76 24" aria-hidden="true">
        <path d="M4 12h24M48 12h24" {...S} strokeWidth={2} />
        <path d="M33 3Q25 12 33 21M43 3Q51 12 43 21" {...S} strokeWidth={2.4} />
      </svg>
    );
  return (
    <svg className="pi" viewBox="0 0 76 24" aria-hidden="true">
      <path d="M2 12h8M66 12h8" {...S} strokeWidth={2} />
      <rect x="10" y="3" width="56" height="18" rx="3" {...S} strokeWidth={2} />
      <text x="38" y="16.5" textAnchor="middle" fill="currentColor" fontFamily={MONO} fontWeight={700} fontSize={k.length > 4 ? 9.5 : 11}>
        {k}
      </text>
    </svg>
  );
}

export const CONTACT_PARTS: { k: ContactKind; name: string; il: string }[] = [
  { k: 'NO', name: 'Açık kontak', il: 'LD / AND / OR' },
  { k: 'NC', name: 'Kapalı kontak', il: 'LDI / ANI / ORI' },
  { k: 'P', name: 'Yükselen kenar', il: 'LDP / ANDP / ORP' },
  { k: 'F', name: 'Düşen kenar', il: 'LDF / ANDF / ORF' },
];
/** Karşılaştırma ve ters çevirme: veri bölümünde gösterilir */
export const DATA_CONTACT_PARTS: { k: ContactKind; name: string; il: string }[] = [
  { k: 'CMP', name: 'Karşılaştırma', il: 'LD= / AND> / OR<= …' },
  { k: 'INV', name: 'Ters çevir', il: 'INV' },
];
export const COIL_PARTS: { k: CoilType; name: string; desc: string }[] = [
  { k: 'OUT', name: 'Bobin', desc: 'Akım varsa 1, yoksa 0' },
  { k: 'SET', name: 'Kur', desc: 'Akım gelince 1 yap ve tut' },
  { k: 'RST', name: 'Sıfırla', desc: 'Bit, T ya da C sıfırla' },
  { k: 'TMR', name: 'Zamanlayıcı', desc: 'Akım sürdükçe sayar' },
  { k: 'CNT', name: 'Sayıcı', desc: 'Her yükselen kenarda +1' },
  { k: 'PLS', name: 'Yükselen darbe', desc: 'Tek taramalık darbe' },
  { k: 'PLF', name: 'Düşen darbe', desc: 'Tek taramalık darbe' },
];
/** Ana kontrol (master control): her biri kendi satırını açar */
export const MC_PARTS: { k: 'MC' | 'MCR'; name: string; desc: string }[] = [
  { k: 'MC', name: 'Blok başı', desc: 'MC N0: koşulu 0 iken MCR\'ye kadarki satırlar akımsız (OUT düşer, SET kalır)' },
  { k: 'MCR', name: 'Blok sonu', desc: 'MCR N0: aynı numaralı MC bloğunu bitirir; önüne kontak konmaz' },
];
/** Uygulama komutları (fonksiyon kutuları) */
export const API_PARTS: { k: string; name: string; desc: string }[] = [
  { k: 'MOV', name: 'Taşı', desc: 'MOV: değeri kopyala (K10 → D0)' },
  { k: 'CMP', name: 'Karşılaştır', desc: 'CMP: büyük / eşit / küçük → 3 bit' },
  { k: 'ADD', name: 'Topla', desc: 'ADD: D = S1 + S2' },
  { k: 'SUB', name: 'Çıkar', desc: 'SUB: D = S1 − S2' },
  { k: 'MUL', name: 'Çarp', desc: 'MUL: (D+1, D) = S1 × S2' },
  { k: 'DIV', name: 'Böl', desc: 'DIV: D = bölüm, D+1 = kalan' },
  { k: 'INC', name: 'Bir artır', desc: 'INCP: her basışta +1' },
  { k: 'DEC', name: 'Bir azalt', desc: 'DECP: her basışta −1' },
  { k: 'ZCP', name: 'Bölge', desc: 'ZCP: altında / arasında / üstünde' },
  { k: 'ZRST', name: 'Toplu sıfırla', desc: 'ZRST: M0…M10 aralığını sıfırla' },
  { k: 'ALT', name: 'Aç/kapa', desc: 'ALTP: her basışta biti değiştir' },
];
