// Zaman diyagramı izi: simulate dönüştürücüsü, kayıt tamponu (halka), kenara yapışma, Δt biçimi, ayrışma aralıkları.
import { describe, expect, it } from 'vitest';
import {
  Machine,
  TraceRecorder,
  diffRanges,
  edgeTimes,
  formatMs,
  isWordKey,
  machineReader,
  niceTickStep,
  parseEvents,
  parseTraceKey,
  recordableKeys,
  simulate,
  snapToEdge,
  traceDiff,
  traceFromChanges,
  traceFromSim,
  valueAt,
  type Trace,
} from '../src/core';

const TIMER = 'LD X0\nOR M0\nOUT M0\nLD M0\nTMR T0 K20\nLD T0\nOUT Y0\nEND';

/** Arayüz motorunun yaptığını taklit et: X taramadan önce, diğerleri taramadan sonra örneklenir */
function record(il: string, events: string, duration: number): Trace {
  const m = Machine.fromText(il).machine!;
  const keys = recordableKeys(m);
  const rd = keys.map((k) => [k, machineReader(m, k)!] as const);
  const rec = new TraceRecorder();
  m.reset('run');
  rec.begin(0, Object.fromEntries(rd.map(([k, f]) => [k, k[0] === 'X' ? 0 : f()])));
  const ev = parseEvents(events);
  let ei = 0;
  while (m.timeMs < duration) {
    while (ei < ev.length && ev[ei]!.t <= m.timeMs) m.setInput(ev[ei]!.dev, ev[ei++]!.v);
    for (const [k, f] of rd) if (k[0] === 'X') rec.set(k, m.timeMs, f());
    m.scan(10);
    for (const [k, f] of rd) if (k[0] !== 'X') rec.set(k, m.timeMs, f());
    rec.advance(m.timeMs);
  }
  return rec.snapshot();
}

describe('anahtarlar', () => {
  it('kelime anahtarları ve kullanıcı yazımı', () => {
    expect(isWordKey('D0')).toBe(true);
    expect(isWordKey('T0.v')).toBe(true);
    expect(isWordKey('T0')).toBe(false);
    expect(parseTraceKey(' t0.v ')).toBe('T0.v');
    expect(parseTraceKey('x10')).toBe('X10');
    expect(parseTraceKey('X8')).toBeNull();
    expect(parseTraceKey('Y0.v')).toBeNull();
    expect(parseTraceKey('m1013')).toBe('M1013');
  });
});

describe('simulate → iz', () => {
  it('traceFromSim değişimleri sinyallere ayırır, başlangıç 0', () => {
    const res = simulate(TIMER, { duration: 3000, events: parseEvents('0:X0=1 100:X0=0') });
    const tr = traceFromSim(res, 3000, ['X0', 'Y0', 'X7']);
    expect(tr.start).toBe(0);
    expect(tr.end).toBe(3000);
    expect(tr.signals.X0).toEqual({ init: 0, t: [0, 100], v: [1, 0] });
    expect(tr.signals.Y0!.t).toEqual([2000]);
    expect(tr.signals.X7).toEqual({ init: 0, t: [], v: [] });
    expect(valueAt(tr.signals.Y0, 1999)).toBe(0);
    expect(valueAt(tr.signals.Y0, 2000)).toBe(1);
  });

  it('aynı anlı ve değer değiştirmeyen kayıtlar ayıklanır', () => {
    const tr = traceFromChanges(
      [
        { t: 0, dev: 'Y0', v: 1 },
        { t: 10, dev: 'Y0', v: 0 },
        { t: 10, dev: 'Y0', v: 1 },
        { t: 20, dev: 'Y0', v: 1 },
      ],
      50,
    );
    expect(tr.signals.Y0).toEqual({ init: 0, t: [0], v: [1] });
  });

  it('canlı kayıt (motor sırası) simulate ile aynı kenarları verir', () => {
    const live = record(TIMER, '0:X0=1 100:X0=0', 3000);
    const sim = traceFromSim(simulate(TIMER, { duration: 3000, events: parseEvents('0:X0=1 100:X0=0') }), 3000);
    for (const k of ['X0', 'M0', 'T0', 'Y0']) expect(live.signals[k]!.t, k).toEqual(sim.signals[k]!.t);
    // zamanlayıcı değeri kelime izi olarak artar
    expect(valueAt(live.signals['T0.v'], 1000)).toBe(10);
    expect(traceDiff(live, sim, ['X0', 'M0', 'T0', 'Y0'])).toEqual({});
  });
});

describe('kayıt tamponu', () => {
  it('kapasite aşılınca en eski kısım düşer, init son düşen değere geçer', () => {
    const rec = new TraceRecorder(8);
    rec.begin(0, { M0: 0 });
    for (let i = 1; i <= 20; i++) {
      rec.set('M0', i * 10, i % 2);
      rec.advance(i * 10);
    }
    const tr = rec.trace();
    expect(rec.size).toBeLessThanOrEqual(8);
    expect(tr.start).toBeGreaterThan(0);
    expect(tr.end).toBe(200);
    const s = tr.signals.M0!;
    // kalan kısımda her an doğru değer
    for (let t = tr.start; t <= 200; t += 5) expect(valueAt(s, t)).toBe(Math.floor(t / 10) % 2);
    expect(s.t[s.t.length - 1]).toBe(200);
  });

  it('süre sınırı aşılınca baş kırpılır', () => {
    const rec = new TraceRecorder(1000, 1000);
    rec.begin(0, { Y0: 0 });
    rec.set('Y0', 100, 1);
    rec.advance(5000);
    const tr = rec.trace();
    expect(tr.end - tr.start).toBeLessThanOrEqual(1000);
    expect(tr.signals.Y0!.init).toBe(1);
    expect(tr.signals.Y0!.t).toEqual([]);
  });

  it('kayıt yokken (clear) set yok sayılır; sonradan eklenen cihazın öncesi bilinmez', () => {
    const rec = new TraceRecorder();
    rec.set('Y0', 10, 1);
    expect(rec.trace().signals.Y0).toBeUndefined();
    rec.begin(0);
    rec.advance(500);
    rec.set('M5', 500, 1);
    expect(rec.trace().signals.M5).toMatchObject({ init: 1, from: 500 });
    rec.clear();
    expect(rec.active).toBe(false);
    expect(Object.keys(rec.trace().signals)).toEqual([]);
  });

  it('aynı anda geri dönen değişim kayıt bırakmaz; snapshot bağımsız kopyadır', () => {
    const rec = new TraceRecorder();
    rec.begin(0, { X0: 0 });
    rec.set('X0', 10, 1);
    rec.set('X0', 10, 0);
    expect(rec.trace().signals.X0!.t).toEqual([]);
    rec.set('X0', 20, 1);
    const snap = rec.snapshot();
    rec.set('X0', 30, 0);
    expect(snap.signals.X0!.t).toEqual([20]);
  });
});

describe('ölçüm', () => {
  const tr = traceFromChanges(
    [
      { t: 0, dev: 'X0', v: 1 },
      { t: 100, dev: 'X0', v: 0 },
      { t: 2000, dev: 'Y0', v: 1 },
      { t: 2050, dev: 'M0', v: 1 },
    ],
    3000,
    ['X0', 'Y0', 'M0'],
  );

  it('en yakın kenara yapışır, tolerans dışında yapışmaz', () => {
    expect(snapToEdge(tr, ['X0', 'Y0', 'M0'], 2030, 40)).toEqual({ t: 2050, snapped: true, key: 'M0' });
    expect(snapToEdge(tr, ['X0', 'Y0', 'M0'], 2030, 40, 'Y0')).toEqual({ t: 2000, snapped: true, key: 'Y0' });
    expect(snapToEdge(tr, ['X0', 'Y0', 'M0'], 1500, 40)).toEqual({ t: 1500, snapped: false });
    expect(edgeTimes(tr.signals.X0, 50, 3000)).toEqual([100]);
  });

  it('Δt biçimi ve eksen adımı', () => {
    expect(formatMs(2000 - 100)).toBe('1,9 s');
    expect(formatMs(5000)).toBe('5 s');
    expect(formatMs(5010)).toBe('5,01 s');
    expect(formatMs(120)).toBe('120 ms');
    expect(formatMs(-500)).toBe('−500 ms');
    expect(niceTickStep(10000 / 800)).toBe(1000); // 10 s / 800 px → 1 s işaret
    expect(niceTickStep(1)).toBe(100);
  });

  it('iki izin ayrıştığı aralıklar', () => {
    const a = tr.signals.Y0;
    const b = { init: 0, t: [1500, 2500], v: [1, 0] };
    expect(diffRanges(a, b, 0, 3000)).toEqual([
      [1500, 2000],
      [2500, 3000],
    ]);
    expect(diffRanges(a, a, 0, 3000)).toEqual([]);
    expect(diffRanges(undefined, b, 0, 3000)).toEqual([[1500, 2500]]);
  });
});
