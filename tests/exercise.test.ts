import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXERCISES, checkExercise, checkIl, getExercise, getProfile, type Exercise } from '../src/core/index';
import { main } from '../src/cli/plc';

/** 'LD X0|OUT Y0' → çok satırlı IL + END */
const p = (s: string): string => s.split('|').map((x) => x.trim()).join('\n') + '\nEND';

interface Cases {
  /** Referanstan farklı kurulmuş doğru çözümler */
  good: string[];
  /** Tipik yanlış çözümler: ilk kalan senaryonun iletisi `msg` ile eşleşmeli */
  bad: { why: string; il: string; msg: RegExp }[];
}

const CASES: Record<string, Cases> = {
  muhurleme: {
    good: ['LD X0|SET Y0|LD X1|RST Y0', 'LD X0|OR M0|ANI X1|OUT M0|LD M0|OUT Y0', 'LDI X1|LD X0|OR Y0|ANB|OUT Y0'],
    bad: [
      { why: 'mühürleme unutulmuş', il: 'LD X0|ANI X1|OUT Y0', msg: /1,2 s'de Y0 \(motor\) çalışıyor olmalıydı, duruyor\. .*mühürleme/ },
      { why: 'stop açık kontak', il: 'LD X0|OR Y0|AND X1|OUT Y0', msg: /0,65 s'de Y0 \(motor\) çalışıyor olmalıydı.*stop kontağının/ },
      { why: 'start öncelikli', il: 'LD Y0|ANI X1|OR X0|OUT Y0', msg: /1,3 s'de Y0 \(motor\) duruyor olmalıydı, çalışıyor\. Start basılı olsa bile/ },
    ],
  },
  'iki-yerden': {
    good: ['LD X0|OR X1|SET Y0|LD X2|OR X3|RST Y0', 'LDI X2|ANI X3|LD X0|OR X1|OR M5|ANB|OUT M5|LD M5|OUT Y0', 'LD X0|OR Y0|OR X1|ANI X3|ANI X2|OUT Y0'],
    bad: [
      { why: 'stoplar paralel', il: 'LD X0|OR X1|OR Y0|LDI X2|ORI X3|ANB|OUT Y0', msg: /2,0 s'de Y0 \(motor\) duruyor olmalıydı, çalışıyor\. Stop 2/ },
      { why: "start'lar seri", il: 'LD X0|AND X1|OR Y0|ANI X2|ANI X3|OUT Y0', msg: /0,3 s'de Y0 \(motor\) çalışıyor olmalıydı.*Start 1/ },
      { why: 'ikinci stop unutulmuş', il: 'LD X0|OR X1|OR Y0|ANI X2|OUT Y0', msg: /2,0 s'de Y0 \(motor\) duruyor olmalıydı/ },
    ],
  },
  'set-rst': {
    good: ['LD X1|RST Y0|LD X0|ANI X1|SET Y0', 'LD X0|SET M0|LD X1|RST M0|LD M0|OUT Y0', 'LD X0|OR Y0|ANI X1|OUT Y0'],
    bad: [
      { why: 'RST, SET\'ten önce', il: 'LD X1|RST Y0|LD X0|SET Y0', msg: /0,8 s'de Y0 \(motor\) duruyor olmalıydı, çalışıyor\. İkisine birlikte/ },
      { why: 'stop kapalı kontak', il: 'LD X0|SET Y0|LDI X1|RST Y0', msg: /0,65 s'de Y0 \(motor\) çalışıyor olmalıydı, duruyor/ },
      { why: 'SET yerine OUT', il: 'LD X0|OUT Y0|LD X1|RST Y0', msg: /1,5 s'de Y0 \(motor\).*SET kullan/ },
    ],
  },
  'ileri-geri': {
    good: [
      'LD X0|ANI Y1|SET Y0|LD X1|ANI Y0|SET Y1|LD X2|RST Y0|RST Y1',
      'LD X0|OR M0|ANI X2|ANI M1|OUT M0|LD X1|OR M1|ANI X2|ANI M0|OUT M1|LD M0|OUT Y0|LD M1|OUT Y1',
      'LDI X2|MPS|LD X0|OR Y0|ANB|ANI Y1|OUT Y0|MPP|LD X1|OR Y1|ANB|ANI Y0|OUT Y1',
    ],
    bad: [
      { why: 'kilit unutulmuş', il: 'LD X0|OR Y0|ANI X2|OUT Y0|LD X1|OR Y1|ANI X2|OUT Y1', msg: /1,01 s'de Y1 \(geri yön\) çalışmaya başladı; bu senaryoda hiç çalışmamalıydı/ },
      { why: 'yalnız buton kilidi', il: 'LD X0|OR Y0|ANI X2|ANI X1|OUT Y0|LD X1|OR Y1|ANI X2|ANI X0|OUT Y1', msg: /Y1 \(geri yön\) çalışmaya başladı.*kilitleme/ },
    ],
  },
  'gecikmeli-calisma': {
    good: ['LD X0|TMR T200 K300|LD T200|OUT Y0', 'LD X0|TMR T5 K30|LD X0|AND T5|OUT Y0', 'LD X0|TMR T0 K30|LD T0|OUT M0|LD M0|OUT Y0'],
    bad: [
      { why: 'K30 yerine K3', il: 'LD X0|TMR T0 K3|LD T0|OUT Y0', msg: /Y0 \(lamba\), X0 \(anahtar\) açıldıktan 3,0 s sonra yanmalıydı; 0,3 s sonra yandı/ },
      { why: '10 ms tabanlı zamanlayıcıya K30', il: 'LD X0|TMR T200 K30|LD T200|OUT Y0', msg: /3,0 s sonra yanmalıydı; 0,3 s sonra yandı/ },
      { why: 'K300 (30 s)', il: 'LD X0|TMR T0 K300|LD T0|OUT Y0', msg: /3,0 s sonra yanmalıydı; hiç yanmadı/ },
      { why: 'anahtar mühürlenmiş', il: 'LD X0|OR M0|OUT M0|LD M0|TMR T0 K30|LD T0|OUT Y0', msg: /6,0 s'de Y0 \(lamba\) sönük olmalıydı, yanık/ },
    ],
  },
  'gecikmeli-kapanma': {
    good: [
      'LDI X0|TMR T0 K50|LD X0|OR Y0|ANI T0|OUT Y0',
      'LD X0|SET Y0|LDI X0|AND Y0|TMR T1 K50|LD T1|RST Y0',
      'LDI X0|AND Y0|TMR T200 K500|LD X0|OR Y0|ANI T200|OUT Y0',
    ],
    bad: [
      { why: 'süre tutmayı bozmuyor', il: 'LDI X0|AND Y0|TMR T0 K50|LD X0|OR Y0|OUT Y0', msg: /5,0 s sonra sönmeliydi; hiç sönmedi/ },
      { why: 'K50 yerine K5', il: 'LDI X0|AND Y0|TMR T0 K5|LD X0|OR Y0|ANI T0|OUT Y0', msg: /kapatıldıktan 5,0 s sonra sönmeliydi; 0,5 s sonra söndü/ },
      { why: 'gecikmeli çalışmayla karıştırılmış', il: 'LDI X0|TMR T0 K50|LD X0|OR T0|OUT Y0', msg: /kapatıldıktan 5,0 s sonra sönmeliydi; 0,01 s sonra söndü/ },
    ],
  },
  flasor: {
    good: [
      'LD X0|ANI T0|TMR T0 K20|LD X0|AND< T0 K10|OUT Y0',
      'LD X0|ANI T201|TMR T200 K100|LD T200|TMR T201 K100|LD X0|ANI T200|OUT Y0',
      'LD X0|ANI T1|TMR T0 K10|LD X0|AND T0|TMR T1 K10|LD X0|ANI T0|OUT M3|LD M3|OUT Y0',
    ],
    bad: [
      { why: 'sönük fazla başlıyor', il: 'LD X0|ANI T1|TMR T0 K10|LD T0|TMR T1 K10|LD T0|OUT Y0', msg: /1,8 s'de Y0 \(lamba\) yanık olmalıydı, sönük\. Anahtar açılır açılmaz/ },
      { why: 'K10 yerine K1', il: 'LD X0|ANI T1|TMR T0 K1|LD T0|TMR T1 K1|LD X0|ANI T0|OUT Y0', msg: /açıldıktan 1,0 s sonra sönmeliydi; 0,1 s sonra söndü/ },
      { why: 'serbest koşan osilatör', il: 'LDI T1|TMR T0 K10|LD T0|TMR T1 K10|LD X0|ANI T0|OUT Y0', msg: /Y0 \(lamba\) yanık olmalıydı, sönük/ },
    ],
  },
  sayici: {
    good: ['LD X1|RST C5|LD X0|CNT C5 K3|LD C5|OUT Y0', 'LDP X0|INC D0|LD>= D0 K3|OUT Y0|LD X1|MOV K0 D0', 'LD X0|PLS M0|LD M0|CNT C0 K3|LD X1|RST C0|LD C0|OUT Y0'],
    bad: [
      { why: 'reset unutulmuş', il: 'LD X0|CNT C0 K3|LD C0|OUT Y0', msg: /3,5 s'de Y0 \(lamba\) sönük olmalıydı, yanık\. Reset/ },
      { why: 'seviyeyle sayma', il: 'LD X0|INC D0|LD>= D0 K3|OUT Y0|LD X1|MOV K0 D0', msg: /1,6 s'de Y0 \(lamba\) sönük olmalıydı, yanık/ },
      { why: 'reset kapalı kontak', il: 'LDI X1|RST C0|LD X0|CNT C0 K3|LD C0|OUT Y0', msg: /2,5 s'de Y0 \(lamba\) yanık olmalıydı, sönük/ },
    ],
  },
  'tek-buton': {
    good: ['LDP X0|ALT Y0', 'LDP X0|AND Y0|OUT M1|LDP X0|ANI Y0|SET Y0|LD M1|RST Y0', 'LD X0|PLS M0|LD M0|ALT M10|LD M10|OUT Y0'],
    bad: [
      { why: 'seviyeyle değiştirme', il: 'LD X0|ANI Y0|LD Y0|ANI X0|ORB|OUT Y0', msg: /Y0 \(lamba\) (yanık|sönük) olmalıydı/ },
      { why: 'aynı darbeyle SET ve RST', il: 'LDP X0|ANI Y0|SET Y0|LDP X0|AND Y0|RST Y0', msg: /1,1 s'de Y0 \(lamba\) yanık olmalıydı, sönük/ },
      { why: 'tutma yok', il: 'LDP X0|ANI Y0|OUT Y0', msg: /1,1 s'de Y0 \(lamba\) yanık olmalıydı, sönük/ },
    ],
  },
  'sirali-kalkis': {
    good: [
      'LD X0|OR Y0|ANI X1|OUT Y0|LD Y0|TMR T0 K20|LD Y0|TMR T1 K40|LD T0|OUT Y1|LD T1|OUT Y2',
      'LD X0|SET Y0|LD Y0|TMR T10 K20|LD T10|SET Y1|LD Y1|TMR T11 K20|LD T11|SET Y2|LD X1|RST Y0|RST Y1|RST Y2',
      'LD X0|OR M0|ANI X1|OUT M0|LD M0|OUT Y0|TMR T0 K20|AND T0|OUT Y1|TMR T1 K20|AND T1|OUT Y2',
    ],
    bad: [
      { why: 'zamanlayıcılar butona bağlı', il: 'LD X0|OR Y0|ANI X1|OUT Y0|LD X0|TMR T0 K20|LD T0|OUT Y1|LD X0|TMR T1 K40|LD T1|OUT Y2', msg: /Y1 \(motor 2\), X0 \(start\) basıldıktan 2,0 s sonra çalışmaya başlamalıydı; hiç çalışmaya başlamadı/ },
      { why: 'stop yalnız motor 1\'i bırakıyor', il: 'LD X0|SET Y0|LD Y0|TMR T0 K20|LD T0|SET Y1|LD Y1|TMR T1 K20|LD T1|SET Y2|LD X1|RST Y0', msg: /6,0 s'de Y1 \(motor 2\) duruyor olmalıydı, çalışıyor/ },
      { why: 'motor 3 zamanlayıcısı motor 1\'den', il: 'LD X0|OR Y0|ANI X1|OUT Y0|LD Y0|TMR T0 K20|LD T0|OUT Y1|LD Y0|TMR T1 K20|LD T1|OUT Y2', msg: /Y2 \(motor 3\)/ },
    ],
  },
  'yildiz-ucgen': {
    good: [
      'LD X0|OR Y0|ANI X1|OUT Y0|LD Y0|TMR T0 K50|LD Y0|ANI T0|OUT Y1|LD T0|TMR T1 K5|LD T1|ANI Y1|OUT Y2',
      'LD X0|OR Y0|ANI X1|OUT Y0|LD Y0|TMR T200 K500|LD Y0|ANI T200|OUT Y1|LD T200|TMR T201 K100|LD T201|ANI Y1|OUT Y2',
      'LD X0|SET Y0|SET Y1|LD Y0|TMR T0 K50|LD T0|RST Y1|LD T0|ANI Y1|SET Y2|LD X1|RST Y0|RST Y1|RST Y2',
    ],
    bad: [
      { why: 'yıldız bırakmıyor', il: 'LD X0|OR Y0|ANI X1|OUT Y0|LD Y0|TMR T0 K50|LD Y0|OUT Y1|LD T0|OUT Y2', msg: /Y1 \(yıldız\), X0 \(start\) basıldıktan 5,0 s sonra bırakmalıydı; hiç bırakmadı/ },
      { why: 'iki ayrı zamanlayıcı, üçgen erken', il: 'LD X0|OR Y0|ANI X1|OUT Y0|LD Y0|TMR T0 K50|LD Y0|TMR T1 K45|LD Y0|ANI T0|OUT Y1|LD T1|OUT Y2', msg: /5,0 s'de Y1 \(yıldız\) ve Y2 \(üçgen\) birlikte çekti\. Yıldız ile üçgen arasında kilitleme/ },
      { why: 'K50 yerine K5', il: 'LD X0|OR Y0|ANI X1|OUT Y0|LD Y0|TMR T0 K5|LD Y0|ANI T0|ANI Y2|OUT Y1|LD Y0|AND T0|ANI Y1|OUT Y2', msg: /5,0 s sonra bırakmalıydı; 0,5 s sonra bıraktı/ },
    ],
  },
  'ana-salter': {
    good: [
      'LD X1|OR Y0|AND X0|ANI X2|OUT Y0|LD X3|OR Y1|AND X0|ANI X4|OUT Y1',
      'LD X0|MC N0|LD X1|OR M0|ANI X2|OUT M0|LD X3|OR M1|ANI X4|OUT M1|MCR N0|LD M0|OUT Y0|LD M1|OUT Y1',
      'LD X1|AND X0|SET Y0|LD X3|AND X0|SET Y1|LD X2|ORI X0|RST Y0|LD X4|ORI X0|RST Y1',
    ],
    bad: [
      { why: 'MC içinde SET', il: 'LD X0|MC N0|LD X1|SET Y0|LD X2|RST Y0|LD X3|SET Y1|LD X4|RST Y1|MCR N0', msg: /2,5 s'de Y0 \(motor 1\) duruyor olmalıydı, çalışıyor\. Şalter kapanınca/ },
      { why: 'şalter unutulmuş', il: 'LD X1|OR Y0|ANI X2|OUT Y0|LD X3|OR Y1|ANI X4|OUT Y1', msg: /1,5 s'de Y0 \(motor 1\) duruyor olmalıydı, çalışıyor\. Şalter kapalıyken/ },
      { why: 'şalter yalnız start kolunda', il: 'LD X0|AND X1|OR Y0|ANI X2|OUT Y0|LD X0|AND X3|OR Y1|ANI X4|OUT Y1', msg: /2,5 s'de Y0 \(motor 1\) duruyor olmalıydı/ },
    ],
  },
};

const firstMessage = (il: string, ex: Exercise): string => {
  const r = checkExercise(il, ex);
  return r.scenarios.find((s) => !s.passed)?.message ?? r.message;
};

describe('alıştırma listesi', () => {
  it('12 alıştırma, kimlikler benzersiz ve kısa', () => {
    expect(EXERCISES).toHaveLength(12);
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{3,24}$/);
    expect(getExercise('flasor')?.title).toBe('Flaşör');
    expect(getExercise('yok')).toBeUndefined();
  });
  it('her alıştırmanın test kümesi var', () => {
    expect(Object.keys(CASES).sort()).toEqual(EXERCISES.map((e) => e.id).sort());
  });
});

describe.each(EXERCISES.map((e) => [e.id, e] as const))('%s', (id, ex) => {
  const c = CASES[id]!;
  it('içerik biçimi: düzey, ipuçları, 2–5 senaryo, etiketler', () => {
    expect([1, 2, 3]).toContain(ex.level);
    expect(ex.hints.length).toBeGreaterThanOrEqual(1);
    expect(ex.hints.length).toBeLessThanOrEqual(3);
    expect(ex.scenarios.length).toBeGreaterThanOrEqual(2);
    expect(ex.scenarios.length).toBeLessThanOrEqual(5);
    for (const io of [...ex.inputs, ...ex.outputs]) expect(ex.starterIl).toContain(`#${io.dev} ${io.label}`);
    for (const o of ex.outputs) expect(o.dev).toMatch(/^Y/);
    for (const i of ex.inputs) expect(i.dev).toMatch(/^X/);
  });
  it('başlangıç IL\'i ve referans tanılamasız; başlangıç çözüm sızdırmıyor', () => {
    const prof = getProfile('ES2');
    expect(checkIl(ex.starterIl, prof).diagnostics).toEqual([]);
    expect(checkIl(ex.solutionIl, prof).diagnostics).toEqual([]);
    expect(checkIl(ex.starterIl, prof).program.instrs).toHaveLength(0);
    const code = ex.starterIl.split('\n').filter((l) => !l.startsWith(';') && !l.startsWith('#') && l.trim());
    expect(code).toEqual(['END']);
  });
  it('referans çözüm geçer', () => {
    const r = checkExercise(ex.solutionIl, ex);
    expect(r.blocked).toBe(false);
    expect(r.scenarios.filter((s) => !s.passed).map((s) => `${s.name}: ${s.message}`)).toEqual([]);
    expect(r.passed).toBe(true);
  });
  it('boş başlangıç IL\'i kalır', () => {
    const r = checkExercise(ex.starterIl, ex);
    expect(r.blocked).toBe(false);
    expect(r.passed).toBe(false);
    expect(checkExercise('', ex).passed).toBe(false);
  });
  it.each(c.good.map((g, i) => [i + 1, g] as const))('farklı doğru çözüm %i geçer', (_n, g) => {
    const r = checkExercise(p(g), ex);
    expect(r.scenarios.filter((s) => !s.passed).map((s) => `${s.name}: ${s.message}`)).toEqual([]);
  });
  it.each(c.bad.map((b) => [b.why, b] as const))('yanlış çözüm kalır: %s', (_why, b) => {
    const r = checkExercise(p(b.il), ex);
    expect(r.passed).toBe(false);
    expect(firstMessage(p(b.il), ex)).toMatch(b.msg);
  });
  it('en az 2 farklı doğru, 2 yanlış çözüm tanımlı', () => {
    expect(c.good.length).toBeGreaterThanOrEqual(2);
    expect(c.bad.length).toBeGreaterThanOrEqual(2);
  });
});

describe('denetleyici', () => {
  const ex = getExercise('muhurleme')!;
  it('engelleyici hata: senaryolara girmeden söyler', () => {
    const r = checkExercise('LD X0\nLD X1\nOUT Y0\nEND', ex);
    expect(r.blocked).toBe(true);
    expect(r.scenarios).toEqual([]);
    expect(r.message).toMatch(/çalıştırılamıyor/);
  });
  it('izler simulate() biçiminde, yalnızca görev cihazları', () => {
    const r = checkExercise(p('LD M0|OUT Y0|LD X0|OR M0|ANI X1|OUT M0|LD X0|OUT Y5'), ex);
    expect(r.passed).toBe(true); // görevde olmayan Y5 denetlenmez
    const s = r.scenarios[0]!;
    expect(s.watch).toEqual(['X0', 'X1', 'Y0']);
    expect(s.student.every((c) => s.watch.includes(c.dev))).toBe(true);
    expect(s.reference.find((c) => c.dev === 'Y0' && c.v === 1)?.t).toBe(510);
    expect(s.student.find((c) => c.dev === 'Y0' && c.v === 1)?.t).toBe(520); // yardımcı röle: bir tarama gecikme
  });
  it('kalan senaryoda bütün başarısızlıklar zamana göre sıralı', () => {
    const r = checkExercise(p('LD X0|ANI X1|OUT Y0'), ex);
    const f = r.scenarios[0]!.failures;
    expect(f.length).toBeGreaterThan(0);
    expect([...f].sort((a, b) => a.t - b.t)).toEqual(f);
    expect(r.message).toMatch(/senaryonun \d tanesi geçti/);
  });
});

describe('CLI: alistirma', () => {
  let out: string[] = [];
  afterEach(() => vi.restoreAllMocks());
  const cli = (...args: string[]): number => {
    out = [];
    vi.spyOn(console, 'log').mockImplementation((s: unknown) => void out.push(String(s)));
    return main(args);
  };
  const dir = mkdtempSync(join(tmpdir(), 'plc-alistirma-'));
  const file = (name: string, il: string): string => {
    const f = join(dir, name);
    writeFileSync(f, il, 'utf8');
    return f;
  };
  const ex = getExercise('yildiz-ucgen')!;

  it('liste', () => {
    expect(cli('alistirma')).toBe(0);
    expect(out).toHaveLength(EXERCISES.length);
    expect(out[0]).toContain('muhurleme');
  });
  it('görev metni + başlangıç programı, çözüm basılmaz', () => {
    expect(cli('alistirma', 'yildiz-ucgen')).toBe(0);
    const t = out.join('\n');
    expect(t).toContain(ex.task);
    expect(t).toContain(ex.starterIl);
    expect(t).not.toContain('TMR');
    expect(t).not.toContain('İpucu');
    expect(cli('alistirma', 'yildiz-ucgen', '--ipucu', '2')).toBe(0);
    expect(out.join('\n')).toContain('İpucu 2: ' + ex.hints[1]);
  });
  it('doğru çözüm: 0, her senaryo ✓', () => {
    expect(cli('alistirma', 'yildiz-ucgen', file('dogru.txt', p(CASES['yildiz-ucgen']!.good[0]!)))).toBe(0);
    expect(out.filter((l) => l.includes('✓'))).toHaveLength(ex.scenarios.length);
    expect(out.join('\n')).not.toContain('MCR');
  });
  it('yanlış çözüm: 1, senaryo iletisi', () => {
    expect(cli('alistirma', 'yildiz-ucgen', file('yanlis.txt', p(CASES['yildiz-ucgen']!.bad[1]!.il)))).toBe(1);
    const t = out.join('\n');
    expect(t).toContain('✗');
    expect(t).toMatch(/Y1 \(yıldız\) ve Y2 \(üçgen\) birlikte çekti/);
  });
  it('çalışmayan program: 1, tanılama', () => {
    expect(cli('alistirma', 'muhurleme', '-e', 'LD X0\\nLD X1\\nOUT Y0')).toBe(1);
    expect(out.join('\n')).toMatch(/çalıştırılamıyor/);
  });
  it('--cozum referansı yazar; bilinmeyen kimlik hata', () => {
    expect(cli('alistirma', 'yildiz-ucgen', '--cozum')).toBe(0);
    expect(out.join('\n')).toBe(ex.solutionIl);
    expect(() => cli('alistirma', 'yok-boyle')).toThrow(/Alıştırma yok/);
  });
});
