// Doğruluk düzeltmeleri: simülatörün sessizce yanlış sonuç verdiği durumlar (END, engelleyici işlenen hataları,
// çalışırken bozuk ara durum, dokunulan cihazlar, 16 bit T/C, M1011, çevrimiçi düzenlemede kenarlar, tanılama metinleri).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES, Machine, checkIl, getProfile, instrDevices, parseEvents, parseIl, simulate } from '../src/core/index';
import { main } from '../src/cli/plc';
import { engine } from '../src/ui/sim/engine';

const diags = (il: string, model?: string) => checkIl(il, getProfile(model)).diagnostics;

function build(il: string, profile = 'ES2'): Machine {
  const r = Machine.fromText(il, { profile });
  expect(r.machine, JSON.stringify(r.diagnostics)).not.toBeNull();
  r.machine!.reset();
  return r.machine!;
}

/** Çalışırken düzenleme: yeni programı kur, eskinin belleğini devral */
function edit(old: Machine, il: string): Machine {
  const r = Machine.fromText(il, { profile: old.profile });
  expect(r.machine, JSON.stringify(r.diagnostics)).not.toBeNull();
  r.machine!.adoptState(old);
  return r.machine!;
}

describe('1. END', () => {
  it("END'den sonraki komutlar uyarı verir (ilk atılan komutun satırında), engellemez", () => {
    const d = diags('LD X0\nOUT Y0\nEND\nLD X1\nOUT Y1');
    const w = d.find((x) => x.code === 'W_AFTER_END');
    expect(w, JSON.stringify(d)).toBeDefined();
    expect(w!.severity).toBe('warning');
    expect(w!.line).toBe(4);
    expect(w!.message).toMatch(/END'den sonraki 2 komut/);
    expect(d.filter((x) => x.severity === 'error')).toEqual([]);
    expect(Machine.fromText('LD X0\nOUT Y0\nEND\nLD X1\nOUT Y1').machine).not.toBeNull();
  });
  it('END yoksa uyarı verir, engellemez', () => {
    const d = diags('LD X0\nOUT Y0');
    expect(d.map((x) => x.code)).toEqual(['W_NO_END']);
    expect(d[0]!.severity).toBe('warning');
    expect(d[0]!.message).toMatch(/END ile bitmeli/);
    expect(Machine.fromText('LD X0\nOUT Y0').machine).not.toBeNull();
    // boş program uyarı vermez
    expect(diags('; yalnızca açıklama')).toEqual([]);
  });
  it('hazır örnekler ve devreler/ dosyaları END uyarısı vermez', () => {
    const texts: [string, string][] = EXAMPLES.map((e) => [e.name, e.il]);
    const dir = join(__dirname, '..', 'devreler');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.txt'))) texts.push([f, readFileSync(join(dir, f), 'utf8')]);
    for (const [name, il] of texts) {
      for (const model of ['ES2', 'v1']) {
        const codes = diags(il, model).map((x) => x.code);
        expect(codes.filter((c) => c === 'W_AFTER_END' || c === 'W_NO_END'), `${name} (${model})`).toEqual([]);
      }
    }
  });
});

describe('2. işlenen aralığı/adres hataları engelleyici', () => {
  it('TMR T0 K40000: hata var ve makine kurulmaz', () => {
    const r = Machine.fromText('LD X0\nTMR T0 K40000\nLD T0\nOUT Y0\nEND');
    expect(r.diagnostics.map((d) => d.code)).toContain('E_CONST_RANGE');
    expect(r.machine).toBeNull();
  });
  it('DIV K10 D99999 D2: makine kurulmaz', () => {
    const r = Machine.fromText('LD X0\nDIV K10 D99999 D2\nEND');
    expect(r.diagnostics.map((d) => d.code)).toContain('E_ADDR_RANGE');
    expect(r.machine).toBeNull();
  });
  it('diğer işlenen hataları da engeller (sekizlik, tür, salt okunur)', () => {
    for (const il of ['LD X8\nOUT Y0\nEND', 'LD X0\nOUT X1\nEND', 'LD X0\nOUT M1000\nEND', 'LD M5000\nOUT Y0\nEND', 'LD X0\nMOV K40000 D0\nEND']) {
      expect(Machine.fromText(il).machine, il).toBeNull();
    }
  });
  it('v1 profilinde davranış değişmez (işlenen hatasıyla da çalışır)', () => {
    const r = Machine.fromText('LD X0\nTMR T0 K0\nEND', { profile: 'v1' });
    expect(r.diagnostics.map((d) => d.code)).toContain('E_CONST_RANGE');
    expect(r.machine).not.toBeNull();
  });
  it('simulate ve CLI çalıştırmaz', () => {
    expect(simulate('LD X0\nTMR T0 K40000\nEND', { duration: 50 }).final).toBeNull();
  });
});

describe('3. arayüz motoru: geçici bozuk program', () => {
  const VALID = 'LD X0\nCNT C0 K5\nLD C0\nOUT Y0\nEND';
  const press = () => {
    engine.setInput(0, true);
    engine.advance(10);
    engine.setInput(0, false);
    engine.advance(10);
  };
  it('çalışırken bozulan program son geçerli sürümle sürer, bellek korunur; düzelince devralınır', () => {
    expect(engine.load(VALID, 'ES2', { fresh: true }).ok).toBe(true);
    engine.run();
    press();
    press();
    expect(engine.machine!.value('C0')).toBe(2);
    const keep = engine.machine;
    // yazarken ara durum: satır sonunda yalnızca "LD"
    const r = engine.load(VALID.replace('END', 'LD'), 'ES2');
    expect(r.ok).toBe(false);
    expect(engine.machine).toBe(keep);
    expect(engine.stale).toBe(true);
    expect(engine.mode).not.toBe('stop');
    press();
    expect(engine.machine!.value('C0')).toBe(3);
    // düzeldi: yeni programa geçilir, sayıcı korunur
    expect(engine.load(VALID.replace('END', 'LD X1\nOUT Y1\nEND'), 'ES2').ok).toBe(true);
    expect(engine.stale).toBe(false);
    expect(engine.machine).not.toBe(keep);
    expect(engine.machine!.value('C0')).toBe(3);
    press();
    expect(engine.machine!.value('C0')).toBe(4);
    engine.stop();
  });
  it('RUN kipi bozuk ara durumda durmaz', () => {
    engine.load(VALID, 'ES2', { fresh: true });
    engine.run();
    engine.load('LD X0\nTMR T0 K40000\nEND', 'ES2');
    expect(engine.mode).toBe('run');
    expect(engine.stale).toBe(true);
    engine.stop();
  });
  it('hiç geçerli program yokken (ilk yükleme hatalı) makine yok', () => {
    const r = engine.load('LD X0\nLD X1\nOUT Y0\nEND', 'ES2', { fresh: true });
    expect(r.ok).toBe(false);
    expect(engine.machine).toBeNull();
    expect(engine.stale).toBe(false);
  });
});

describe('4. komutun dokunduğu bütün cihazlar', () => {
  const used = (il: string) => build(il).usedDevices();
  it('KnY hedefi', () => {
    expect(used('LD M1000\nMOV C0 K1Y0\nEND').Y).toEqual(['Y0', 'Y1', 'Y2', 'Y3']);
    expect(used('LD M1000\nMOV K2X0 D0\nEND').X).toEqual(['X0', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7']);
  });
  it('CMP/ZCP sonuç bitleri D, D+1, D+2', () => {
    expect(used('LD X0\nCMP D0 K1 M10\nEND').M).toEqual(['M10', 'M11', 'M12']);
    expect(used('LD X0\nZCP K1 K5 D0 Y4\nEND').Y).toEqual(['Y4', 'Y5', 'Y6']);
  });
  it('MUL/DIV üst kelimesi, 32 bit çiftler', () => {
    expect(used('LD X0\nMUL D0 D2 D4\nEND').D).toEqual(['D0', 'D2', 'D4', 'D5']);
    expect(used('LD X0\nDIV D0 D2 D4\nEND').D).toEqual(['D0', 'D2', 'D4', 'D5']);
    expect(used('LD X0\nDMUL D0 D2 D10\nEND').D).toEqual(['D0', 'D1', 'D2', 'D3', 'D10', 'D11', 'D12', 'D13']);
    expect(used('LD X0\nDMOV D0 D20\nEND').D).toEqual(['D0', 'D1', 'D20', 'D21']);
  });
  it('ZRST aralığı', () => {
    expect(used('LD X0\nZRST M0 M3\nEND').M).toEqual(['M0', 'M1', 'M2', 'M3']);
  });
  it('tek kaynak: instrDevices', () => {
    const p = parseIl('LD X0\nMOV C0 K1Y0\nEND');
    expect(instrDevices(p.program.instrs[1]!, getProfile('ES2')).map((a) => a.type + a.index)).toEqual(['C0', 'Y0', 'Y1', 'Y2', 'Y3']);
  });
  it('snapshot ve sim çıktısı KnY bitlerini içerir (devreler/21)', () => {
    const il = readFileSync(join(__dirname, '..', 'devreler', '21-sayici-degeri-lambalarda-ikili.txt'), 'utf8');
    const r = simulate(il, { events: parseEvents('0:X0=1 50:X0=0 100:X0=1 150:X0=0'), duration: 300 });
    expect(r.final).toMatchObject({ Y0: 0, Y1: 1, Y2: 0, Y3: 0, C0: '2/15' });
    const devs = new Set(r.changes.map((c) => c.dev));
    expect(devs.has('Y0') && devs.has('Y1')).toBe(true);
  });
});

describe('5. 16 bit T/C', () => {
  it('32 bit komut 16 bit T/C\'de çift kullanır: Cn düşük, Cn+1 yüksek kelime (s.3-17)', () => {
    const m = build('LD M1000\nDMOV K100000 C0\nEND');
    m.scan(10);
    expect(m.value('C0')).toBe((100000 << 16) >> 16);
    expect(m.value('C1')).toBe(1);
    const m2 = build('LD M1000\nDMOV K100000 C0\nDMOV C0 D10\nEND');
    m2.scan(10);
    expect(m2.readW({ k: 'dev', type: 'D', index: 10 }, true)).toBe(100000);
  });
  it('32 bit sayıcıya (C200+) 32 bit değer olduğu gibi yazılır', () => {
    const m = build('LD M1000\nDMOV K100000 C200\nEND');
    m.scan(10);
    expect(m.value('C200')).toBe(100000);
  });
  it('MUL 16×16 → T0 düşük, T1 yüksek kelime (D kuralına paralel)', () => {
    const m = build('LD M1000\nMUL K300 K300 T0\nEND');
    m.scan(10);
    expect(m.value('T0')).toBe((90000 << 16) >> 16);
    expect(m.value('T1')).toBe(1);
  });
  it('çiftin üst cihazı aralık dışıysa hata (engelleyici)', () => {
    expect(diags('LD X0\nDMOV K1 T255\nEND').map((d) => d.code)).toContain('E_ADDR_RANGE');
    expect(diags('LD X0\nDMOV K1 C199\nEND').some((d) => d.severity === 'error')).toBe(true);
    expect(diags('LD X0\nMUL K1 K2 D9999\nEND').map((d) => d.code)).toContain('E_ADDR_RANGE');
    expect(Machine.fromText('LD X0\nDMOV K1 T255\nEND').machine).toBeNull();
  });
  it('hiçbir 16 bit T/C 16 bit dışı değer tutmaz', () => {
    const m = build('LD M1000\nDMOV K100000 C0\nMUL K300 K300 T0\nDMUL K70000 K70000 T10\nDMOV K-99999 T20\nEND');
    m.scan(10);
    for (let i = 0; i < 200; i++) {
      expect(m.Tcv[i]! >= -32768 && m.Tcv[i]! <= 32767, `T${i}=${m.Tcv[i]}`).toBe(true);
      expect(m.Ccv[i]! >= -32768 && m.Ccv[i]! <= 32767, `C${i}=${m.Ccv[i]}`).toBe(true);
    }
  });
});

describe('6. saat darbeleri', () => {
  const trace = (il: string, n: number, dt = 10, profile = 'ES2') => {
    const m = build(il, profile);
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      m.scan(dt);
      out.push(m.bit('Y0'));
    }
    return out;
  };
  it('M1011 10 ms taramada her taramada değişir', () => {
    expect(trace('LD M1011\nOUT Y0\nEND', 6)).toEqual([0, 1, 0, 1, 0, 1]);
  });
  it('M1012 10 ms taramada değişmedi (50 ms açık / 50 ms kapalı)', () => {
    const t = trace('LD M1012\nOUT Y0\nEND', 20);
    expect(t).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
  });
  it('M1013 100 ms taramada da değişmedi', () => {
    expect(trace('LD M1013\nOUT Y0\nEND', 12, 100)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0]);
  });
  it('v1 profilinde M1011 eski davranış', () => {
    expect(trace('LD M1011\nOUT Y0\nEND', 4, 10, 'v1')).toEqual([0, 0, 0, 0]);
  });
});

describe('7. çevrimiçi düzenlemede kenarlar', () => {
  const EXTRA = 'LD X7\nOUT Y7\n';
  it('CNT: düzenlemeden sonraki ilk taramadaki gerçek kenar sayılır', () => {
    const a = build('LD X0\nCNT C0 K5\nEND');
    a.scan(10);
    const b = edit(a, 'LD X0\nCNT C0 K5\n' + EXTRA + 'END');
    b.setInput('X0', 1);
    b.scan(10);
    expect(b.value('C0')).toBe(1);
  });
  it('LDP M0 / INCP D0: önceki taramada kurulan M0 kenarı yutulmaz', () => {
    const il = 'LDP M0\nINCP D0\nLD X0\nOUT M0\n';
    const a = build(il + 'END');
    a.setInput('X0', 1);
    a.scan(10);
    expect(a.value('D0')).toBe(0);
    const b = edit(a, il + EXTRA + 'END');
    b.scan(10);
    expect(b.value('D0')).toBe(1);
  });
  it('PLF: düzenlemeden sonraki ilk taramadaki düşen kenar darbe üretir', () => {
    const a = build('LD X0\nPLF M0\nEND');
    a.setInput('X0', 1);
    a.scan(10);
    const b = edit(a, 'LD X0\nPLF M0\n' + EXTRA + 'END');
    b.setInput('X0', 0);
    b.scan(10);
    expect(b.bit('M0')).toBe(1);
  });
  it('düzenleme anında zaten ON olan koşul sahte kenar üretmez', () => {
    const a = build('LD X0\nCNT C0 K5\nEND');
    a.setInput('X0', 1);
    a.scan(10);
    expect(a.value('C0')).toBe(1);
    // yeni eklenen sayıcı ve LDP, değiştirilen ayar değeri, değiştirilen koşul
    const b = edit(a, 'LD X0\nCNT C0 K9\nLD X0\nCNT C1 K5\nLDP X0\nOUT Y1\nLD X0\nPLS M5\nEND');
    b.scan(10);
    b.scan(10);
    expect(b.value('C0')).toBe(1);
    expect(b.value('C1')).toBe(0);
    expect(b.bit('Y1')).toBe(0);
    expect(b.bit('M5')).toBe(0);
    // koşulu düzenlemeyle ON olan çıkış da sahte kenar üretmez
    const c0 = build('LD X0\nANI X1\nCNT C0 K5\nEND');
    c0.setInput('X0', 1);
    c0.setInput('X1', 1);
    c0.scan(10);
    const c = edit(c0, 'LD X0\nCNT C0 K5\nEND');
    c.scan(10);
    expect(c.value('C0')).toBe(0);
  });
});

describe('8. tanılama metinleri', () => {
  let out: string[] = [];
  afterEach(() => vi.restoreAllMocks());
  const cli = (...args: string[]): number => {
    out = [];
    vi.spyOn(console, 'log').mockImplementation((s: unknown) => void out.push(String(s)));
    return main(args);
  };
  it('eksik işlenen: tek, örnekli mesaj', () => {
    for (const [il, ex] of [
      ['LD X0\nTMR T0\nEND', 'TMR T0 K50'],
      ['LD X0\nCNT C0\nEND', 'CNT C0 K5'],
      ['LD X0\nTMR\nEND', 'TMR T0 K50'],
      ['LD\nOUT Y0\nEND', 'LD X0'],
      ['LD X0\nMOV K10\nEND', 'Örnek: MOV '],
    ] as const) {
      const d = diags(il).filter((x) => x.severity === 'error');
      expect(d, il + JSON.stringify(d)).toHaveLength(1);
      expect(d[0]!.code).toBe('E_OPERAND_MISSING');
      expect(d[0]!.message).toContain(ex);
    }
  });
  it('eşsiz LD: tek mesaj, LD satırını söyler; özet listeyle tutarlı', () => {
    expect(cli('kontrol', '-e', 'LD X0\\nLD X1\\nOUT Y0\\nEND')).toBe(1);
    const t = out.join('\n');
    expect(t).not.toContain('L_UNSUPPORTED');
    const errLines = out.filter((l) => /^\s+HATA /.test(l));
    expect(errLines).toHaveLength(1);
    expect(errLines[0]).toMatch(/2\. satırdaki LD X1/);
    expect(t).toContain('Özet: 1 hata, 0 uyarı');
  });
  it('özet sayıları her durumda listeyle tutarlı', () => {
    for (const il of ['LD X0\\nOUT Y0\\nLD X1\\nOR Y0\\nOUT Y1\\nOUT Y2\\nOR X3\\nOUT Y3\\nEND', 'LD X0\\nMPS\\nOUT Y0\\nEND', 'LD X0\\nOUT Y0']) {
      cli('kontrol', '-e', il);
      const errs = out.filter((l) => /^\s+HATA /.test(l)).length;
      const warns = out.filter((l) => /^\s+uyarı /.test(l)).length;
      expect(out.join('\n'), il).toContain(`Özet: ${errs} hata, ${warns} uyarı`);
    }
  });
  it("eşleşmeyen MPS uyarısı MPS'in satırında", () => {
    const d = diags('LD X0\nMPS\nAND X1\nOUT Y0\nLD X2\nOUT Y1\nEND').find((x) => x.code === 'W_MPS_UNCLOSED');
    expect(d?.line).toBe(2);
  });
  it('çift bobin uyarısı ilk kullanımın satırını söyler', () => {
    const d = diags('LD X0\nOUT Y0\nLD X1\nOUT Y0\nEND').find((x) => x.code === 'W_DOUBLE_COIL');
    expect(d?.line).toBe(4);
    expect(d?.message).toMatch(/2\. satır/);
  });
});
