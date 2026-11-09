// Sanal makine: IL komutlarını gerçek PLC gibi sırayla yürütür.
// Tarama: giriş yenileme (X ← dış girişler) → program → çıkış yenileme (Y → dış çıkışlar).
// Mantık akümülatör + blok yığını (LD/ANB/ORB) + MPS yığını ile değerlendirilir.

import { formatAddress, parseAddress, type DevType } from './devices';
import type { Diagnostic } from './diagnostics';
import type { ContactKind, OpClass } from './instructions';
import { analyze, parseIl, type IlProgram, type RungSpan } from './il';
import { getProfile, isLatched, timerRange, type Profile } from './profiles';

/** power: güç açılışı (her şey silinir) · run: STOP→RUN (kalıcı bölgeler ve birikimli zamanlayıcılar korunur) */
export type ResetMode = 'power' | 'run';

/** Bu tanılamalardan biri varsa program çalıştırılmaz (yapı bozuk ya da komut düşmüş) */
const BLOCKING = new Set(['E_UNKNOWN_OP', 'E_OPERAND_MISSING', 'E_NEED_LOAD', 'E_OPEN_BLOCK', 'E_BLOCK_UNDERFLOW', 'E_MPS_UNDERFLOW', 'E_MPS_DEPTH']);

interface Code {
  cls: OpClass;
  mn: string;
  contact: ContactKind | undefined;
  /** İlk işlenen (cihaz); geçersizse null */
  type: DevType | null;
  index: number;
  /** TMR/CNT ayar değeri */
  k: number;
  /** TMR taban süresi (ms) */
  base: number;
  accumulative: boolean;
}

export interface MachineOptions {
  profile?: string | Profile;
}

export type Snapshot = Record<string, number | string>;

export class Machine {
  readonly profile: Profile;
  readonly program: IlProgram;
  readonly rungs: RungSpan[];
  private readonly code: Code[];
  private readonly rungStart: Uint8Array;

  // cihaz belleği
  readonly X: Uint8Array;
  readonly Y: Uint8Array;
  readonly M: Uint8Array;
  readonly S: Uint8Array;
  readonly D: Int16Array;
  readonly Tdone: Uint8Array;
  readonly Tcv: Int32Array;
  readonly Tsv: Int32Array;
  private readonly Tacc: Float64Array;
  readonly Cdone: Uint8Array;
  readonly Ccv: Int32Array;
  readonly Csv: Int32Array;

  /** Dış girişler (fiziksel klemens); her taramanın başında X'e kopyalanır */
  readonly inputs: Uint8Array;
  /** Dış çıkışlar; her taramanın sonunda Y'den kopyalanır */
  readonly outputs: Uint8Array;

  // komut başına bellek ve iz (son taramanın değerleri)
  private readonly edge: Int8Array;
  private readonly coilPrev: Uint8Array;
  /** Komut çalışmadan önceki akümülatör (akım bu komuta ulaştı mı) */
  readonly accIn: Uint8Array;
  /** Komut çalıştıktan sonraki akümülatör */
  readonly accOut: Uint8Array;
  /** Kontak komutlarında kontağın kendisi kapalı mı (akımdan bağımsız) */
  readonly closed: Uint8Array;

  scanCount = 0;
  timeMs = 0;
  /** Komut izi (accIn/accOut/closed) en az bir taramayla dolduruldu mu? (yeni kurulan makinede false) */
  traced = false;
  /** adoptState sonrası ilk tarama: bobin kenar belleği doldurulur, darbe/sayma üretilmez */
  private priming = false;

  private readonly bstack: Uint8Array;
  private readonly mstack: Uint8Array;

  constructor(program: IlProgram, rungs: RungSpan[], opts: MachineOptions = {}) {
    this.profile = typeof opts.profile === 'object' ? opts.profile : getProfile(opts.profile);
    this.program = program;
    this.rungs = rungs;
    const p = this.profile;
    this.X = new Uint8Array(p.max.X + 1);
    this.Y = new Uint8Array(p.max.Y + 1);
    this.M = new Uint8Array(p.max.M + 1);
    this.S = new Uint8Array(p.max.S + 1);
    this.D = new Int16Array(p.max.D + 1);
    this.Tdone = new Uint8Array(p.max.T + 1);
    this.Tcv = new Int32Array(p.max.T + 1);
    this.Tsv = new Int32Array(p.max.T + 1).fill(-1);
    this.Tacc = new Float64Array(p.max.T + 1);
    this.Cdone = new Uint8Array(p.max.C + 1);
    this.Ccv = new Int32Array(p.max.C + 1);
    this.Csv = new Int32Array(p.max.C + 1).fill(-1);
    this.inputs = new Uint8Array(p.max.X + 1);
    this.outputs = new Uint8Array(p.max.Y + 1);

    this.code = program.instrs.map((it): Code => {
      const op = it.ops[0];
      const a = op && !op.invalid ? op.addr : undefined;
      const kOp = it.ops[1];
      const tr = a && a.type === 'T' ? timerRange(p, a.index) : undefined;
      return {
        cls: it.def.cls,
        mn: it.mn,
        contact: it.def.contact,
        type: a ? a.type : null,
        index: a ? a.index : 0,
        k: kOp && kOp.k !== undefined && !kOp.invalid ? kOp.k : 0,
        base: tr ? tr.baseMs : 100,
        accumulative: tr ? tr.accumulative : false,
      };
    });
    const n = this.code.length;
    this.rungStart = new Uint8Array(n);
    for (const r of rungs) if (r.start < n) this.rungStart[r.start] = 1;
    this.edge = new Int8Array(n).fill(this.profile.risingOnStartup ? 0 : -1);
    this.coilPrev = new Uint8Array(n);
    this.accIn = new Uint8Array(n);
    this.accOut = new Uint8Array(n);
    this.closed = new Uint8Array(n);
    this.bstack = new Uint8Array(n + 1);
    this.mstack = new Uint8Array(n + 1);
    // ayar değerleri baştan bilinsin (değer ekranında "0/50" görünsün)
    this.code.forEach((c) => {
      if (c.type === 'T' && c.mn === 'TMR') this.Tsv[c.index] = c.k;
      if (c.type === 'C' && c.mn === 'CNT') this.Csv[c.index] = c.k;
    });
  }

  /** IL metninden makine kurar; yapı bozuksa makine yerine yalnızca tanılama döner. */
  static fromText(text: string, opts: MachineOptions = {}): { machine: Machine | null; diagnostics: Diagnostic[]; program: IlProgram; rungs: RungSpan[] } {
    const profile = typeof opts.profile === 'object' ? opts.profile : getProfile(opts.profile);
    const parsed = parseIl(text, profile);
    const an = analyze(parsed.program);
    const diagnostics = [...parsed.diagnostics, ...an.diagnostics].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
    const blocked = diagnostics.some((d) => BLOCKING.has(d.code));
    const machine = blocked ? null : new Machine(parsed.program, an.rungs, { profile });
    return { machine, diagnostics, program: parsed.program, rungs: an.rungs };
  }

  /**
   * Belleği sıfırla. 'power' (varsayılan): güç açılışı, her şey silinir.
   * 'run': STOP→RUN geçişi; profildeki kalıcı (latched) bölgeler ve birikimli zamanlayıcılar korunur
   * (Delta ES2 kılavuzu s.2-10: RUN→STOP'ta kalıcı olmayan alanlar silinir, kalıcılar değişmez).
   */
  reset(mode: ResetMode = 'power'): void {
    const p = this.profile;
    const clear = (arr: { length: number; [i: number]: number }, type: DevType): void => {
      for (let i = 0; i < arr.length; i++) if (mode === 'power' || !isLatched(p, type, i)) arr[i] = 0;
    };
    for (const a of [this.X, this.Y, this.coilPrev, this.accIn, this.accOut, this.closed, this.outputs]) a.fill(0);
    clear(this.M, 'M');
    clear(this.S, 'S');
    clear(this.D, 'D');
    clear(this.Tdone, 'T');
    clear(this.Tcv, 'T');
    clear(this.Tacc, 'T');
    clear(this.Cdone, 'C');
    clear(this.Ccv, 'C');
    // Kenar belleği: gerçek modellerde "önceki = 0" (RUN başında zaten ON olan giriş LDP'yi tetikler);
    // v1 profilinde "bilinmiyor" (ilk taramada kenar sayılmaz)
    this.edge.fill(p.risingOnStartup ? 0 : -1);
    this.scanCount = 0;
    this.timeMs = 0;
    this.priming = false;
    this.traced = false;
  }

  /**
   * Çalışırken program değişti: eski makinenin cihaz belleğini ve zamanını devral (çevrimiçi düzenleme).
   * Komut başına kenar belleği yeni programla sıfırdan başlar; ayar değerlerini yeni program belirler.
   */
  adoptState(old: Machine): void {
    const copy = (dst: { length: number; [i: number]: number }, src: { length: number; [i: number]: number }) => {
      const n = Math.min(dst.length, src.length);
      for (let i = 0; i < n; i++) dst[i] = src[i]!;
    };
    copy(this.inputs, old.inputs);
    copy(this.X, old.X);
    copy(this.Y, old.Y);
    copy(this.outputs, old.outputs);
    copy(this.M, old.M);
    copy(this.S, old.S);
    copy(this.D, old.D);
    copy(this.Tdone, old.Tdone);
    copy(this.Tcv, old.Tcv);
    copy(this.Tacc, old.Tacc);
    copy(this.Cdone, old.Cdone);
    copy(this.Ccv, old.Ccv);
    this.scanCount = old.scanCount;
    this.timeMs = old.timeMs;
    // Kenar belleği: devralınan durumda "önceki = şimdiki" say ki düzenleme sahte kenar üretmesin;
    // CNT/PLS/PLF de ilk taramada bobinin önceki durumunu şimdiki kabul eder (priming)
    this.code.forEach((c, i) => {
      if (c.cls === 'load' || c.cls === 'and' || c.cls === 'or') this.edge[i] = c.type !== null && this.read(c.type, c.index) ? 1 : 0;
    });
    this.priming = true;
  }

  /** Bit oku (T/C: kontak durumu). Özel M röleleri burada hesaplanır. */
  read(type: DevType, index: number): boolean {
    switch (type) {
      case 'X': return this.X[index] === 1;
      case 'Y': return this.Y[index] === 1;
      case 'M':
        if (index >= 1000 && index <= 1014) {
          const s = this.special(index);
          if (s !== null) return s;
        }
        return this.M[index] === 1;
      case 'S': return this.S[index] === 1;
      case 'T': return this.Tdone[index] === 1;
      case 'C': return this.Cdone[index] === 1;
      case 'D': return this.D[index] !== 0;
    }
  }

  private special(index: number): boolean | null {
    const t = this.timeMs;
    switch (index) {
      case 1000: return true;
      case 1001: return false;
      case 1002: return this.scanCount === 0;
      case 1003: return this.scanCount !== 0;
      case 1011: return Math.floor(t / 5) % 2 === 1; // 10 ms saat
      case 1012: return Math.floor(t / 50) % 2 === 1; // 100 ms saat
      case 1013: return Math.floor(t / 500) % 2 === 1; // 1 s saat
      case 1014: return Math.floor(t / 30000) % 2 === 1; // 1 dk saat
      default: return null;
    }
  }

  private write(type: DevType | null, index: number, v: boolean): void {
    const b = v ? 1 : 0;
    if (type === 'Y') this.Y[index] = b;
    else if (type === 'M') this.M[index] = b;
    else if (type === 'S') this.S[index] = b;
  }

  /** Dış girişi ayarla: "X10" ya da sıra numarası */
  setInput(x: string | number, v: boolean | number): void {
    let i: number;
    if (typeof x === 'number') i = x;
    else {
      const a = parseAddress(x).addr;
      if (!a || a.type !== 'X') throw new Error(`Geçersiz giriş: ${x}`);
      i = a.index;
    }
    if (i < 0 || i >= this.inputs.length) throw new Error(`Giriş aralık dışı: ${x}`);
    this.inputs[i] = v ? 1 : 0;
  }

  /** Bir tarama; dt = bu taramanın simüle edilen süresi (ms) */
  scan(dt: number): void {
    this.X.set(this.inputs);
    const code = this.code;
    const bs = this.bstack;
    const ms = this.mstack;
    let acc = 0;
    let sp = 0;
    let mp = 0;
    let fresh = true;
    for (let i = 0; i < code.length; i++) {
      const c = code[i]!;
      if (this.rungStart[i]) {
        sp = 0;
        mp = 0;
        fresh = true;
      }
      this.accIn[i] = acc;
      switch (c.cls) {
        case 'load': {
          const v = this.contact(i, c);
          if (!fresh) bs[sp++] = acc;
          acc = v;
          fresh = false;
          break;
        }
        case 'and':
          acc = acc & this.contact(i, c);
          break;
        case 'or':
          acc = acc | this.contact(i, c);
          break;
        case 'block': {
          const b = sp > 0 ? bs[--sp]! : 0;
          acc = c.mn === 'ANB' ? b & acc : b | acc;
          break;
        }
        case 'stack':
          if (c.mn === 'MPS') ms[mp++] = acc;
          else if (c.mn === 'MRD') acc = mp > 0 ? ms[mp - 1]! : 0;
          else acc = mp > 0 ? ms[--mp]! : 0;
          break;
        case 'output':
          this.output(i, c, acc === 1, dt);
          break;
        default:
          break;
      }
      this.accOut[i] = acc;
    }
    this.outputs.set(this.Y);
    this.priming = false;
    this.traced = true;
    this.scanCount++;
    this.timeMs += dt;
  }

  private contact(i: number, c: Code): number {
    const cur = c.type !== null && this.read(c.type, c.index) ? 1 : 0;
    const prev = this.edge[i]!;
    this.edge[i] = cur;
    let v: number;
    switch (c.contact) {
      case 'NC': v = cur ^ 1; break;
      case 'P': v = cur === 1 && prev === 0 ? 1 : 0; break; // ilk taramada önceki değer bilinmez: kenar sayılmaz (v1 ile aynı)
      case 'F': v = cur === 0 && prev === 1 ? 1 : 0; break;
      default: v = cur;
    }
    this.closed[i] = v;
    return v;
  }

  private output(i: number, c: Code, q: boolean, dt: number): void {
    if (c.type === null) return; // geçersiz işlenen: yazma yok
    const idx = c.index;
    switch (c.mn) {
      case 'OUT':
        this.write(c.type, idx, q);
        break;
      case 'SET':
        if (q) this.write(c.type, idx, true);
        break;
      case 'RST':
        if (!q) break;
        if (c.type === 'T') {
          this.Tacc[idx] = 0;
          this.Tcv[idx] = 0;
          this.Tdone[idx] = 0;
        } else if (c.type === 'C') {
          this.Ccv[idx] = 0;
          this.Cdone[idx] = 0;
        } else if (c.type === 'D') this.D[idx] = 0;
        else this.write(c.type, idx, false);
        break;
      case 'TMR': {
        const k = c.k;
        this.Tsv[idx] = k;
        if (q) {
          this.Tacc[idx] = Math.min(this.Tacc[idx]! + dt, k * c.base);
          this.Tcv[idx] = Math.floor(this.Tacc[idx]! / c.base + 1e-9);
          this.Tdone[idx] = this.Tcv[idx]! >= k ? 1 : 0;
        } else if (!c.accumulative) {
          this.Tacc[idx] = 0;
          this.Tcv[idx] = 0;
          this.Tdone[idx] = 0;
        }
        break;
      }
      case 'CNT': {
        const k = c.k < 1 ? 1 : c.k; // K0, K1 ile aynıdır (Delta EH3/SV2 kılavuzu s.2-19)
        this.Csv[idx] = k;
        const prev = this.priming ? (q ? 1 : 0) : this.coilPrev[i]!;
        this.coilPrev[i] = q ? 1 : 0;
        if (q && !prev && this.Ccv[idx]! < k) this.Ccv[idx]!++;
        this.Cdone[idx] = this.Ccv[idx]! >= k ? 1 : 0;
        break;
      }
      case 'PLS': {
        const prev = this.priming ? (q ? 1 : 0) : this.coilPrev[i]!;
        this.coilPrev[i] = q ? 1 : 0;
        this.write(c.type, idx, q && !prev);
        break;
      }
      case 'PLF': {
        const prev = this.priming ? (q ? 1 : 0) : this.coilPrev[i]!;
        this.coilPrev[i] = q ? 1 : 0;
        this.write(c.type, idx, !q && prev === 1);
        break;
      }
    }
  }

  /** "Y0" → 0/1; "T0" → kontak durumu. Değer için value() kullan. */
  bit(text: string): number {
    const a = parseAddress(text).addr;
    if (!a) throw new Error(`Geçersiz adres: ${text}`);
    return this.read(a.type, a.index) ? 1 : 0;
  }

  /** T/C için güncel değer, D için sözcük, bitler için 0/1 */
  value(text: string): number {
    const a = parseAddress(text).addr;
    if (!a) throw new Error(`Geçersiz adres: ${text}`);
    if (a.type === 'T') return this.Tcv[a.index] ?? 0;
    if (a.type === 'C') return this.Ccv[a.index] ?? 0;
    if (a.type === 'D') return this.D[a.index] ?? 0;
    return this.read(a.type, a.index) ? 1 : 0;
  }

  /** Programda geçen cihazlar, türe göre sıralı */
  usedDevices(): Record<DevType, string[]> {
    const sets: Record<DevType, Set<number>> = { X: new Set(), Y: new Set(), M: new Set(), S: new Set(), T: new Set(), C: new Set(), D: new Set() };
    for (const it of this.program.instrs) for (const o of it.ops) if (o.addr && !o.invalid) sets[o.addr.type].add(o.addr.index);
    const out = {} as Record<DevType, string[]>;
    for (const t of Object.keys(sets) as DevType[]) out[t] = [...sets[t]].sort((a, b) => a - b).map((i) => formatAddress(t, i));
    return out;
  }

  /** Durum özeti: { scan, t, X0: 1, Y0: 0, M0: 1, T0: '25/100', C0: '3/5' } (PLC.app.state ile aynı biçim) */
  snapshot(): Snapshot {
    const o: Snapshot = { scan: this.scanCount, t: Math.round(this.timeMs) / 1000 };
    const u = this.usedDevices();
    for (const x of u.X) o[x] = this.inputs[parseAddress(x).addr!.index] ?? 0;
    for (const t of ['Y', 'M', 'S'] as const) for (const d of u[t]) o[d] = this.bit(d);
    for (const d of u.T) {
      const i = parseAddress(d).addr!.index;
      o[d] = `${this.Tcv[i]}/${this.Tsv[i]! >= 0 ? this.Tsv[i] : '?'}`;
    }
    for (const d of u.C) {
      const i = parseAddress(d).addr!.index;
      o[d] = `${this.Ccv[i]}/${this.Csv[i]! >= 0 ? this.Csv[i] : '?'}`;
    }
    for (const d of u.D) o[d] = this.value(d);
    return o;
  }
}

