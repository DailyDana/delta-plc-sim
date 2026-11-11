import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES, decodeShare, encodeShare, parseEvents, shareLink, simulate } from '../src/core/index';
import { main } from '../src/cli/plc';

describe('simülasyon', () => {
  it('olay biçimleri', () => {
    expect(parseEvents('0:X0=1 1.5s:X0=0, X1@200=1')).toEqual([
      { t: 0, dev: 'X0', v: 1 },
      { t: 200, dev: 'X1', v: 1 },
      { t: 1500, dev: 'X0', v: 0 },
    ]);
    expect(() => parseEvents('X0=1')).toThrow(/anlaşılamadı/);
  });
  it('yıldız-üçgen zaman çizelgesi', () => {
    const r = simulate(EXAMPLES[3]!.il, { events: parseEvents('0:X0=1 100:X0=0'), duration: 6000 });
    expect(r.ok).toBe(true);
    const at = (dev: string, v: number) => r.changes.find((c) => c.dev === dev && c.v === v)?.t;
    expect(at('X0', 1)).toBe(0);
    expect(at('Y1', 1)).toBe(10);
    expect(at('Y1', 0)).toBe(5000);
    expect(at('Y2', 1)).toBe(5500); // 0,5 s geçiş boşluğu: yıldız bıraktıktan sonra üçgen çeker
    expect(r.final).toMatchObject({ Y0: 1, Y1: 0, Y2: 1, T0: '50/50', T1: '55/55' });
  });
  it('izleme listesi ve bozuk program', () => {
    const r = simulate(EXAMPLES[1]!.il, { events: parseEvents('0:X0=1'), duration: 50, watch: ['Y0'] });
    expect(r.changes).toEqual([{ t: 10, dev: 'Y0', v: 1 }]);
    expect(simulate('LD X0\nLD X1\nOUT Y0', { duration: 10 }).ok).toBe(false);
  });
});

describe('paylaşım bağlantısı', () => {
  it('Türkçe karakterli IL gidiş-dönüş', () => {
    const il = '#X0 başlat\n; Ğ ü ş ı ö ç\nLD X0\nOUT Y0\nEND';
    expect(decodeShare(encodeShare(il))).toBe(il);
    expect(encodeShare(il)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('bağlantı biçimi', () => {
    const l = shareLink('LD X0\nOUT Y0', { name: 'deneme', run: true });
    expect(l).toMatch(/^https:\/\/delta-plc-sim\.delidana-lab\.workers\.dev\/#il=[A-Za-z0-9_-]+&ad=deneme&run=1$/);
  });
});

describe('CLI', () => {
  let out: string[] = [];
  afterEach(() => vi.restoreAllMocks());
  const cli = (...args: string[]): number => {
    out = [];
    vi.spyOn(console, 'log').mockImplementation((s: unknown) => void out.push(String(s)));
    return main(args);
  };
  it('kontrol: hatasız örnek 0, hatalı program 1', () => {
    expect(cli('kontrol', 'ornek:2')).toBe(0);
    expect(out.join('\n')).toContain('✓ hata yok');
    expect(cli('kontrol', '-e', 'LD X8\\nOUT Y0')).toBe(1);
    expect(out.join('\n')).toContain('E_ADDR_OCTAL');
  });
  it('sim: zaman çizelgesi ve dalga biçimi', () => {
    expect(cli('sim', 'ornek:4', '--olay', '0:X0=1 100:X0=0', '--sure', '6s', '--dalga')).toBe(0);
    const t = out.join('\n');
    expect(t).toContain('5.000 s  Y1 ↓ 0');
    expect(t).toMatch(/Y2 ▁+█+/);
  });
  it('ciz, link, ornek', () => {
    expect(cli('ciz', 'ornek:2')).toBe(0);
    expect(out.join('\n')).toContain('( Y0 )');
    expect(cli('link', '-e', 'LD X0\\nOUT Y0', '--run')).toBe(0);
    expect(out[0]).toMatch(/#il=.+&run=1/);
    expect(cli('ornek')).toBe(0);
    expect(out).toHaveLength(EXAMPLES.length);
  });
});
