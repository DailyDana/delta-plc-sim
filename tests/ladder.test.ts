import { describe, expect, it } from 'vitest';
import { EXAMPLES, Machine, drawLadderText, ilToLadder, ladderToIl, parseIl, parseLadder } from '../src/core/index';
import { V1 } from './v1';

const roundTrip = (il: string): string => {
  const r = parseLadder(il);
  expect(r.ladder, JSON.stringify(r.diagnostics)).not.toBeNull();
  return ladderToIl(r.ladder!);
};

/** İki IL aynı girişlerle aynı çıkışları üretmeli (anlamsal eşdeğerlik) */
function sameBehaviour(a: string, b: string, inputs = ['X0', 'X1', 'X2', 'X3', 'X4']): void {
  const ma = Machine.fromText(a).machine!;
  const mb = Machine.fromText(b).machine!;
  ma.reset();
  mb.reset();
  for (let k = 0; k < 64; k++) {
    inputs.forEach((x, j) => {
      ma.setInput(x, (k >> j) & 1);
      mb.setInput(x, (k >> j) & 1);
    });
    ma.scan(10);
    mb.scan(10);
    for (const y of ma.usedDevices().Y) expect(mb.bit(y), `${y} @ ${k}`).toBe(ma.bit(y));
  }
}

describe('ladder ↔ IL', () => {
  for (const ex of EXAMPLES) {
    it(`örnek gidiş-dönüş v1 ile aynı metin: ${ex.name}`, () => {
      const v1 = V1.toIL(V1.parseIL(ex.il).prog);
      expect(roundTrip(ex.il)).toBe(v1);
      expect(roundTrip(roundTrip(ex.il))).toBe(v1);
    });
  }

  it('iç içe MPS ağaca çevrilir, IL\'e geri yazılır, davranış aynı kalır', () => {
    const il = ['LD X0', 'MPS', 'AND X1', 'MPS', 'AND X2', 'OUT Y0', 'MPP', 'AND X3', 'OUT Y1', 'MPP', 'AND X4', 'OUT Y2'].join('\n');
    const r = parseLadder(il);
    expect(r.ladder).not.toBeNull();
    const outs = r.ladder!.rungs[0]!.outputs;
    expect(outs).toHaveLength(2);
    expect(outs[0]!.children).toHaveLength(2); // X1 → { X2 → Y0, X3 → Y1 }
    expect(outs[1]!.coil?.op).toBe('Y2');
    const back = ladderToIl(r.ladder!);
    expect(back).toContain('MPS\nAND X1\nMPS\nAND X2\nOUT Y0\nMPP\nAND X3\nOUT Y1\nMPP\nAND X4\nOUT Y2');
    sameBehaviour(il, back);
    expect(drawLadderText(r.ladder!)).toContain('( Y1 )');
  });

  it('çıkıştan sonra ortak kontak (MPS öncesi AND) korunur', () => {
    const il = 'LD X0\nOUT Y0\nAND X1\nMPS\nAND X2\nOUT Y1\nMPP\nOUT Y2';
    sameBehaviour(il, roundTrip(il));
  });

  it('çıkıştan sonra OR: ladder\'a çevrilmez ama program çalışır', () => {
    const il = 'LD X0\nOUT Y0\nOR X1\nOUT Y1';
    const r = ilToLadder(parseIl(il).program);
    expect(r.ladder).toBeNull();
    expect(r.diagnostics.map((d) => d.code)).toContain('L_OR_AFTER_OUTPUT');
    const m = Machine.fromText(il).machine!;
    m.reset();
    m.setInput('X1', 1);
    m.scan(10);
    expect([m.bit('Y0'), m.bit('Y1')]).toEqual([0, 1]);
  });

  it('metin çizimi: mühürleme', () => {
    const t = drawLadderText(parseLadder(EXAMPLES[1]!.il).ladder!);
    expect(t).toContain('├┬──┤ X0 ├──┬──┤/X1 ├');
    expect(t).toContain('│└──┤ Y0 ├──┘');
    expect(t).toContain('( Y0 )');
    expect(t).toContain('Etiketler: X0 = start');
  });
});
