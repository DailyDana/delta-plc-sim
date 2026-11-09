import { describe, expect, it } from 'vitest';
import { EXAMPLES, Machine, PROFILES, timerRange } from '../src/core/index';

function machine(il: string, profile = 'ES2'): Machine {
  const r = Machine.fromText(il, { profile });
  expect(r.machine, JSON.stringify(r.diagnostics)).not.toBeNull();
  r.machine!.reset();
  return r.machine!;
}
const run = (m: Machine, ms: number, set: Record<string, number> = {}, dt = 10): void => {
  for (const [k, v] of Object.entries(set)) m.setInput(k, v);
  for (let t = 0; t < ms; t += dt) m.scan(dt);
};
const ex = (start: string): string => EXAMPLES.find((e) => e.name.startsWith(start))!.il;

describe('sanal makine: örnek devreler (ES2)', () => {
  it('mühürleme', () => {
    const m = machine(ex('Mühürleme'));
    run(m, 50);
    expect(m.bit('Y0')).toBe(0);
    run(m, 50, { X0: 1 });
    run(m, 50, { X0: 0 });
    expect(m.bit('Y0')).toBe(1);
    run(m, 50, { X1: 1 });
    expect(m.bit('Y0')).toBe(0);
  });
  it('yıldız-üçgen (MPS) 5 s', () => {
    const m = machine(ex('Yıldız'));
    run(m, 50, { X0: 1 });
    run(m, 50, { X0: 0 });
    expect([m.bit('Y0'), m.bit('Y1'), m.bit('Y2')]).toEqual([1, 1, 0]);
    run(m, 5000);
    expect([m.bit('Y0'), m.bit('Y1'), m.bit('Y2')]).toEqual([1, 0, 1]);
  });
  it('trafik lambası döngüsü', () => {
    const m = machine(ex('Trafik'));
    run(m, 1000);
    expect(m.bit('Y0')).toBe(1);
    run(m, 5000);
    expect(m.bit('Y1')).toBe(1);
    run(m, 3000);
    expect(m.bit('Y2')).toBe(1);
    run(m, 4000);
    expect([m.bit('Y0'), m.bit('Y2')]).toEqual([1, 0]);
  });
  it('sayıcı ayar değerinde durur (16 bit)', () => {
    const m = machine(ex('Sayıcı'));
    for (let i = 0; i < 7; i++) {
      run(m, 20, { X0: 1 });
      run(m, 20, { X0: 0 });
    }
    expect(m.value('C0')).toBe(5);
    expect(m.bit('Y0')).toBe(1);
    run(m, 20, { X1: 1 });
    expect([m.value('C0'), m.bit('C0')]).toEqual([0, 0]);
  });
  it('PLS ile aç/kapa', () => {
    const m = machine(ex('Tek buton'));
    run(m, 30, { X0: 1 });
    run(m, 30, { X0: 0 });
    expect(m.bit('Y0')).toBe(1);
    run(m, 30, { X0: 1 });
    run(m, 30, { X0: 0 });
    expect(m.bit('Y0')).toBe(0);
  });
  it('M1013 1 s saat: 0,5 s açık / 0,5 s kapalı', () => {
    const m = machine(ex('Flaşör'));
    m.setInput('X0', 1);
    const seen: number[] = [];
    for (let t = 0; t < 2000; t += 10) {
      m.scan(10);
      seen.push(m.bit('Y0'));
    }
    const ons = seen.filter(Boolean).length;
    expect(ons).toBeGreaterThan(90);
    expect(ons).toBeLessThan(110);
  });
});

describe('sanal makine: Delta kılavuzundaki davranışlar', () => {
  it('ES2 zamanlayıcı tabanları kılavuzdaki gibi', () => {
    const p = PROFILES.ES2!;
    expect(timerRange(p, 0)?.baseMs).toBe(100);
    expect(timerRange(p, 127)?.baseMs).toBe(1);
    expect(timerRange(p, 200)?.baseMs).toBe(10);
    expect(timerRange(p, 240)).toMatchObject({ baseMs: 10, accumulative: true });
    expect(timerRange(p, 246)).toMatchObject({ baseMs: 1, accumulative: true });
    expect(timerRange(p, 250)).toMatchObject({ baseMs: 100, accumulative: true });
  });
  it('genel zamanlayıcı: akım kesilince sıfırlanır', () => {
    const m = machine('LD X0\nTMR T0 K50');
    run(m, 3000, { X0: 1 });
    expect(m.value('T0')).toBe(30);
    run(m, 10, { X0: 0 });
    expect(m.value('T0')).toBe(0);
  });
  it('birikimli zamanlayıcı (T250): akım kesilince değeri korur, kaldığı yerden devam eder', () => {
    const m = machine('LD X0\nTMR T250 K50\nLD T250\nOUT Y0\nLD X1\nRST T250');
    run(m, 3000, { X0: 1 });
    run(m, 1000, { X0: 0 });
    expect(m.value('T250')).toBe(30);
    run(m, 2000, { X0: 1 });
    expect([m.value('T250'), m.bit('Y0')]).toEqual([50, 1]);
    // RST, Y0 satırından sonra çalışır: aynı taramada Y0 hâlâ 1, bir sonraki taramada 0
    run(m, 10, { X0: 0, X1: 1 });
    expect(m.value('T250')).toBe(0);
    run(m, 10);
    expect([m.value('T250'), m.bit('Y0')]).toEqual([0, 0]);
  });
  it('T127 (ES2) 1 ms zamanlayıcı', () => {
    const m = machine('LD X0\nTMR T127 K500\nLD T127\nOUT Y0');
    run(m, 490, { X0: 1 }, 1);
    expect(m.bit('Y0')).toBe(0);
    run(m, 20, {}, 1);
    expect(m.bit('Y0')).toBe(1);
  });
  it('STOP→RUN: kalıcı bölge korunur, genel bölge silinir; güç açılışında hepsi silinir', () => {
    const m = machine('LD X0\nSET M0\nSET M600\nCNT C0 K5\nCNT C120 K5');
    run(m, 20, { X0: 1 });
    expect([m.bit('M0'), m.bit('M600'), m.value('C0'), m.value('C120')]).toEqual([1, 1, 1, 1]);
    m.reset('run');
    expect([m.bit('M0'), m.bit('M600'), m.value('C0'), m.value('C120')]).toEqual([0, 1, 0, 1]);
    m.reset('power');
    expect([m.bit('M600'), m.value('C120')]).toEqual([0, 0]);
  });
  it('LDP: RUN başında zaten ON olan giriş ilk taramada kenar sayılır (ES2), v1\'de sayılmaz', () => {
    const il = 'LDP X0\nSET Y0';
    const es2 = machine(il, 'ES2');
    es2.setInput('X0', 1);
    es2.scan(10);
    expect(es2.bit('Y0')).toBe(1);
    const v1 = machine(il, 'v1');
    v1.setInput('X0', 1);
    v1.scan(10);
    expect(v1.bit('Y0')).toBe(0);
  });
  it('CNT K0 = K1 (EH3)', () => {
    const m = machine('LD X0\nCNT C0 K0\nLD C0\nOUT Y0', 'EH3');
    run(m, 10);
    expect(m.bit('Y0')).toBe(0);
    run(m, 20, { X0: 1 });
    expect(m.bit('Y0')).toBe(1);
  });
  it('akım izi: accIn/accOut/closed komut başına', () => {
    const m = machine('LD X0\nAND X1\nOUT Y0');
    m.setInput('X0', 1);
    m.scan(10);
    expect(Array.from(m.closed)).toEqual([1, 0, 0]);
    expect(Array.from(m.accOut)).toEqual([1, 0, 0]);
  });
  it('yapısı bozuk program çalıştırılmaz', () => {
    const r = Machine.fromText('LD X0\nLD X1\nOUT Y0');
    expect(r.machine).toBeNull();
    expect(r.diagnostics.map((d) => d.code)).toContain('E_OPEN_BLOCK');
  });
  it('snapshot biçimi', () => {
    const m = machine(ex('Yıldız'));
    run(m, 50, { X0: 1 });
    expect(m.snapshot()).toMatchObject({ X0: 1, Y0: 1, Y1: 1, M0: 1, T0: '0/50' });
  });
});
