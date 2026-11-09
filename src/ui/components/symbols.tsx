// Küçük ladder sembolleri (pano, özellikler, sürükleme hayaleti): ladder'daki çizimle aynı dil.
import type { CoilType, ContactKind } from '../../core';

const S = { stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' as const };

export function PartIcon({ g, k }: { g: 'c' | 'o'; k: ContactKind | CoilType }) {
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
      <text x="38" y="16.5" textAnchor="middle" fill="currentColor" fontFamily="JetBrains Mono, monospace" fontWeight={700} fontSize={11}>
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
export const COIL_PARTS: { k: CoilType; name: string; desc: string }[] = [
  { k: 'OUT', name: 'Bobin', desc: 'Akım varsa 1, yoksa 0' },
  { k: 'SET', name: 'Kur', desc: 'Akım gelince 1 yap ve tut' },
  { k: 'RST', name: 'Sıfırla', desc: 'Bit, T ya da C sıfırla' },
  { k: 'TMR', name: 'Zamanlayıcı', desc: 'Akım sürdükçe sayar' },
  { k: 'CNT', name: 'Sayıcı', desc: 'Her yükselen kenarda +1' },
  { k: 'PLS', name: 'Yükselen darbe', desc: 'Tek taramalık darbe' },
  { k: 'PLF', name: 'Düşen darbe', desc: 'Tek taramalık darbe' },
];
