// Aşama 3a: uygulama komutları ve karşılaştırma kontakları. Beklenen değerler Delta DVP-ES2 programlama
// kılavuzundaki tanım ve örneklerden (sayfa numaraları yorumlarda; özet docs/kilavuz-notlari.md).
import { describe, expect, it } from 'vitest';
import { Machine, checkIl, ladderToIl, parseLadder, drawLadderText } from '../src/core';

const run = (il: string, setup?: (m: Machine) => void, scans = 1) => {
  const r = Machine.fromText(il + '\nEND');
  if (!r.machine) throw new Error(r.diagnostics.map((d) => d.message).join('; '));
  const m = r.machine;
  setup?.(m);
  for (let i = 0; i < scans; i++) m.scan(10);
  return m;
};
const codes = (il: string) => checkIl(il + '\nEND').diagnostics.map((d) => d.code);

describe('MOV ve kelime işlenenleri', () => {
  it('MOV K10 D0; akış kapalıyken hedef değişmez (s.3-61)', () => {
    const m = run('LD X0\nMOV K10 D0\nLD X1\nMOV K20 D0', (mm) => mm.setInput('X0', 1));
    expect(m.value('D0')).toBe(10);
  });
  it('MOV T0 D10: zamanlayıcı değeri kopyalanır', () => {
    const m = run('LD M1000\nTMR T0 K100\nLD M1000\nMOV T0 D10', undefined, 25);
    expect(m.value('D10')).toBe(m.value('T0'));
  });
  it('K1Y0: yalnızca Y0–Y3 yazılır; K2M0 okuması üst bitleri 0 (s.3-18)', () => {
    const m = run('LD M1000\nSET Y4\nLD M1000\nMOV K15 K1Y0\nLD M1000\nMOV H1234 D0\nLD M1000\nMOV D0 K2M0\nLD M1000\nMOV K2M0 D1');
    expect([0, 1, 2, 3, 4].map((i) => m.bit('Y' + i))).toEqual([1, 1, 1, 1, 1]);
    expect(m.value('D1')).toBe(0x34);
  });
  it('K4: 16 bit işaretli okunur', () => {
    const m = run('LD M1000\nMOV K-1 K4M0\nLD M1000\nMOV K4M0 D0');
    expect(m.value('D0')).toBe(-1);
  });
  it('DMOV: D1 yüksek, D0 düşük kelime (s.3-17)', () => {
    const m = run('LD M1000\nDMOV K100000 D0');
    expect(m.value('D0')).toBe(-31072); // 100000 = H186A0: düşük kelime H86A0 (işaretli -31072)
    expect(m.value('D1')).toBe(1);
  });
  it('MOVP yalnızca yükselen kenarda bir kez (s.3-17)', () => {
    const m = run('LD X0\nMOVP D0 D1\nLD M1000\nINC D0', (mm) => mm.setInput('X0', 1), 5);
    // 1. taramada D0=0 kopyalandı; sonra INC sürdü ama MOVP tekrar çalışmadı
    expect(m.value('D1')).toBe(0);
    expect(m.value('D0')).toBe(5);
  });
});

describe('aritmetik ve bayraklar', () => {
  it('ADD/SUB cebirsel; sıfır bayrağı M1020 (s.3-74)', () => {
    const m = run('LD M1000\nADD K3 K-9 D0\nLD M1000\nSUB K5 K5 D1');
    expect(m.value('D0')).toBe(-6);
    expect(m.value('D1')).toBe(0);
    expect(m.bit('M1020')).toBe(1);
  });
  it('taşma: 32767+1 sarar, M1022 elde; -32768-1 sarar, M1021 borç', () => {
    let m = run('LD M1000\nADD K32767 K1 D0');
    expect(m.value('D0')).toBe(-32768);
    expect(m.bit('M1022')).toBe(1);
    m = run('LD M1000\nSUB K-32768 K1 D0');
    expect(m.value('D0')).toBe(32767);
    expect(m.bit('M1021')).toBe(1);
  });
  it('MUL 16 bit sonuç 32 bit (D21, D20) (s.3-77)', () => {
    const m = run('LD M1000\nMUL K300 K300 D20');
    expect(((m.value('D21') << 16) | (m.value('D20') & 0xffff)) >>> 0).toBe(90000);
  });
  it('DIV: bölüm D, kalan D+1; sıfıra bölmede yürütülmez, M1067/M1068, D1067=0E19 (s.3-79)', () => {
    let m = run('LD M1000\nDIV K17 K5 D20');
    expect([m.value('D20'), m.value('D21')]).toEqual([3, 2]);
    m = run('LD M1000\nMOV K7 D20\nLD M1000\nDIV K17 K0 D20');
    expect(m.value('D20')).toBe(7);
    expect([m.bit('M1067'), m.bit('M1068'), m.value('D1067')]).toEqual([1, 1, 0x0e19]);
  });
  it('INC/DEC sarar ve bayrakları etkilemez (s.3-81/82)', () => {
    const m = run('LD M1000\nMOV K32767 D0\nLD M1000\nINC D0\nLD M1000\nMOV K-32768 D1\nLD M1000\nDEC D1');
    expect([m.value('D0'), m.value('D1'), m.bit('M1022'), m.bit('M1021')]).toEqual([-32768, 32767, 0, 0]);
  });
  it('INCP her basışta bir artar', () => {
    const m = run('LD X0\nINCP D0', (mm) => mm.setInput('X0', 1), 10);
    expect(m.value('D0')).toBe(1);
  });
  it('WAND/WOR/WXOR kılavuz örnekleri (s.3-83…87)', () => {
    const b = (s: string) => ((parseInt(s, 2) << 16) >> 16);
    const m = run(
      `LD M1000\nWAND H${(0b1111111100001111).toString(16)} H${(0b0001001000110100).toString(16)} D0\nLD M1000\nWOR H5555 H0FA5 D1\nLD M1000\nWXOR H5555 H0FA5 D2`,
    );
    expect(m.value('D0')).toBe(b('0001001000000100'));
    expect(m.value('D1')).toBe(b('0101111111110101'));
    expect(m.value('D2')).toBe(b('0101101011110000'));
  });
});

describe('karşılaştırma', () => {
  it('CMP: D = S1>S2, D+1 eşit, D+2 S1<S2; kapalıyken korunur (s.3-59)', () => {
    const m = run('LD X0\nCMP K10 D0 Y0', (mm) => mm.setInput('X0', 1));
    expect([m.bit('Y0'), m.bit('Y1'), m.bit('Y2')]).toEqual([1, 0, 0]);
    m.setInput('X0', 0);
    m.scan(10);
    expect(m.bit('Y0')).toBe(1);
  });
  it('ZCP: altında / arasında / üstünde; S1>S2 iken S1 tek değer (s.3-60)', () => {
    const z = (v: number, lo = 10, hi = 100) => {
      const m = run(`LD M1000\nMOV K${v} D0\nLD M1000\nZCP K${lo} K${hi} D0 M0`);
      return [m.bit('M0'), m.bit('M1'), m.bit('M2')];
    };
    expect(z(5)).toEqual([1, 0, 0]);
    expect(z(10)).toEqual([0, 1, 0]);
    expect(z(101)).toEqual([0, 0, 1]);
    expect(z(50, 50, 10)).toEqual([0, 1, 0]);
    expect(z(51, 50, 10)).toEqual([0, 0, 1]);
  });
  it('karşılaştırma kontakları LD= AND> OR<= işaretli (s.3-502)', () => {
    const m = run('LD M1000\nMOV K-5 D0\nLD= D0 K-5\nOUT Y0\nLD> D0 K0\nOUT Y1\nLD M1000\nAND< D0 K0\nOUT Y2\nLD X0\nOR<= D0 K-6\nOUT Y3\nLD<> D0 K1\nOUT Y4');
    expect(['Y0', 'Y1', 'Y2', 'Y3', 'Y4'].map((y) => m.bit(y))).toEqual([1, 0, 1, 0, 1]);
  });
  it('DLD>= 32 bit karşılaştırır', () => {
    const m = run('LD M1000\nDMOV K100000 D0\nDLD>= D0 K100000\nOUT Y0');
    expect(m.bit('Y0')).toBe(1);
  });
});

describe('diğer komutlar', () => {
  it('ZRST aralığı sıfırlar; T/C değer ve kontak; D1>D2 ise yalnızca D2 (s.3-102)', () => {
    const m = run('LD M1000\nSET M5\nSET M6\nSET M9\nLD M1000\nZRSTP M5 M8\nLD M1000\nMOV K3 D9\nLD M1000\nMOV K4 D10\nLD M1000\nZRST D12 D10');
    expect([m.bit('M5'), m.bit('M6'), m.bit('M9')]).toEqual([0, 0, 1]);
    expect([m.value('D9'), m.value('D10')]).toEqual([3, 0]);
  });
  it('ALTP her basışta değiştirir, ALT her taramada (s.3-175)', () => {
    const m = run('LD X0\nALTP Y0\nLD X0\nALT Y1', (mm) => mm.setInput('X0', 1), 3);
    expect(m.bit('Y0')).toBe(1);
    expect(m.bit('Y1')).toBe(1); // 3 taramada 3 kez değişti
    m.setInput('X0', 0);
    m.scan(10);
    m.setInput('X0', 1);
    m.scan(10);
    expect(m.bit('Y0')).toBe(0);
  });
  it('INV sonucu ters çevirir (s.3-284)', () => {
    const m = run('LD X0\nINV\nOUT Y1');
    expect(m.bit('Y1')).toBe(1);
  });
  it('TMR ayar değeri D\'den (s.3-281)', () => {
    const m = run('LD M1000\nMOV K5 D0\nLD M1000\nTMR T0 D0', undefined, 60); // 600 ms, 100 ms taban
    expect(m.value('T0')).toBe(5);
    expect(m.bit('T0')).toBe(1);
  });
  it('CNT ayar D\'den; MOV ile ayar üstü yazılmış değer sonraki kenarda ayara eşitlenir', () => {
    const m = run('LD X0\nCNT C0 D0\nLD X1\nMOV K9 C0', (mm) => {
      mm.D[0] = 3;
      mm.setInput('X1', 1);
    });
    expect(m.value('C0')).toBe(9);
    m.setInput('X1', 0);
    m.setInput('X0', 1);
    m.scan(10);
    expect([m.value('C0'), m.bit('C0')]).toEqual([3, 1]);
  });
});

describe('denetim (tanılama)', () => {
  it('işlenen türleri', () => {
    expect(codes('LD X0\nMOV K10 K20')).toContain('E_OPERAND_KIND'); // sabit hedef
    expect(codes('LD X0\nMOV Y0 D0')).toContain('E_OPERAND_KIND'); // tek bit kelime değil
    expect(codes('LD X0\nMOV K1X0 K1X4')).toContain('E_OPERAND_KIND'); // X'e yazılamaz
    expect(codes('LD X0\nMOV K5Y0 D0')).toContain('E_OPERAND_KIND'); // 16 bitte K1–K4
    expect(codes('LD X0\nMOV K40000 D0')).toContain('E_CONST_RANGE');
    expect(codes('LD X0\nZRST M0 D10')).toContain('E_OPERAND_KIND');
    expect(codes('LD X0\nCMP D0 K1 D5')).toContain('E_OPERAND_KIND'); // sonuç bit olmalı
    expect(codes('LD X0\nTMR T0 M0')).toContain('E_OPERAND_KIND');
    expect(codes('LD X0\nDMOV K100000 D0\nLD X1\nMOV K1 D0')).toEqual([]);
  });
});

describe('ladder', () => {
  it('karşılaştırma kontağı, INV ve fonksiyon kutuları ladder\'a çevrilir ve geri aynı IL olur', () => {
    const il = 'LD= D0 K10\nOR> C0 K3\nINV\nMOVP K1 D5\nLD X0\nAND<> D1 D2\nADD D0 K1 D0\nCMP D0 K5 M10\nEND';
    const { ladder, diagnostics } = parseLadder(il);
    expect(diagnostics).toEqual([]);
    const out = ladderToIl(ladder!);
    expect(out).toMatch(/LD= D0 K10\nOR> C0 K3\nINV\nMOVP K1 D5/);
    expect(out).toMatch(/AND<> D1 D2/);
    expect(ladderToIl(parseLadder(out).ladder!)).toBe(out);
    expect(drawLadderText(ladder!)).toMatch(/\[MOVP K1 D5\]/);
  });
  it('TMR T0 D0 ladder\'da korunur', () => {
    const { ladder } = parseLadder('LD X0\nTMR T0 D0\nEND');
    expect(ladderToIl(ladder!)).toMatch(/TMR T0 D0/);
  });
});
