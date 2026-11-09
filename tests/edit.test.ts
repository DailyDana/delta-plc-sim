// Arayüzün ladder düzenleme işlemleri (saf fonksiyonlar): sonuç IL'i ve ağaç geçerliliği.
import { describe, expect, it } from 'vitest';
import { EXAMPLES, Machine, cloneLadder, ladderToIl, parseLadder, type Ladder } from '../src/core';
import { apply, drop, insertPart, locate, pasteClip, takeClip, tidy } from '../src/ui/state/edit';
import { applyQuick, parseQuick } from '../src/ui/ladder/quick';
import { layout } from '../src/ui/ladder/layout';
import { computePower } from '../src/ui/ladder/power';

const L = (il: string): Ladder => parseLadder(il).ladder!;
const firstContact = (l: Ladder) => l.rungs[0]!.input[0]!;

/** Ağaçtan üretilen IL yeniden ayrıştırılınca aynı IL'i vermeli (geçerli ağaç) */
function roundTrips(l: Ladder): void {
  const il = ladderToIl(l);
  const back = parseLadder(il);
  expect(back.ladder, il).not.toBeNull();
  expect(ladderToIl(back.ladder!)).toBe(il);
  expect(Machine.fromText(il).machine, il).not.toBeNull();
}

describe('düzenleme işlemleri', () => {
  it('sağa seri, paralel, hatta paralel, sil', () => {
    const l = L('LD X0\nOUT Y0\nEND');
    const c0 = firstContact(l).id;
    let r = apply(l, c0, 'addRight');
    expect(ladderToIl(l)).toMatch(/LD X0\nAND X0\nOUT Y0/);
    r = apply(l, r.sel, 'parContact');
    expect(ladderToIl(l)).toMatch(/LD X0\nLD X0\nOR X0\nANB\nOUT Y0/);
    apply(l, c0, 'parSeries');
    roundTrips(l);
    apply(l, r.sel, 'delete');
    roundTrips(l);
  });

  it('satırın tek çıkışı silinemez; satır taşınır ve silinir', () => {
    const l = L('LD X0\nOUT Y0\nLD X1\nOUT Y1\nEND');
    const out = l.rungs[0]!.outputs[0]!.id;
    expect(apply(l, out, 'delete').refuse).toBeTruthy();
    apply(l, l.rungs[0]!.id, 'rungDown');
    expect(ladderToIl(l).indexOf('X1')).toBeLessThan(ladderToIl(l).indexOf('X0'));
    apply(l, l.rungs[0]!.id, 'delete');
    expect(l.rungs).toHaveLength(1);
  });

  it('çıkış dalına kontak MPS üretir; iç içe dallar korunur', () => {
    const l = L('LD X0\nOUT Y0\nEND');
    const o = l.rungs[0]!.outputs[0]!.id;
    const r = apply(l, o, 'addOutput');
    apply(l, r.sel, 'addBranchContact');
    expect(ladderToIl(l)).toMatch(/MPS\nOUT Y0\nMPP\nAND X0\nOUT Y1/);
    roundTrips(l);
    const nested = L('LD X0\nMPS\nAND X1\nMPS\nOUT Y0\nMPP\nAND X2\nOUT Y1\nMPP\nOUT Y2\nEND');
    const c = cloneLadder(nested);
    const y1 = layout(c).coils.find((x) => x.coil.op === 'Y1')!.id;
    apply(c, y1, 'addOutput');
    roundTrips(c);
  });

  it('tidy: boş dal ve tek dallı paralel temizlenir', () => {
    const l = L('LD X0\nOR X1\nOUT Y0\nEND');
    const par = l.rungs[0]!.input[0]!;
    expect(par.t).toBe('p');
    if (par.t === 'p') par.branches[1] = [];
    tidy(l);
    expect(ladderToIl(l)).toMatch(/LD X0\nOUT Y0/);
  });

  it('bütün örneklerde her öğe silinip çoğaltılabilir, ağaç geçerli kalır', () => {
    for (const ex of EXAMPLES) {
      const base = L(ex.il);
      for (const it of layout(base).order) {
        for (const act of ['delete', 'duplicate', 'addRight'] as const) {
          const l = cloneLadder(base);
          apply(l, it.id, act);
          roundTrips(l);
        }
      }
    }
  });
});

describe('sürükle-bırak', () => {
  it('panodan kontak ve çıkış bırakma, taşıma, kopyalama', () => {
    const l = L('LD X0\nOUT Y0\nEND');
    const sc = layout(l);
    const end = sc.slots.find((s) => s.t === 'c' && s.index === 1)!;
    drop(l, { src: 'palette', g: 'c', k: 'NC' }, end, false);
    expect(ladderToIl(l)).toMatch(/LD X0\nANI X0\nOUT Y0/);
    const sc2 = layout(l);
    const outSlot = sc2.slots.find((s) => s.t === 'o')!;
    drop(l, { src: 'palette', g: 'o', k: 'TMR' }, outSlot, false);
    expect(ladderToIl(l)).toMatch(/TMR T0 K50/);
    const sc3 = layout(l);
    const newRungSlot = sc3.slots.filter((s) => s.t === 'r').pop()!;
    const c0 = firstContact(l).id;
    drop(l, { src: 'ladder', id: c0, g: 'c' }, newRungSlot, true); // kopya
    expect(l.rungs).toHaveLength(2);
    expect(locate(l, c0)).not.toBeNull();
    const sc4 = layout(l);
    drop(l, { src: 'ladder', id: c0, g: 'c' }, sc4.slots.filter((s) => s.t === 'r').pop()!, false); // taşı
    expect(locate(l, c0)).toBeNull();
    roundTrips(l);
  });

  it('tıklamayla ekleme seçilinin yanına koyar', () => {
    const l = L('LD X0\nOUT Y0\nEND');
    const r = insertPart(l, firstContact(l).id, { src: 'palette', g: 'c', k: 'P' });
    expect(ladderToIl(l)).toMatch(/LD X0\nANDP X0/);
    insertPart(l, r.sel, { src: 'palette', g: 'o', k: 'CNT' });
    expect(ladderToIl(l)).toMatch(/CNT C0 K5/);
  });
});

describe('hızlı ekleme ve pano', () => {
  it('komut ayrıştırma', () => {
    expect(parseQuick('x1')).toEqual({ t: 'contact', kind: 'NO', op: 'X1', par: false });
    expect(parseQuick('/X2')).toMatchObject({ kind: 'NC', op: 'X2' });
    expect(parseQuick('|x3')).toMatchObject({ par: true, op: 'X3' });
    expect(parseQuick('ORI M1')).toMatchObject({ kind: 'NC', par: true });
    expect(parseQuick('P X4')).toMatchObject({ kind: 'P' });
    expect(parseQuick('tmr t1 k20')).toEqual({ t: 'coil', type: 'TMR', op: 'T1', k: '20' });
    expect(parseQuick('CNT C0 5')).toMatchObject({ k: '5' });
    expect(typeof parseQuick('X8')).toBe('string');
    expect(typeof parseQuick('TMR T0')).toBe('string');
    expect(typeof parseQuick('merhaba')).toBe('string');
  });

  it('hızlı ekleme uygulanır', () => {
    const l = L('LD X0\nOUT Y0\nEND');
    const q = parseQuick('|X5');
    if (typeof q === 'string') throw new Error(q);
    applyQuick(l, firstContact(l).id, q);
    expect(ladderToIl(l)).toMatch(/LD X0\nOR X5\nOUT Y0/);
    const q2 = parseQuick('SET M3');
    if (typeof q2 === 'string') throw new Error(q2);
    applyQuick(l, l.rungs[0]!.outputs[0]!.id, q2);
    expect(ladderToIl(l)).toMatch(/OUT Y0\nSET M3/);
  });

  it('kopyala-yapıştır yeni kimliklerle çoğaltır', () => {
    const l = L(EXAMPLES[3]!.il);
    const c = takeClip(l, l.rungs[1]!.id)!;
    const r = pasteClip(l, l.rungs[1]!.id, c);
    expect(l.rungs).toHaveLength(3);
    expect(r.sel).not.toBe(l.rungs[1]!.id);
    roundTrips(l);
  });
});

describe('canlı akım', () => {
  it('mühürleme: X0 bırakıldıktan sonra Y0 kendi kontağıyla enerjili', () => {
    const l = L('LD X0\nOR Y0\nANI X1\nOUT Y0\nEND');
    const on = new Set(['Y0', 'X1-NC']);
    const pm = computePower(l, (id) => {
      const loc = locate(l, id);
      if (loc?.kind !== 'contact') return false;
      return loc.node.kind === 'NC' ? on.has(loc.node.op + '-NC') : on.has(loc.node.op);
    });
    expect(pm.get(l.rungs[0]!.outputs[0]!.id + ':q')).toBe(true);
    const x0 = (l.rungs[0]!.input[0]! as { branches: { id: string }[][] }).branches[0]![0]!.id;
    expect(pm.get(x0 + ':closed')).toBe(false);
  });
});
