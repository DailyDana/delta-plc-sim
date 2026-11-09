// Farklılık testi: v2 sanal makinesi, v1 ağaç motoruyla tarama tarama aynı sonucu vermeli.
// Hem hazır örnekler hem de rastgele üretilmiş yüzlerce devre, rastgele girişlerle karşılaştırılır.
import { describe, expect, it } from 'vitest';
import { EXAMPLES, Machine } from '../src/core/index';
import { V1, V1_EXAMPLES } from './v1';

// Belirlenimli rastgele sayı üreteci (mulberry32): hata çıkarsa aynı tohumla yeniden üretilebilir
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const XS = ['X0', 'X1', 'X2', 'X3'];

/** Aynı IL'i iki motorda çalıştır; her taramadan sonra izlenen cihazları karşılaştır */
function compare(il: string, seed: number, scans = 400): void {
  const v1p = V1.parseIL(il);
  expect(v1p.errors.filter((e) => !e.warn), 'v1 ayrıştırma hatası').toEqual([]);
  const built = Machine.fromText(il, { profile: 'v1' });
  expect(built.machine, 'v2 makine kurulamadı: ' + JSON.stringify(built.diagnostics)).not.toBeNull();
  const m = built.machine!;
  const s1 = new V1.Sim();
  m.reset();
  const used = m.usedDevices();
  const r = rng(seed);
  const inputs: Record<string, boolean> = {};
  for (let k = 0; k < scans; k++) {
    // girişleri ara sıra değiştir (her taramada değil, kenarlar gerçekçi olsun)
    for (const x of XS) if (r() < 0.15) inputs[x] = !inputs[x];
    const dt = r() < 0.1 ? 100 : 10;
    for (const x of XS) {
      s1.bits[x] = !!inputs[x];
      m.setInput(x, !!inputs[x]);
    }
    s1.runScan(v1p.prog, dt);
    m.scan(dt);
    const at = `tohum ${seed}, tarama ${k}\n${il}`;
    for (const d of [...used.Y, ...used.M, ...used.S]) expect(m.bit(d), `${d} @ ${at}`).toBe(s1.get(d) ? 1 : 0);
    for (const d of used.T) {
      expect(m.bit(d), `${d} kontak @ ${at}`).toBe(s1.get(d) ? 1 : 0);
      expect(m.value(d), `${d} değer @ ${at}`).toBe(s1.T[d]?.cv ?? 0);
    }
    for (const d of used.C) {
      expect(m.bit(d), `${d} kontak @ ${at}`).toBe(s1.get(d) ? 1 : 0);
      expect(m.value(d), `${d} değer @ ${at}`).toBe(s1.C[d]?.cv ?? 0);
    }
  }
}

describe('v1 ile birebir eşdeğerlik', () => {
  it('örnekler v1 ile aynı (v1 examples.js ile TS kopyası da aynı)', () => {
    expect(EXAMPLES.map((e) => e.il)).toEqual(V1_EXAMPLES.map((e) => e.il));
  });

  for (const [i, ex] of EXAMPLES.entries()) {
    it(`örnek: ${ex.name}`, () => {
      for (let s = 1; s <= 5; s++) compare(ex.il, 1000 * (i + 1) + s, 600);
    });
  }

  // Rastgele devre üreteci: v1 modelinde ağaç kur, v1 toIL ile IL'e çevir (v1'in gösterebildiği her şey)
  const SRC = ['X0', 'X1', 'X2', 'X3', 'M0', 'M1', 'Y0', 'Y1', 'T0', 'T1', 'C0', 'M1013', 'M1002'];
  const KINDS = ['NO', 'NO', 'NO', 'NC', 'NC', 'P', 'F'];
  let uid = 1;
  function randSeries(r: () => number, depth: number): unknown[] {
    const n = 1 + Math.floor(r() * 3);
    const s: unknown[] = [];
    for (let i = 0; i < n; i++) {
      if (depth < 2 && r() < 0.3) {
        const nb = 2 + Math.floor(r() * 2);
        s.push({ t: 'p', id: 'p' + uid++, branches: Array.from({ length: nb }, () => randSeries(r, depth + 1)) });
      } else s.push({ t: 'c', id: 'c' + uid++, kind: KINDS[Math.floor(r() * KINDS.length)], op: SRC[Math.floor(r() * SRC.length)] });
    }
    return s;
  }
  function randCoil(r: () => number) {
    const pick = Math.floor(r() * 10);
    if (pick < 3) return { type: 'OUT', op: ['Y0', 'Y1', 'M0', 'M1'][Math.floor(r() * 4)], k: '' };
    if (pick < 4) return { type: 'SET', op: ['Y0', 'M1'][Math.floor(r() * 2)], k: '' };
    if (pick < 5) return { type: 'RST', op: ['Y0', 'M1', 'T0', 'C0'][Math.floor(r() * 4)], k: '' };
    if (pick < 7) return { type: 'TMR', op: ['T0', 'T1'][Math.floor(r() * 2)], k: String(1 + Math.floor(r() * 8)) };
    if (pick < 8) return { type: 'CNT', op: 'C0', k: String(1 + Math.floor(r() * 4)) };
    return { type: pick === 8 ? 'PLS' : 'PLF', op: ['M0', 'Y1'][Math.floor(r() * 2)], k: '' };
  }
  function randProgram(seed: number): string {
    const r = rng(seed);
    const rungs = Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({
      id: 'r' + uid++,
      comment: '',
      input: randSeries(r, 0),
      outputs: Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ id: 'o' + uid++, pre: r() < 0.4 ? randSeries(r, 1) : [], coil: randCoil(r) })),
    }));
    return V1.toIL({ rungs, labels: {} });
  }

  it('300 rastgele devre × 300 tarama', () => {
    for (let seed = 1; seed <= 300; seed++) compare(randProgram(seed), seed, 300);
  }, 120000);
});
