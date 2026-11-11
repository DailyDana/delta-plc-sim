// Kaskad çıkış: "OUT A / AND b / OUT C / OUT D" kalıbında b bir kez okunur ve sonraki bütün çıkışlar
// aynı sonucu paylaşır. Ladder'a çevirip geri yazmak bu davranışı değiştirmemeli.
import { describe, expect, it } from 'vitest';
import { Machine, ilToLadder, ladderToIl, parseIl, parseLadder, type OutBranch } from '../src/core/index';
import { computePower } from '../src/ui/ladder/power';

const roundTrip = (il: string): string => {
  const r = parseLadder(il);
  expect(r.ladder, il + '\n' + JSON.stringify(r.diagnostics)).not.toBeNull();
  return ladderToIl(r.ladder!);
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const WATCH = ['Y0', 'Y1', 'Y2', 'Y3', 'M0', 'M1', 'M2', 'M3', 'C0', 'T0'];

/** İki program aynı giriş dizisinde her taramada aynı bit durumlarını vermeli */
function sameTrace(a: string, b: string, seed: number, scans = 60): void {
  const ma = Machine.fromText(a).machine!;
  const mb = Machine.fromText(b).machine!;
  ma.reset();
  mb.reset();
  const r = rng(seed);
  for (let k = 0; k < scans; k++) {
    for (const x of ['X0', 'X1', 'X2']) {
      const v = r() < 0.5 ? 1 : 0;
      ma.setInput(x, v);
      mb.setInput(x, v);
    }
    ma.scan(10);
    mb.scan(10);
    for (const d of WATCH) expect(mb.bit(d), `${d} @ tarama ${k}\n--- özgün\n${a}\n--- geri yazılan\n${b}`).toBe(ma.bit(d));
  }
}

/** Yazıldığı gibi IL'den kurulan ağaçta gösterilen bobin akımı, makinenin o komuta giren akımıyla aynı olmalı */
function powerMatches(il: string, seed: number, scans = 40): void {
  const conv = ilToLadder(parseIl(il).program);
  const ladder = conv.ladder!;
  const m = Machine.fromText(il).machine!;
  m.reset();
  const coils: [string, number][] = [];
  const walk = (list: OutBranch[]) => list.forEach((o) => (o.coil ? coils.push([o.id, conv.instrOf.get(o.id)!]) : walk(o.children ?? [])));
  ladder.rungs.forEach((rg) => walk(rg.outputs));
  for (const [, i] of coils) expect(i, il).toBeTypeOf('number');
  const r = rng(seed);
  for (let k = 0; k < scans; k++) {
    for (const x of ['X0', 'X1', 'X2']) m.setInput(x, r() < 0.5 ? 1 : 0);
    m.scan(10);
    const pm = computePower(ladder, (cid) => m.closed[conv.instrOf.get(cid)!] === 1);
    for (const [oid, i] of coils) expect(pm.get(oid + ':q'), `akım, komut ${i} @ tarama ${k}\n${il}`).toBe(m.accIn[i] === 1);
  }
}

describe('kaskad çıkış gidiş-dönüşü davranışı korur', () => {
  it('bobinini kendi okuyan kontak: M0 ile Y0 hep aynı kalır', () => {
    const src = 'LD X0\nOUT Y1\nANI M0\nOUT M0\nOUT Y0\nEND';
    sameTrace(src, roundTrip(src), 1);
  });

  it('kaskad içinde kenar kontağı tek kez sayılır', () => {
    const src = 'LD X0\nOUT Y1\nANDP X1\nOUT Y2\nCNT C0 K3\nEND';
    sameTrace(src, roundTrip(src), 2);
  });

  it('MPS dalının içinde kaskad', () => {
    const src = 'LD X0\nMPS\nANI M1\nOUT M1\nOUT Y0\nAND X1\nOUT Y2\nMPP\nOUT Y3\nEND';
    sameTrace(src, roundTrip(src), 3);
  });

  it('300 rastgele kaskad/MPS programı: geri yazılan IL aynı izi verir ve gidiş-dönüş kararlıdır', () => {
    const r = rng(20261111);
    const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
    const bits = ['X0', 'X1', 'X2', 'M0', 'M1', 'M2', 'M3', 'Y0', 'Y1'];
    const coils = ['Y0', 'Y1', 'Y2', 'Y3', 'M0', 'M1', 'M2', 'M3'];
    const contact = () => pick(['AND', 'ANI', 'AND', 'ANI', 'ANDP']) + ' ' + pick(bits);
    const output = () => {
      const t = r();
      if (t < 0.7) return 'OUT ' + pick(coils);
      if (t < 0.8) return 'SET ' + pick(coils);
      if (t < 0.9) return 'RST ' + pick(coils);
      return 'CNT C0 K3';
    };
    // Bir çıkış bölümü: çıkışlar, aralarında isteğe bağlı kontaklar (kaskad), isteğe bağlı iç içe MPS
    const section = (depth: number): string[] => {
      const out: string[] = [];
      const n = 1 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        if (r() < 0.5) out.push(contact());
        if (depth < 2 && r() < 0.2) {
          const k = 2 + Math.floor(r() * 2);
          for (let j = 0; j < k; j++) {
            out.push(j === 0 ? 'MPS' : j === k - 1 ? 'MPP' : 'MRD');
            out.push(...section(depth + 1));
          }
          return out; // MPP'den sonra aynı düzeyde devam edilmez
        }
        out.push(output());
      }
      return out;
    };
    for (let n = 0; n < 300; n++) {
      const lines: string[] = [];
      const rungs = 1 + Math.floor(r() * 3);
      for (let k = 0; k < rungs; k++) {
        lines.push((r() < 0.3 ? 'LDI ' : 'LD ') + pick(bits));
        if (r() < 0.3) lines.push(contact());
        lines.push(...section(0));
      }
      lines.push('END');
      const src = lines.join('\n');
      const once = roundTrip(src);
      sameTrace(src, once, n + 10);
      powerMatches(src, n + 500);
      powerMatches(once, n + 900);
      expect(roundTrip(once), src).toBe(once);
    }
  });
});
