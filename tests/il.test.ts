import { describe, expect, it } from 'vitest';
import { checkIl, formatAddress, getProfile, parseAddress, parseConstant, parseIl, writeIl } from '../src/core/index';

const codes = (text: string, model?: string) => checkIl(text, getProfile(model)).diagnostics.map((d) => d.code);

describe('adresler ve sabitler', () => {
  it('X/Y sekizlik', () => {
    expect(parseAddress('x10').addr).toEqual({ type: 'X', index: 8, text: 'X10' });
    expect(parseAddress('Y377').addr?.index).toBe(255);
    expect(parseAddress('X8').error).toBe('octal');
    expect(formatAddress('Y', 9)).toBe('Y11');
    expect(parseAddress('M0100').addr?.text).toBe('M100');
    expect(parseAddress('Q0').error).toBe('format');
  });
  it('K ve H sabitleri', () => {
    expect(parseConstant('K50')).toBe(50);
    expect(parseConstant('k-5')).toBe(-5);
    expect(parseConstant('H1F')).toBe(31);
    expect(parseConstant('50')).toBeNull();
  });
});

describe('ayrıştırıcı tanılamaları', () => {
  it('geçerli program hatasız', () => {
    expect(codes('LD X0\nOR Y0\nANI X1\nOUT Y0\nEND')).toEqual([]);
  });
  it('işlenen hataları kodlu', () => {
    expect(codes('LD X8\nOUT Y0')).toContain('E_ADDR_OCTAL');
    expect(codes('LD X0\nOUT X1')).toContain('E_OPERAND_KIND');
    expect(codes('LD X0\nOUT M1000')).toContain('E_SPECIAL_READONLY');
    expect(codes('LD X0\nOUT T0')).toContain('E_OPERAND_KIND');
    expect(codes('LD X0\nCNT C200 K5')).toContain('E_OPERAND_KIND');
    expect(codes('LD X0\nTMR T0')).toContain('E_OPERAND_MISSING');
    expect(codes('LD X0 X1\nOUT Y0')).toContain('E_OPERAND_EXTRA');
    expect(codes('LD X0\nFOO Y0')).toContain('E_UNKNOWN_OP');
    expect(codes('LD M5000\nOUT Y0')).toContain('E_ADDR_RANGE');
    expect(codes('LD X0\nOUT Y0\nLD D5000\nOUT Y1', 'SS2')).toEqual(['E_OPERAND_KIND']); // D kontak olamaz
  });
  it('K sınırı modele göre (v1: K1+, ES2: K0+)', () => {
    expect(codes('LD X0\nTMR T0 K0', 'v1')).toContain('E_CONST_RANGE');
    expect(codes('LD X0\nTMR T0 K0', 'ES2')).toEqual([]);
    expect(codes('LD X0\nTMR T0 K40000')).toContain('E_CONST_RANGE');
    const p = parseIl('LD X0\nTMR T0 50').program; // v1 uyumu: çıplak sayı K sayılır
    expect(p.instrs[1]?.ops[1]?.k).toBe(50);
  });
  it('yapısal hatalar', () => {
    expect(codes('AND X0\nOUT Y0')).toContain('E_NEED_LOAD');
    expect(codes('LD X0\nLD X1\nOUT Y0')).toContain('E_OPEN_BLOCK');
    expect(codes('LD X0\nANB\nOUT Y0')).toContain('E_BLOCK_UNDERFLOW');
    expect(codes('LD X0\nMRD\nOUT Y0')).toContain('E_MPS_UNDERFLOW');
    expect(codes('LD X0\nMPS\nOUT Y0')).toContain('W_MPS_UNCLOSED');
    expect(codes('LD X0\nAND X1')).toContain('E_NO_OUTPUT');
    const deep = 'LD X0\n' + 'MPS\nAND X1\n'.repeat(9) + 'OUT Y0\n' + 'MPP\nOUT Y1\n'.repeat(9);
    expect(codes(deep)).toContain('E_MPS_DEPTH');
  });
  it('çift bobin uyarısı', () => {
    expect(codes('LD X0\nOUT Y0\nLD X1\nOUT Y0')).toEqual(['W_DOUBLE_COIL']);
    expect(codes('LD X0\nSET Y0\nLD X1\nRST Y0')).toEqual([]);
  });
  it('satırlara bölme ve açıklamalar', () => {
    const r = checkIl('; birinci\nLD X0\nOUT Y0\nAND X1\nOUT Y1\n; ikinci\nLD X2\nOUT Y2');
    expect(r.rungs.map((s) => [s.start, s.end, s.comment])).toEqual([
      [0, 4, 'birinci'],
      [4, 6, 'ikinci'],
    ]);
  });
  it('etiketler ve yazıcı', () => {
    const p = parseIl('#X0 start\n#x10: dur\nLD X0\nOUT Y0').program;
    expect(p.labels).toEqual({ X0: 'start', X10: 'dur' });
    expect(writeIl(p)).toBe('#X0 start\n#X10 dur\n\nLD X0\nOUT Y0\nEND');
  });
});
