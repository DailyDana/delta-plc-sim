// Arayüzün kullandığı çekirdek yardımcıları: kaynak eşlemesi, kimlik koruyan kopya, çevrimiçi düzenleme.
import { describe, expect, it } from 'vitest';
import { EXAMPLES, Machine, cloneLadder, ladderToIl, ladderToIlMapped, mapProgramToLadder, parseIl, parseLadder } from '../src/core';

describe('ladder ↔ IL kaynak eşlemesi', () => {
  it('her örnekte kontak ve bobin satırları ladder öğelerine bağlanır', () => {
    for (const ex of EXAMPLES) {
      const { ladder } = parseLadder(ex.il);
      if (!ladder) continue;
      const m = ladderToIlMapped(ladder);
      expect(m.text).toBe(ladderToIl(ladder));
      const prog = parseIl(m.text).program;
      const refs = mapProgramToLadder(prog, ladder);
      expect(refs, ex.name).not.toBeNull();
      prog.instrs.forEach((it, i) => {
        if (it.def.cls === 'load' && it.ops[0]?.raw === 'M1000') return;
        if (['load', 'and', 'or', 'output'].includes(it.def.cls)) expect(refs![i], `${ex.name}: ${it.mn}`).toBeTruthy();
      });
    }
  });

  it('kullanıcı IL\'i aynı komutlarsa (çıplak sayı K yerine) eşleme yine kurulur', () => {
    const il = 'LD X0\nOR Y0\nANI X1\nOUT Y0\nLD X2\nTMR T0 50\nEND';
    const { ladder } = parseLadder(il);
    expect(mapProgramToLadder(parseIl(il).program, ladder!)).not.toBeNull();
  });

  it('farklı ama eşdeğer yazımda null döner', () => {
    const il = 'LD X0\nMPS\nOUT Y0\nMPP\nOUT Y1\nEND'; // ladder'dan MPS'siz üretilir
    const { ladder } = parseLadder(il);
    expect(mapProgramToLadder(parseIl(il).program, ladder!)).toBeNull();
  });

  it('cloneLadder kimlikleri korur, nesneleri paylaşmaz', () => {
    const { ladder } = parseLadder(EXAMPLES[3]!.il);
    const c = cloneLadder(ladder!);
    expect(ladderToIl(c)).toBe(ladderToIl(ladder!));
    expect(c.rungs[0]!.input[0]!.id).toBe(ladder!.rungs[0]!.input[0]!.id);
    expect(c.rungs[0]!.input).not.toBe(ladder!.rungs[0]!.input);
  });
});

describe('çevrimiçi düzenleme (adoptState)', () => {
  it('sayıcı değeri korunur, düzenleme sahte sayım üretmez', () => {
    const a = Machine.fromText('LD X0\nCNT C0 K5\nLD C0\nOUT Y0\nEND').machine!;
    a.setInput('X0', 1);
    a.scan(10);
    a.setInput('X0', 0);
    a.scan(10);
    a.setInput('X0', 1);
    a.scan(10); // 2 sayım, X0 basılı kaldı
    expect(a.value('C0')).toBe(2);
    const b = Machine.fromText('LD X0\nCNT C0 K5\nLD C0\nOUT Y1\nEND').machine!;
    b.adoptState(a);
    b.scan(10);
    b.scan(10);
    expect(b.value('C0')).toBe(2);
    b.setInput('X0', 0);
    b.scan(10);
    b.setInput('X0', 1);
    b.scan(10);
    expect(b.value('C0')).toBe(3);
  });

  it('zamanlayıcı birikimi ve zaman devralınır', () => {
    const a = Machine.fromText('LD X0\nTMR T0 K50\nEND').machine!;
    a.setInput('X0', 1);
    for (let i = 0; i < 30; i++) a.scan(100);
    const b = Machine.fromText('LD X0\nTMR T0 K60\nEND').machine!;
    b.adoptState(a);
    expect(b.value('T0')).toBe(a.value('T0'));
    b.scan(100);
    expect(b.value('T0')).toBe(31);
    expect(b.timeMs).toBe(3100);
  });

  it('LDP düzenleme anında basılı girişte tetiklenmez', () => {
    const a = Machine.fromText('LDP X0\nSET Y0\nEND').machine!;
    a.setInput('X0', 1);
    a.scan(10);
    const b = Machine.fromText('LDP X0\nSET Y1\nEND').machine!;
    b.adoptState(a);
    b.scan(10);
    expect(b.bit('Y1')).toBe(0);
  });
});
