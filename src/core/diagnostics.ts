// Kodlu tanılama mesajları: ayrıştırıcı, statik denetim ve ladder dönüşümü aynı yapıyı kullanır.

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  code: DiagCode;
  severity: Severity;
  message: string;
  /** IL metnindeki satır (1'den başlar) */
  line?: number;
  /** Komut sırası (0'dan başlar) */
  instr?: number;
  /** Ladder satırı (0'dan başlar) */
  rung?: number;
}

export type DiagCode =
  | 'E_UNKNOWN_OP'
  | 'E_OPERAND_MISSING'
  | 'E_OPERAND_EXTRA'
  | 'E_ADDR_FORMAT'
  | 'E_ADDR_OCTAL'
  | 'E_ADDR_RANGE'
  | 'E_OPERAND_KIND'
  | 'E_SPECIAL_READONLY'
  | 'E_CONST_RANGE'
  | 'E_NEED_LOAD'
  | 'E_OPEN_BLOCK'
  | 'E_BLOCK_UNDERFLOW'
  | 'E_MPS_UNDERFLOW'
  | 'E_MPS_DEPTH'
  | 'W_MPS_UNCLOSED'
  | 'E_NO_OUTPUT'
  | 'W_DOUBLE_COIL'
  | 'W_COUNTER_32'
  | 'W_AFTER_END'
  | 'W_NO_END'
  | 'L_OR_AFTER_OUTPUT'
  | 'L_UNSUPPORTED';

export const diag = (code: DiagCode, message: string, at: Partial<Pick<Diagnostic, 'line' | 'instr' | 'rung'>> = {}): Diagnostic => ({
  code,
  // L_: program çalışır, yalnızca ladder olarak çizilemez → uyarı
  severity: code.startsWith('W_') || code.startsWith('L_') ? 'warning' : 'error',
  message,
  ...at,
});

export const hasErrors = (ds: readonly Diagnostic[]): boolean => ds.some((d) => d.severity === 'error');

/**
 * IL tanılamalarına ladder dönüşümünün (L_) tanılamalarını ekler. Aynı satırda zaten bir hata varsa
 * oradaki L_ uyarısı aynı sorunun ikinci kez söylenişidir (ör. açık blok: E_OPEN_BLOCK + L_UNSUPPORTED); atılır.
 * Sonuç satır sırasıyla döner; özet sayıları bu listeden sayılmalıdır.
 */
export function mergeDiagnostics(base: readonly Diagnostic[], ladder: readonly Diagnostic[]): Diagnostic[] {
  const errLines = new Set(base.filter((d) => d.severity === 'error').map((d) => d.line));
  const seen = new Set(base.map((d) => `${d.line}|${d.code}|${d.message}`));
  const out = [...base];
  for (const d of ladder) {
    if (d.code.startsWith('L_') && errLines.has(d.line)) continue;
    const key = `${d.line}|${d.code}|${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}
