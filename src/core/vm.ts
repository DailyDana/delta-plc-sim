// Sanal makine: IL komutlarını gerçek PLC gibi sırayla yürütür.
// Tarama: giriş yenileme (X ← dış girişler) → program → çıkış yenileme (Y → dış çıkışlar).
// Mantık akümülatör + blok yığını (LD/ANB/ORB) + MPS yığını ile değerlendirilir.

import { formatAddress, parseAddress, type DevType, type WordRef } from './devices';
import type { Diagnostic } from './diagnostics';
import type { CmpOp, ContactKind, InstrDef, OpClass } from './instructions';
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
  def: InstrDef;
  /** Kelime işlenenleri (uygulama komutları, karşılaştırma kontakları) */
  w: (WordRef | null)[];
  /** İşlenenlerin bit adresleri (CMP sonuç biti, ZRST aralığı, ALT) */
  a: ({ type: DevType; index: number } | null)[];
  /** TMR/CNT ayar değeri D'den okunuyorsa o kaydedici, değilse -1 */
  kD: number;
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
        def: it.def,
        w: it.ops.map((o) => (o.invalid ? null : o.word ?? null)),
        a: it.ops.map((o) => (o.invalid || !o.addr ? null : { type: o.addr.type, index: o.addr.index })),
        kD: kOp && !kOp.invalid && kOp.addr?.type === 'D' && (it.mn === 'TMR' || it.mn === 'CNT') ? kOp.addr.index : -1,
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
      if (c.type === 'T' && c.mn === 'TMR' && c.kD < 0) this.Tsv[c.index] = c.k;
      if (c.type === 'C' && c.mn === 'CNT' && c.kD < 0) this.Csv[c.index] = c.k;
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
    if (type === 'Y') {
      if (index < this.Y.length) this.Y[index] = b;
    } else if (type === 'M') {
      if (index < this.M.length) this.M[index] = b;
    } else if (type === 'S') {
      if (index < this.S.length) this.S[index] = b;
    }
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
        case 'inv':
          acc = acc ^ 1;
          this.closed[i] = acc;
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
    if (c.contact === 'CMP') {
      const d32 = !!c.def.d32;
      const v = c.w[0] && c.w[1] && compare(this.readW(c.w[0], d32), this.readW(c.w[1], d32), c.def.cmp ?? '=') ? 1 : 0;
      this.closed[i] = v;
      return v;
    }
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
    if (c.def.base) {
      this.api(i, c, q);
      return;
    }
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
        const k = c.kD >= 0 ? Math.max(0, this.D[c.kD] ?? 0) : c.k;
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
        const k0 = c.kD >= 0 ? (this.D[c.kD] ?? 0) : c.k;
        const k = k0 < 1 ? 1 : k0; // K0, K1 ile aynıdır (Delta EH3/SV2 kılavuzu s.2-19)
        this.Csv[idx] = k;
        const prev = this.priming ? (q ? 1 : 0) : this.coilPrev[i]!;
        this.coilPrev[i] = q ? 1 : 0;
        // Ayar değerinde durur; MOV ile ayarın üstü yazılmışsa sonraki kenarda ayara eşitlenir (ES2 s.2-26)
        if (q && !prev) {
          if (this.Ccv[idx]! < k) this.Ccv[idx]!++;
          else if (this.profile.id !== 'v1') this.Ccv[idx] = k; // v1 sadeleştirilmiş: değer korunur
        }
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

  // ---------------------------------------------------------------- kelime işlemleri
  private timerBase(index: number): number {
    return timerRange(this.profile, index)?.baseMs ?? 100;
  }

  /** Kelime oku. 16 bit: işaretli (−32768…32767); K1–K3 bit grupları her zaman pozitif (s.3-20). */
  readW(r: WordRef, d32: boolean): number {
    switch (r.k) {
      case 'const':
        return r.v;
      case 'dev':
        if (r.type === 'D') return d32 ? ((this.D[r.index + 1] ?? 0) << 16) | ((this.D[r.index] ?? 0) & 0xffff) : this.D[r.index] ?? 0;
        if (r.type === 'T') return this.Tcv[r.index] ?? 0;
        return this.Ccv[r.index] ?? 0;
      case 'kn': {
        const bits = r.n * 4;
        let v = 0;
        for (let b = 0; b < bits; b++) if (this.read(r.type, r.index + b)) v = (v | (1 << b)) >>> 0;
        if (bits === 16 && !d32) return (v << 16) >> 16;
        if (bits === 32) return v | 0;
        return v;
      }
    }
  }

  /** Kelime yaz: 16 bit hedefte ikiye tümleyen sarma; Kn hedefte yalnızca n×4 bit değişir */
  writeW(r: WordRef, v: number, d32: boolean): void {
    switch (r.k) {
      case 'const':
        return;
      case 'dev': {
        const i = r.index;
        if (r.type === 'D') {
          if (i >= this.D.length) return;
          this.D[i] = v & 0xffff;
          if (d32 && i + 1 < this.D.length) this.D[i + 1] = (v >> 16) & 0xffff;
        } else if (r.type === 'T') {
          if (i >= this.Tcv.length) return;
          const cv = d32 ? v | 0 : (v << 16) >> 16;
          this.Tcv[i] = cv;
          this.Tacc[i] = cv * this.timerBase(i);
        } else if (i < this.Ccv.length) this.Ccv[i] = d32 ? v | 0 : (v << 16) >> 16;
        return;
      }
      case 'kn':
        for (let b = 0; b < r.n * 4; b++) this.write(r.type, r.index + b, ((v >>> b) & 1) === 1);
        return;
    }
  }

  /** ADD/SUB bayrakları: M1020 sıfır, M1021 borç, M1022 elde (s.3-74) */
  private setFlags(exact: number, stored: number, min: number, max: number): void {
    this.M[1020] = stored === 0 ? 1 : 0;
    this.M[1021] = exact < min ? 1 : 0;
    this.M[1022] = exact > max ? 1 : 0;
  }

  /** Uygulama komutu (MOV, CMP, ADD…). P biçimi yalnızca akımın yükselen kenarında bir kez çalışır (s.3-17). */
  private api(i: number, c: Code, q: boolean): void {
    const def = c.def;
    const prev = this.priming ? (q ? 1 : 0) : this.coilPrev[i]!;
    this.coilPrev[i] = q ? 1 : 0;
    if (!q || (def.pulse && prev)) return; // yürütülmezse hedefler ve bayraklar korunur (s.3-18, 3-61)
    const d32 = !!def.d32;
    const w = c.w;
    const R = (k: number): number => (w[k] ? this.readW(w[k]!, d32) : 0);
    const W = (k: number, v: number): void => {
      if (w[k]) this.writeW(w[k]!, v, d32);
    };
    const min = d32 ? -2147483648 : -32768;
    const max = d32 ? 2147483647 : 32767;
    const wrap = (v: number): number => (d32 ? v | 0 : (v << 16) >> 16);
    switch (def.base) {
      case 'MOV':
        W(1, R(0));
        break;
      case 'CMP': {
        const a = R(0);
        const b = R(1);
        this.bits3(c.a[2], a > b, a === b, a < b);
        break;
      }
      case 'ZCP': {
        const lo = R(0);
        let hi = R(1);
        const v = R(2);
        if (lo > hi) hi = lo; // S1 > S2: S1 tek karşılaştırma değeri olur (s.3-60)
        this.bits3(c.a[3], v < lo, v >= lo && v <= hi, v > hi);
        break;
      }
      case 'ADD':
      case 'SUB': {
        const exact = def.base === 'ADD' ? R(0) + R(1) : R(0) - R(1);
        const stored = wrap(exact);
        W(2, stored);
        this.setFlags(exact, stored, min, max);
        break;
      }
      case 'MUL': {
        const dst = w[2];
        if (!dst) break;
        if (!d32) {
          const prod = R(0) * R(1); // 16×16 → 32 bit: (D+1, D) (s.3-77)
          this.writeW(dst, prod | 0, true);
          this.M[1020] = prod === 0 ? 1 : 0;
        } else {
          const prod = BigInt(R(0)) * BigInt(R(1)); // 32×32 → 64 bit: (D+3 … D)
          this.writeW(dst, Number(BigInt.asIntN(32, prod)), true);
          if (dst.k === 'dev' && dst.type === 'D') this.writeW({ k: 'dev', type: 'D', index: dst.index + 2 }, Number(BigInt.asIntN(32, prod >> 32n)), true);
          this.M[1020] = prod === 0n ? 1 : 0;
        }
        break;
      }
      case 'DIV': {
        const a = R(0);
        const b = R(1);
        if (b === 0) {
          // Sıfıra bölme: yürütülmez; M1067/M1068 ON, D1067 = 0E19 (s.3-79), D1068 = hatalı komutun adresi
          this.M[1067] = 1;
          this.M[1068] = 1;
          if (this.D.length > 1068) {
            this.D[1067] = 0x0e19;
            this.D[1068] = i;
          }
          break;
        }
        const quo = Math.trunc(a / b);
        const rem = a % b;
        W(2, wrap(quo));
        const dst = w[2];
        if (dst && dst.k === 'dev' && dst.type === 'D') this.writeW({ k: 'dev', type: 'D', index: dst.index + (d32 ? 2 : 1) }, rem, d32);
        this.M[1020] = quo === 0 ? 1 : 0;
        break;
      }
      case 'INC':
        W(0, wrap(R(0) + 1)); // sınırda sarar, bayrakları etkilemez (s.3-81)
        break;
      case 'DEC':
        W(0, wrap(R(0) - 1));
        break;
      case 'WAND':
        W(2, R(0) & R(1));
        break;
      case 'WOR':
        W(2, R(0) | R(1));
        break;
      case 'WXOR':
        W(2, R(0) ^ R(1));
        break;
      case 'ZRST': {
        const a = c.a[0];
        const b = c.a[1];
        if (!a || !b || a.type !== b.type) break;
        const from = a.index > b.index ? b.index : a.index; // D1 > D2 ise yalnızca D2 (s.3-102)
        for (let k = from; k <= b.index; k++) this.resetDev(a.type, k);
        break;
      }
      case 'ALT': {
        const a = c.a[0];
        if (a) this.write(a.type, a.index, !this.read(a.type, a.index));
        break;
      }
    }
  }

  private bits3(a: { type: DevType; index: number } | null | undefined, b0: boolean, b1: boolean, b2: boolean): void {
    if (!a) return;
    this.write(a.type, a.index, b0);
    this.write(a.type, a.index + 1, b1);
    this.write(a.type, a.index + 2, b2);
  }

  /** RST ile aynı: bit 0; T/C değer ve kontak 0; D 0 */
  private resetDev(type: DevType, idx: number): void {
    if (type === 'T') {
      if (idx >= this.Tcv.length) return;
      this.Tacc[idx] = 0;
      this.Tcv[idx] = 0;
      this.Tdone[idx] = 0;
    } else if (type === 'C') {
      if (idx >= this.Ccv.length) return;
      this.Ccv[idx] = 0;
      this.Cdone[idx] = 0;
    } else if (type === 'D') {
      if (idx < this.D.length) this.D[idx] = 0;
    } else this.write(type, idx, false);
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

function compare(a: number, b: number, op: CmpOp): boolean {
  switch (op) {
    case '=': return a === b;
    case '>': return a > b;
    case '<': return a < b;
    case '<>': return a !== b;
    case '<=': return a <= b;
    case '>=': return a >= b;
  }
}
