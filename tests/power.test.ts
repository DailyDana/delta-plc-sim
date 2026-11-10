// Canlı akım gösterimi doğru mu? Rastgele ladder ağaçları (karşılaştırma kontağı, INV, paralel, iç içe çıkış
// dalları dahil) IL'e çevrilip sanal makinede çalıştırılır. Her taramada ladder'da "enerjili" gösterilen
// her bobin, makinenin o çıkış komutuna giren akümülatör değeriyle (accIn) aynı olmalı.
import { describe, expect, it } from 'vitest';
import { CMP_OPS, Machine, ilToLadder, ladderToIl, mapProgramToLadder, parseIl, parseLadder, type Block, type Ladder, type OutBranch, type Series } from '../src/core';
import { computePower } from '../src/ui/ladder/power';

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

let id = 0;
function randomLadder(r: () => number): Ladder {
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
  const dev = () => pick(['X0', 'X1', 'X2', 'X3', 'M0', 'M1', 'M2', 'Y0', 'Y1']);
  const block = (depth: number): Block => {
    const x = r();
    if (depth < 2 && x < 0.2) return { t: 'p', id: 'p' + id++, branches: Array.from({ length: 2 + Math.floor(r() * 2) }, () => series(depth + 1)) };
    if (x < 0.32) return { t: 'c', id: 'c' + id++, kind: 'CMP', op: 'D0', op2: 'K' + Math.floor(r() * 4), cmp: pick(CMP_OPS) };
    if (x < 0.4) return { t: 'c', id: 'c' + id++, kind: 'INV', op: '' };
    return { t: 'c', id: 'c' + id++, kind: pick(['NO', 'NO', 'NC', 'P', 'F'] as const), op: dev() };
  };
  const series = (depth: number): Series => Array.from({ length: 1 + Math.floor(r() * 3) }, () => block(depth));
  const coil = () =>
    r() < 0.2
      ? { type: pick(['INCP', 'DECP']), op: 'D0', k: '' }
      : { type: pick(['OUT', 'OUT', 'SET', 'RST']), op: pick(['M0', 'M1', 'M2', 'Y0', 'Y1']), k: '' };
  const outs = (depth: number): OutBranch[] =>
    Array.from({ length: 1 + Math.floor(r() * 2) }, (): OutBranch => {
      const pre = r() < 0.5 ? [] : series(2);
      if (depth < 1 && r() < 0.25) return { id: 'o' + id++, pre: pre.length ? pre : series(2), children: outs(depth + 1) };
      return { id: 'o' + id++, pre, coil: coil() };
    });
  return { labels: {}, rungs: Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ id: 'r' + id++, comment: '', input: series(0), outputs: outs(0) })) };
}

describe('canlı akım = sanal makine', () => {
  it('400 rastgele ladder × 150 tarama: gösterilen bobin akımı accIn ile aynı', () => {
    let checked = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(seed);
      // Arayüzdeki gibi: ağaç bir kez IL'e yazılıp yeniden okunur (sadeleşir); bu kararlı biçim sabit kalmalı
      const il0 = ladderToIl(randomLadder(r));
      const il = ladderToIl(parseLadder(il0).ladder!);
      const { ladder } = parseLadder(il);
      expect(ladder, il).not.toBeNull();
      expect(ladderToIl(ladder!), `ladder ↔ IL kararlı değil
${il}`).toBe(il);
      const m = Machine.fromText(il).machine;
      expect(m, il).not.toBeNull();
      const refs = mapProgramToLadder(m!.program, ladder!);
      expect(refs, `eşleme kurulamadı\n${il}`).not.toBeNull();
      const instrOf = new Map<string, number>();
      refs!.forEach((rid, i) => rid && instrOf.set(rid, i));
      const coils: [string, number][] = [];
      const walk = (list: OutBranch[]) => list.forEach((o) => (o.coil ? coils.push([o.id, instrOf.get(o.id)!]) : walk(o.children ?? [])));
      ladder!.rungs.forEach((rg) => walk(rg.outputs));
      for (let k = 0; k < 150; k++) {
        for (const x of ['X0', 'X1', 'X2', 'X3']) if (r() < 0.2) m!.setInput(x, r() < 0.5);
        m!.scan(10);
        const pm = computePower(ladder!, (cid) => m!.closed[instrOf.get(cid)!] === 1);
        for (const [oid, i] of coils) {
          expect(pm.get(oid + ':q'), `tohum ${seed}, tarama ${k}, komut ${i}\n${il}`).toBe(m!.accIn[i] === 1);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(50000);
  }, 120000);
});

describe('IL\'den kurulan ağacın kaynak eşlemesi', () => {
  it('sadeleşen ağaçta bile her kontak ve bobin kendi komutuna bağlı: akım = accIn', () => {
    for (let seed = 1000; seed < 1300; seed++) {
      const r = rng(seed);
      const il = ladderToIl(randomLadder(r)); // sadeleşmemiş biçim (kullanıcının yazdığı IL gibi)
      const conv = ilToLadder(parseIl(il).program);
      const ladder = conv.ladder!;
      const m = Machine.fromText(il).machine!;
      const coils: [string, number][] = [];
      const walk = (list: OutBranch[]) => list.forEach((o) => (o.coil ? coils.push([o.id, conv.instrOf.get(o.id)!]) : walk(o.children ?? [])));
      ladder.rungs.forEach((rg) => walk(rg.outputs));
      for (const [, i] of coils) expect(i, il).toBeTypeOf('number');
      for (let k = 0; k < 100; k++) {
        for (const x of ['X0', 'X1', 'X2', 'X3']) if (r() < 0.2) m.setInput(x, r() < 0.5);
        m.scan(10);
        const pm = computePower(ladder, (cid) => m.closed[conv.instrOf.get(cid)!] === 1);
        for (const [oid, i] of coils) expect(pm.get(oid + ':q'), `tohum ${seed}, tarama ${k}\n${il}`).toBe(m.accIn[i] === 1);
      }
    }
  }, 120000);
});
