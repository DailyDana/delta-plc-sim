// MC / MCR (ana kontrol, master control). Kaynak: Delta DVP-ES2 Programming kılavuzu s.3-10/3-11.
// MC etkin değilken MC–MCR arasındaki komutlar "akım gelmemiş" gibi yürütülür: genel zamanlayıcı sıfırlanır,
// birikimli zamanlayıcı/sayıcı değerini korur, OUT bobinleri düşer, SET/RST ile kurulanlar kalır, uygulama
// komutları çalışmaz. Ayrıca: satır modeli, tanılamalar, ladder gidiş-dönüşü ve canlı akım gösterimi.
import { describe, expect, it } from 'vitest';
import { Machine, checkIl, drawLadderText, getProfile, ilToLadder, ladderToIl, parseIl, parseLadder, type Ladder, type OutBranch } from '../src/core';
import { computePower, mcRailOf } from '../src/ui/ladder/power';
import { apply, drop, insertPart, pasteClip, slotAccepts, takeClip } from '../src/ui/state/edit';
import { applyQuick, parseQuick } from '../src/ui/ladder/quick';
import { layout } from '../src/ui/ladder/layout';

const run = (il: string, setup?: (m: Machine) => void, scans = 1) => {
  const r = Machine.fromText(il + '\nEND');
  if (!r.machine) throw new Error(r.diagnostics.map((d) => d.message).join('; '));
  const m = r.machine;
  setup?.(m);
  for (let i = 0; i < scans; i++) m.scan(10);
  return m;
};
const diags = (il: string, model?: string) => checkIl(il + '\nEND', model ? getProfile(model) : undefined).diagnostics;
const codes = (il: string, model?: string) => diags(il, model).map((d) => d.code);

// Kılavuz örneği (s.3-11): iki seviye iç içe, ardından aynı N0 yeniden kullanılıyor
const KILAVUZ = ['LD X0', 'MC N0', 'LD X1', 'OUT Y0', 'LD X2', 'MC N1', 'LD X3', 'OUT Y1', 'MCR N1', 'MCR N0', 'LD X10', 'MC N0', 'LD X11', 'OUT Y10', 'MCR N0'].join('\n');

describe('MC/MCR yazımı ve satır modeli', () => {
  it('kılavuz örneği tanılamasız; MCR kendi başına tek komutluk satır', () => {
    const r = checkIl(KILAVUZ + '\nEND');
    expect(r.diagnostics).toEqual([]);
    // LD X0/MC · LD X1/OUT · LD X2/MC · LD X3/OUT · MCR · MCR · LD X10/MC · LD X11/OUT · MCR
    expect(r.rungs.map((s) => s.end - s.start)).toEqual([2, 2, 2, 2, 1, 1, 2, 2, 1]);
  });

  it('işlenen N0–N7: N8 aralık dışı (engelleyici), X0 yanlış tür, eksik işlenen', () => {
    expect(codes('LD X0\nMC N8\nMCR N8')).toContain('E_MC_LEVEL');
    expect(Machine.fromText('LD X0\nMC N8\nMCR N8\nEND').machine).toBeNull();
    expect(diags('LD X0\nMC N8\nMCR N8').find((d) => d.code === 'E_MC_LEVEL')!.message).toMatch(/N0–N7/);
    expect(codes('LD X0\nMC X0\nMCR N0')).toContain('E_OPERAND_KIND');
    expect(codes('LD X0\nMC\nMCR N0')).toContain('E_OPERAND_MISSING');
    expect(codes('LD X0\nMC K0\nMCR N0')).toContain('E_OPERAND_KIND');
  });

  it('MCR önünde kontak varsa hata: "MCR koşulsuz yazılır"', () => {
    const d = diags('LD X0\nMC N0\nLD X1\nOUT Y0\nLD X2\nMCR N0');
    const e = d.find((x) => x.code === 'E_MCR_COND');
    expect(e, JSON.stringify(d)).toBeDefined();
    expect(e!.message).toMatch(/koşulsuz/);
    expect(e!.line).toBe(6);
    expect(Machine.fromText('LD X0\nMC N0\nLD X1\nOUT Y0\nLD X2\nMCR N0\nEND').machine).toBeNull();
  });

  it('MCR\'si olmayan MC: hata MC\'nin satırında', () => {
    const d = diags('LD X1\nOUT Y1\nLD X0\nMC N0\nLD X1\nOUT Y0');
    const e = d.find((x) => x.code === 'E_MC_NO_MCR');
    expect(e).toBeDefined();
    expect(e!.line).toBe(4);
    expect(e!.message).toMatch(/MCR N0/);
    expect(Machine.fromText('LD X0\nMC N0\nLD X1\nOUT Y0\nEND').machine).toBeNull();
  });

  it('MC\'siz MCR: hata', () => {
    const d = diags('LD X1\nOUT Y0\nMCR N0');
    expect(d.map((x) => x.code)).toContain('E_MCR_NO_MC');
    expect(d.find((x) => x.code === 'E_MCR_NO_MC')!.line).toBe(3);
  });

  it('içteki MC kapanmadan dıştaki MCR: içteki MC için MCR eksik hatası', () => {
    const d = diags('LD X0\nMC N0\nLD X1\nMC N1\nLD X2\nOUT Y0\nMCR N0');
    const e = d.find((x) => x.code === 'E_MC_NO_MCR');
    expect(e).toBeDefined();
    expect(e!.line).toBe(4);
  });

  it('iç içe sırası bozuk (içteki numara dıştakinden büyük değil): uyarı, program çalışır', () => {
    const il = 'LD X0\nMC N1\nLD X1\nMC N0\nLD X2\nOUT Y0\nMCR N0\nMCR N1';
    const d = diags(il);
    expect(d.map((x) => x.severity)).toEqual(['warning']);
    expect(d[0]!.code).toBe('W_MC_ORDER');
    expect(d[0]!.line).toBe(4);
    expect(Machine.fromText(il + '\nEND').machine).not.toBeNull();
  });

  it('MC satırda tek çıkış olmalı', () => {
    expect(codes('LD X0\nMC N0\nOUT Y1\nLD X1\nOUT Y0\nMCR N0')).toContain('E_MC_ALONE');
    expect(codes('LD X0\nOUT Y1\nMC N0\nLD X1\nOUT Y0\nMCR N0')).toContain('E_MC_ALONE');
  });

  it('MCR\'den sonra LD\'siz komut: önce LD gerekir', () => {
    expect(codes('LD X0\nMC N0\nMCR N0\nOUT Y0')).toContain('E_NEED_LOAD');
    expect(codes('LD X0\nMC N0\nMCR N0\nAND X1\nOUT Y0')).toContain('E_NEED_LOAD');
  });

  it('v1 profili MC/MCR desteklemez', () => {
    const d = diags('LD X0\nMC N0\nLD X1\nOUT Y0\nMCR N0', 'v1');
    // komut düşürüldüğü için ardından yapı hataları da gelebilir; ikisi de "desteklenmiyor" der
    expect(d.filter((x) => x.code === 'E_UNSUPPORTED').map((x) => x.line)).toEqual([2, 5]);
    expect(d[0]!.message).toMatch(/desteklenmiyor/);
    expect(Machine.fromText('LD X0\nMC N0\nLD X1\nOUT Y0\nMCR N0\nEND', { profile: 'v1' }).machine).toBeNull();
  });

  it('çift bobin farklı MC bloklarında: uyarı verilir, metin MC durumunu açıklar', () => {
    const d = diags('LD X0\nMC N0\nLD X2\nOUT Y0\nMCR N0\nLD X1\nMC N0\nLD X3\nOUT Y0\nMCR N0');
    const w = d.find((x) => x.code === 'W_DOUBLE_COIL');
    expect(w).toBeDefined();
    expect(w!.message).toMatch(/MC/);
    // MC'siz programdaki metin değişmez
    const plain = diags('LD X0\nOUT Y0\nLD X1\nOUT Y0').find((x) => x.code === 'W_DOUBLE_COIL')!;
    expect(plain.message).not.toMatch(/MC/);
  });
});

describe('MC/MCR yürütme (s.3-10 tablosu)', () => {
  it('kılavuz örneği: N0 kapalıyken içteki her şey düşer; N1 yalnızca kendi bloğunu keser', () => {
    const m = Machine.fromText(KILAVUZ + '\nEND').machine!;
    const set = (x: Record<string, number>) => Object.entries(x).forEach(([k, v]) => m.setInput(k, v));
    set({ X0: 0, X1: 1, X2: 1, X3: 1, X10: 1, X11: 1 });
    m.scan(10);
    expect([m.bit('Y0'), m.bit('Y1'), m.bit('Y10')]).toEqual([0, 0, 1]);
    set({ X0: 1 });
    m.scan(10);
    expect([m.bit('Y0'), m.bit('Y1'), m.bit('Y10')]).toEqual([1, 1, 1]);
    set({ X2: 0 });
    m.scan(10);
    expect([m.bit('Y0'), m.bit('Y1')]).toEqual([1, 0]);
    set({ X2: 1, X10: 0 });
    m.scan(10);
    expect([m.bit('Y0'), m.bit('Y1'), m.bit('Y10')]).toEqual([1, 1, 0]);
    set({ X0: 0 });
    m.scan(10);
    expect([m.bit('Y0'), m.bit('Y1')]).toEqual([0, 0]);
  });

  it('OUT düşer, SET ile kurulan kalır; RST de çalışmaz', () => {
    const il = 'LD X0\nMC N0\nLD M1000\nOUT Y0\nLD X1\nSET Y1\nLD X2\nRST Y2\nMCR N0\nLD X3\nSET Y2';
    const m = run(il, (mm) => {
      mm.setInput('X0', 1);
      mm.setInput('X1', 1);
      mm.setInput('X3', 1);
    });
    expect([m.bit('Y0'), m.bit('Y1'), m.bit('Y2')]).toEqual([1, 1, 1]);
    m.setInput('X0', 0);
    m.setInput('X1', 0);
    m.setInput('X2', 1);
    m.scan(10);
    expect([m.bit('Y0'), m.bit('Y1'), m.bit('Y2')]).toEqual([0, 1, 1]);
  });

  it('kapalı bölgede kontak türü fark etmez: LDI, INV ve karşılaştırma kontağıyla sürülen OUT da 0', () => {
    const il = 'LD X0\nMC N0\nLDI X1\nOUT Y0\nLD X1\nINV\nOUT Y1\nLD= D0 K0\nOUT Y2\nMCR N0';
    const m = run(il);
    expect([m.bit('Y0'), m.bit('Y1'), m.bit('Y2')]).toEqual([0, 0, 0]);
    m.setInput('X0', 1);
    m.scan(10);
    expect([m.bit('Y0'), m.bit('Y1'), m.bit('Y2')]).toEqual([1, 1, 1]);
  });

  it('genel zamanlayıcı sıfırlanır; birikimli zamanlayıcı ve sayıcı değeri ile kontağı korunur', () => {
    const il = 'LD X0\nMC N0\nLD M1000\nTMR T0 K100\nLD M1000\nTMR T250 K3\nLD X1\nCNT C0 K2\nMCR N0';
    const m = run(il, (mm) => mm.setInput('X0', 1), 0);
    for (let i = 0; i < 2; i++) {
      m.setInput('X1', 1);
      m.scan(100);
      m.setInput('X1', 0);
      m.scan(100);
    }
    expect(m.value('T0')).toBe(4);
    expect(m.bit('T250')).toBe(1);
    expect([m.value('C0'), m.bit('C0')]).toEqual([2, 1]);
    m.setInput('X0', 0);
    m.scan(100);
    expect([m.value('T0'), m.bit('T0')]).toEqual([0, 0]);
    expect([m.value('T250'), m.bit('T250')]).toEqual([3, 1]);
    expect([m.value('C0'), m.bit('C0')]).toEqual([2, 1]);
  });

  it('birikimli zamanlayıcı blok yeniden açılınca kaldığı yerden sayar', () => {
    const m = run('LD X0\nMC N0\nLD M1000\nTMR T250 K10\nMCR N0', (mm) => mm.setInput('X0', 1), 4);
    expect(m.value('T250')).toBe(0); // 4 × 10 ms < 100 ms
    m.scan(60);
    expect(m.value('T250')).toBe(1);
    m.setInput('X0', 0);
    m.scan(500);
    expect(m.value('T250')).toBe(1);
    m.setInput('X0', 1);
    m.scan(100);
    expect(m.value('T250')).toBe(2);
  });

  it('uygulama komutları çalışmaz (INC, MOV)', () => {
    const il = 'LD X0\nMC N0\nLD M1000\nINC D0\nLD M1000\nMOV K7 D1\nMCR N0';
    const m = run(il, undefined, 3);
    expect([m.value('D0'), m.value('D1')]).toEqual([0, 0]);
    m.setInput('X0', 1);
    m.scan(10);
    m.scan(10);
    expect([m.value('D0'), m.value('D1')]).toEqual([2, 7]);
  });

  it('MC koşulu tarama ortasında değişirse sonraki taramada etkiler; MCR sonrası satırlar etkilenmez', () => {
    const m = run('LD X0\nMC N0\nLD M1000\nOUT Y0\nMCR N0\nLD M1000\nOUT Y1');
    expect([m.bit('Y0'), m.bit('Y1')]).toEqual([0, 1]);
  });

  it('MCR Nn n ve daha derin seviyeleri açar; sıra bozuksa dıştaki blok kapalıyken içteki MCR sonrası çalışır', () => {
    // N1 dışta, N0 içte (uyarılı yazım): MCR N0 her şeyi açar
    const m = run('LD X0\nMC N1\nLD X1\nMC N0\nLD M1000\nOUT Y0\nMCR N0\nLD M1000\nOUT Y1\nMCR N1', (mm) => mm.setInput('X1', 1));
    expect([m.bit('Y0'), m.bit('Y1')]).toEqual([0, 1]);
    // doğru sıra: N0 dışta kapalıyken içteki MCR N1 bloğu açamaz
    const n = run('LD X0\nMC N0\nLD X1\nMC N1\nLD M1000\nOUT Y0\nMCR N1\nLD M1000\nOUT Y1\nMCR N0', (mm) => mm.setInput('X1', 1));
    expect([n.bit('Y0'), n.bit('Y1')]).toEqual([0, 0]);
  });

  it('iz: kapalı bölgedeki komutlar işaretli, çıkışların accIn izi 0', () => {
    const m = run('LD X0\nMC N0\nLD M1000\nOUT Y0\nMCR N0\nLD M1000\nOUT Y1');
    // 0 LD X0 · 1 MC · 2 LD M1000 · 3 OUT Y0 · 4 MCR · 5 LD M1000 · 6 OUT Y1
    expect([...m.mcClosed]).toEqual([0, 0, 1, 1, 1, 0, 0]);
    expect(m.accIn[3]).toBe(0);
    expect(m.accIn[4]).toBe(0); // MCR: bölge kapalıyken girdi yok
    expect(m.closed[2]).toBe(1); // kontak kendisi kapalı (akımdan bağımsız)
    expect(m.accIn[6]).toBe(1);
    m.setInput('X0', 1);
    m.scan(10);
    expect([...m.mcClosed]).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect([m.accIn[1], m.accIn[3], m.accIn[4]]).toEqual([1, 1, 1]);
  });

  it('kenar belleği kapalı bölgede de güncellenir: koşulu zaten 1 olan LDP blok açılınca tetiklenmez', () => {
    const m = run('LD X0\nMC N0\nLDP X1\nSET Y0\nMCR N0', (mm) => mm.setInput('X1', 1), 2);
    m.setInput('X0', 1);
    m.scan(10);
    expect(m.bit('Y0')).toBe(0);
  });

  it('blok yeniden açıldığında koşulu 1 olan darbe komutu tetiklenir (çıkarım: kenar belleği q=0 görür)', () => {
    const m = run('LD X0\nMC N0\nLD X1\nINCP D0\nMCR N0', (mm) => mm.setInput('X1', 1), 2);
    expect(m.value('D0')).toBe(0);
    m.setInput('X0', 1);
    m.scan(10);
    expect(m.value('D0')).toBe(1);
  });
});

// ------------------------------------------------------------------ ladder gidiş-dönüşü ve canlı akım
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const WATCH = ['Y0', 'Y1', 'Y2', 'Y3', 'M0', 'M1', 'M2', 'M3', 'C0', 'T0', 'T250'];
const INPUTS = ['X0', 'X1', 'X2', 'X3'];

function sameTrace(a: string, b: string, seed: number, scans = 60): void {
  const ma = Machine.fromText(a).machine!;
  const mb = Machine.fromText(b).machine!;
  expect(ma, a).not.toBeNull();
  expect(mb, b).not.toBeNull();
  const r = rng(seed);
  for (let k = 0; k < scans; k++) {
    for (const x of INPUTS) {
      const v = r() < 0.5 ? 1 : 0;
      ma.setInput(x, v);
      mb.setInput(x, v);
    }
    ma.scan(50);
    mb.scan(50);
    for (const d of WATCH) expect(mb.bit(d), `${d} @ tarama ${k}\n--- özgün\n${a}\n--- geri yazılan\n${b}`).toBe(ma.bit(d));
  }
}

/** Gösterilen bobin akımı (MC/MCR kutuları dahil) = makinenin o komuta giren akımı (accIn) */
function powerMatches(il: string, seed: number, scans = 40): number {
  const conv = ilToLadder(parseIl(il).program);
  const ladder = conv.ladder!;
  expect(ladder, il + JSON.stringify(conv.diagnostics)).not.toBeNull();
  const m = Machine.fromText(il).machine!;
  const coils: [string, number][] = [];
  const walk = (list: OutBranch[]) => list.forEach((o) => (o.coil ? coils.push([o.id, conv.instrOf.get(o.id)!]) : walk(o.children ?? [])));
  ladder.rungs.forEach((rg) => walk(rg.outputs));
  for (const [, i] of coils) expect(i, il).toBeTypeOf('number');
  const r = rng(seed);
  let n = 0;
  for (let k = 0; k < scans; k++) {
    for (const x of INPUTS) m.setInput(x, r() < 0.5 ? 1 : 0);
    m.scan(50);
    const pm = computePower(ladder, (cid) => m.closed[conv.instrOf.get(cid)!] === 1, mcRailOf(conv.instrOf, m.mcClosed));
    for (const [oid, i] of coils) {
      expect(pm.get(oid + ':q'), `akım, komut ${i} @ tarama ${k}\n${il}`).toBe(m.accIn[i] === 1);
      n++;
    }
  }
  return n;
}

const roundTrip = (il: string): string => {
  const r = parseLadder(il);
  expect(r.ladder, il + '\n' + JSON.stringify(r.diagnostics)).not.toBeNull();
  return ladderToIl(r.ladder!);
};

/** Rastgele MC/MCR'li program: iç içe bloklar (N sırayla), bloklarda kaskad/MPS'li satırlar, TMR/CNT/INCP */
function randomMcProgram(r: () => number): string {
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
  const bits = ['X0', 'X1', 'X2', 'X3', 'M0', 'M1', 'M2', 'M3', 'Y0', 'Y1'];
  const coils = ['Y0', 'Y1', 'Y2', 'Y3', 'M0', 'M1', 'M2', 'M3'];
  const contact = () => {
    const t = r();
    if (t < 0.1) return 'AND>= D0 K2';
    if (t < 0.15) return 'INV';
    return pick(['AND', 'ANI', 'AND', 'ANI', 'ANDP']) + ' ' + pick(bits);
  };
  const output = () => {
    const t = r();
    if (t < 0.5) return 'OUT ' + pick(coils);
    if (t < 0.6) return 'SET ' + pick(coils);
    if (t < 0.7) return 'RST ' + pick(coils);
    if (t < 0.78) return 'CNT C0 K3';
    if (t < 0.86) return 'TMR T0 K3';
    if (t < 0.92) return 'TMR T250 K4';
    if (t < 0.96) return 'INCP D0';
    return 'PLF M3';
  };
  const section = (depth: number): string[] => {
    const out: string[] = [];
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      if (r() < 0.4) out.push(contact());
      if (depth < 1 && r() < 0.15) {
        out.push('MPS', ...section(depth + 1), 'MPP', ...section(depth + 1));
        return out;
      }
      out.push(output());
    }
    return out;
  };
  const lines: string[] = [];
  const open: number[] = [];
  const steps = 3 + Math.floor(r() * 8);
  for (let s = 0; s < steps; s++) {
    const t = r();
    if (t < 0.3 && open.length < 3) {
      lines.push((r() < 0.3 ? 'LDI ' : 'LD ') + pick(bits));
      if (r() < 0.3) lines.push(contact());
      const n = open.length;
      lines.push('MC N' + n);
      open.push(n);
    } else if (t < 0.45 && open.length) {
      lines.push('MCR N' + open.pop());
    } else {
      lines.push((r() < 0.3 ? 'LDI ' : 'LD ') + pick(bits));
      if (r() < 0.3) lines.push(contact());
      lines.push(...section(0));
    }
  }
  while (open.length) lines.push('MCR N' + open.pop());
  lines.push('END');
  return lines.join('\n');
}

describe('MC/MCR ladder gidiş-dönüşü ve akım gösterimi', () => {
  it('MC kutu çıkış, MCR girişsiz satırda tek çıkış; IL\'e LD M1000 yazılmaz', () => {
    const { ladder } = parseLadder(KILAVUZ + '\nEND');
    expect(ladder).not.toBeNull();
    const l = ladder!;
    expect(l.rungs).toHaveLength(9);
    expect(l.rungs[0]!.outputs[0]!.coil).toEqual({ type: 'MC', op: 'N0', k: '' });
    expect(l.rungs[4]!.input).toEqual([]);
    expect(l.rungs[4]!.outputs.map((o) => o.coil)).toEqual([{ type: 'MCR', op: 'N1', k: '' }]);
    const il = ladderToIl(l);
    expect(il).not.toMatch(/M1000/);
    expect(il.split('\n').filter((x) => !x.startsWith(';')).join('\n')).toBe(KILAVUZ + '\nEND');
    const txt = drawLadderText(l);
    expect(txt).not.toMatch(/M1000/);
    expect(txt).toMatch(/\[MC N0\]/);
    expect(txt).toMatch(/\[MCR N1\]/);
  });

  it('kontaklı MCR (hatalı) ladder\'a çevrilir: kontak görünür, tanılama düzeltmeyi söyler', () => {
    const { ladder } = parseLadder('LD X0\nMC N0\nLD X1\nMCR N0\nEND');
    expect(ladder).not.toBeNull();
    expect(ladder!.rungs[1]!.input).toHaveLength(1);
    expect(ladderToIl(ladder!)).toMatch(/LD X1\nMCR N0/);
  });

  it('300 rastgele MC/MCR programı: geri yazılan IL aynı izi verir, gidiş-dönüş kararlı, akım = accIn', () => {
    const r = rng(20261112);
    let checked = 0;
    let closedSeen = 0;
    for (let n = 0; n < 300; n++) {
      const src = randomMcProgram(r);
      const res = Machine.fromText(src);
      expect(res.machine, src + '\n' + JSON.stringify(res.diagnostics.filter((d) => d.severity === 'error'))).not.toBeNull();
      const once = roundTrip(src);
      sameTrace(src, once, n + 10);
      checked += powerMatches(src, n + 500);
      checked += powerMatches(once, n + 900);
      expect(roundTrip(once), src).toBe(once);
      const m = res.machine!;
      for (let k = 0; k < 5; k++) {
        m.setInput('X0', k & 1);
        m.scan(10);
        closedSeen += m.mcClosed.reduce((a, b) => a + b, 0);
      }
    }
    expect(checked).toBeGreaterThan(20000);
    expect(closedSeen).toBeGreaterThan(100); // kapalı bölgeler gerçekten sınandı
  }, 120000);

  it('kapalı bloktaki satırların barası enerjisiz: tel ve bobin enerjisiz görünür', () => {
    const il = 'LD X0\nMC N0\nLD M1000\nOUT Y0\nMCR N0\nEND';
    const conv = ilToLadder(parseIl(il).program);
    const l = conv.ladder!;
    const m = Machine.fromText(il).machine!;
    m.scan(10);
    const pm = computePower(l, (cid) => m.closed[conv.instrOf.get(cid)!] === 1, mcRailOf(conv.instrOf, m.mcClosed));
    const inner = l.rungs[1]!;
    const c = inner.input[0]!;
    expect(pm.get(inner.id + ':rail')).toBe(false);
    expect(pm.get(c.id + ':closed')).toBe(true); // M1000 kendisi kapalı
    expect(pm.get(c.id + ':in')).toBe(false);
    expect(pm.get(inner.outputs[0]!.id + ':q')).toBe(false);
    expect(pm.get(l.rungs[2]!.id + ':rail')).toBe(false); // MCR satırı da bloğa ait
    expect(pm.get(l.rungs[0]!.id + ':rail')).toBe(true);
    // eşlemesiz çağrıda (eski davranış) bara hep enerjili
    expect(computePower(l, () => true).get(inner.outputs[0]!.id + ':q')).toBe(true);
  });
});

// ------------------------------------------------------------------ arayüz düzenleme işlemleri
describe('MC/MCR düzenleme (pano, hızlı yazım, korumalar)', () => {
  const L = (il: string) => parseLadder(il + '\nEND').ladder!;
  const code = (l: Ladder) => ladderToIl(l).split('\n').filter((x) => x && !x.startsWith(';'));

  it('panodan MC: seçili satırın altına "LD X0 / MC N0"; MCR: içteki açık bloğun numarasıyla koşulsuz satır', () => {
    const l = L('LD X1\nOUT Y0');
    let r = insertPart(l, l.rungs[0]!.id, { src: 'palette', g: 'o', k: 'MC' });
    expect(code(l)).toEqual(['LD X1', 'OUT Y0', 'LD X0', 'MC N0', 'END']);
    r = insertPart(l, r.sel, { src: 'palette', g: 'o', k: 'MC' });
    expect(code(l).slice(4, 6)).toEqual(['LD X0', 'MC N1']);
    r = insertPart(l, r.sel, { src: 'palette', g: 'o', k: 'MCR' });
    expect(code(l).slice(6)).toEqual(['MCR N1', 'END']);
    insertPart(l, r.sel, { src: 'palette', g: 'o', k: 'MCR' });
    expect(code(l).slice(6)).toEqual(['MCR N1', 'MCR N0', 'END']);
    expect(Machine.fromText(ladderToIl(l)).machine).not.toBeNull();
  });

  it('hızlı yazım: MC N0 / MCR N0; hatalı seviye açıklanır', () => {
    expect(parseQuick('mc n0')).toEqual({ t: 'coil', type: 'MC', op: 'N0', k: '' });
    expect(parseQuick('MCR N2')).toEqual({ t: 'coil', type: 'MCR', op: 'N2', k: '' });
    expect(parseQuick('MC N8')).toMatch(/N0–N7/);
    expect(parseQuick('MC X0')).toMatch(/seviye/);
    const l = L('LD X1\nOUT Y0');
    const r = applyQuick(l, l.rungs[0]!.id, parseQuick('MC N0') as Exclude<ReturnType<typeof parseQuick>, string>);
    applyQuick(l, r.sel, parseQuick('MCR N0') as Exclude<ReturnType<typeof parseQuick>, string>);
    expect(code(l)).toEqual(['LD X1', 'OUT Y0', 'LD X0', 'MC N0', 'MCR N0', 'END']);
  });

  it('MCR satırına kontak, MC/MCR satırına ikinci çıkış eklenmez', () => {
    const l = L('LD X0\nMC N0\nLD X1\nOUT Y0\nMCR N0');
    const mcr = l.rungs[2]!;
    const mcrOut = mcr.outputs[0]!.id;
    expect(apply(l, mcrOut, 'addLeft').refuse).toMatch(/koşulsuz/);
    expect(apply(l, mcr.id, 'addRight').refuse).toMatch(/koşulsuz/);
    expect(apply(l, mcrOut, 'addOutput').refuse).toBeTruthy();
    expect(apply(l, l.rungs[0]!.outputs[0]!.id, 'addOutput').refuse).toBeTruthy();
    expect(insertPart(l, mcrOut, { src: 'palette', g: 'c', k: 'NO' }).refuse).toMatch(/koşulsuz/);
    expect(insertPart(l, mcrOut, { src: 'palette', g: 'o', k: 'OUT' }).refuse).toBeTruthy();
    expect(applyQuick(l, mcrOut, parseQuick('X3') as Exclude<ReturnType<typeof parseQuick>, string>).refuse).toMatch(/koşulsuz/);
    const clip = takeClip(l, l.rungs[1]!.input[0]!.id)!;
    expect(pasteClip(l, mcrOut, clip).refuse).toMatch(/koşulsuz/);
    // sahnede MCR girişine ve MC/MCR satırlarına çıkış bırakma noktası yok
    const sc = layout(l);
    expect(sc.slots.some((s) => s.t === 'c' && s.ser.owner === mcr.id)).toBe(false);
    expect(sc.slots.some((s) => s.t === 'o' && (s.rungId === mcr.id || s.rungId === l.rungs[0]!.id))).toBe(false);
    expect(slotAccepts(l, { t: 'o', list: { owner: mcr.id, k: 'outputs' }, index: 1, rungId: mcr.id, x: 0, y: 0 }, { src: 'palette', g: 'o', k: 'OUT' })).toBe(false);
    expect(slotAccepts(l, { t: 'o', list: { owner: l.rungs[1]!.id, k: 'outputs' }, index: 1, rungId: l.rungs[1]!.id, x: 0, y: 0 }, { src: 'palette', g: 'o', k: 'MC' })).toBe(false);
    expect(slotAccepts(l, { t: 'r', index: 3, x: 0, y: 0, x0: 0, x1: 0 }, { src: 'palette', g: 'o', k: 'MCR' })).toBe(true);
    expect(code(l)).toEqual(['LD X0', 'MC N0', 'LD X1', 'OUT Y0', 'MCR N0', 'END']);
  });

  it('MC/MCR tek başına çoğaltılmaz; silinince bloğun öbür ucu da silinir; sürükleyince satır taşınır', () => {
    const src = 'LD X0\nMC N0\nLD X1\nOUT Y0\nMCR N0\nLD X2\nOUT Y1';
    const l = L(src);
    expect(apply(l, l.rungs[2]!.outputs[0]!.id, 'duplicate').refuse).toMatch(/eşleşmeli/);
    expect(apply(l, l.rungs[0]!.id, 'duplicate').refuse).toMatch(/eşleşmeli/);
    // MCR'yi en alta taşı: Y1 satırı da bloğa girer
    drop(l, { src: 'ladder', id: l.rungs[2]!.outputs[0]!.id, g: 'o' }, { t: 'r', index: 4, x: 0, y: 0, x0: 0, x1: 0 }, false);
    expect(code(l)).toEqual(['LD X0', 'MC N0', 'LD X1', 'OUT Y0', 'LD X2', 'OUT Y1', 'MCR N0', 'END']);
    // MC kutusunu sil: MCR de gider, içteki satırlar kalır
    apply(l, l.rungs[0]!.outputs[0]!.id, 'delete');
    expect(code(l)).toEqual(['LD X1', 'OUT Y0', 'LD X2', 'OUT Y1', 'END']);
    // MCR satırını sil: MC de gider
    const k = L(src);
    apply(k, k.rungs[2]!.id, 'delete');
    expect(code(k)).toEqual(['LD X1', 'OUT Y0', 'LD X2', 'OUT Y1', 'END']);
  });

  it('sahne: blok işareti MC\'den sonraki satırdan MCR satırına kadar, iç içe bloklar ayrı sütunda', () => {
    const l = L(KILAVUZ);
    const sc = layout(l);
    expect(sc.mcBlocks.map((b) => [b.level, b.from, b.to])).toEqual([
      ['N1', 3, 4],
      ['N0', 1, 5],
      ['N0', 7, 8],
    ]);
    expect(sc.mcBlocks[0]!.x).toBeGreaterThan(sc.mcBlocks[1]!.x);
    expect(sc.mcBlocks[1]!.pw).toBe(l.rungs[0]!.outputs[0]!.id + ':q');
    // girişsiz satırların teli satır barasına bağlı (MC kapalıyken enerjisiz)
    expect(sc.wires.some((w) => w.pw === l.rungs[4]!.id + ':rail')).toBe(true);
  });
});
