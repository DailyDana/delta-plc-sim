// v1 tarayıcı çekirdeğini (plc-core.js, CommonJS) testlerde kullanmak için yükleyici.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface V1Sim {
  bits: Record<string, boolean>;
  T: Record<string, { cv: number; done: boolean; sv?: number }>;
  C: Record<string, { cv: number; done: boolean; sv?: number }>;
  scan: number;
  timeMs: number;
  runScan(prog: unknown, dt: number): void;
  get(op: string): boolean;
}

export interface V1Core {
  parseIL(text: string): { prog: unknown; errors: { line: number; msg: string; warn?: boolean }[] };
  toIL(prog: unknown): string;
  Sim: new () => V1Sim;
}

export const V1 = require('../plc-core.js') as V1Core;
export const V1_EXAMPLES = require('../examples.js') as { name: string; il: string }[];
