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
