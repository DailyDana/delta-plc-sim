// Simülasyon motoru: sanal makineyi gerçek zamanla sürer. React'ten bağımsızdır; arayüz abone olur.
//
// - Zaman ekran karelerinden bağımsız akar (setInterval + gerçek zaman farkı): sekme arka plandayken
//   ya da gömülü pencerede kareler seyrekleşse de geçen süre kadar taranır (en çok 60 s yetişilir).
// - Kısa basış kilidi: basış, PLC en az bir tarama boyunca görene kadar tutulur; iki tarama arasında
//   basılıp bırakılan buton da görülür. STOP'tayken yapılan basış RUN'da sayılmaz (gerçek PLC gibi).
// - STOP → RUN: kalıcı olmayan bellek silinir, kalıcı (latched) bölgeler korunur. "Güç kes" her şeyi siler.

import { Machine, type Diagnostic } from '../../core';

export type Mode = 'stop' | 'run' | 'pause';

export const SCAN_MS = 10;
const MAX_CATCHUP_MS = 60000;
const MAX_SCANS_PER_TICK = 8000;
const NX = 256;

export interface LoadResult {
  ok: boolean;
  diagnostics: Diagnostic[];
}

class Engine {
  machine: Machine | null = null;
  /**
   * Düzenleyicideki program şu an hatalı, motor son geçerli sürümü çalıştırıyor. Bu durumda `machine`
   * düzenleyicideki programa ait değildir: komut sırasıyla eşlenen canlı izler (closed/accOut) kullanılmamalı.
   */
  stale = false;
  mode: Mode = 'stop';
  speed = 1;
  /** Dış girişler (X sıra numarasına göre) */
  readonly inputs = new Uint8Array(NX);
  /** Sağ tıkla kilitlenmiş girişler */
  readonly locked = new Uint8Array(NX);
  private readonly pulse = new Uint8Array(NX);
  private last = typeof performance !== 'undefined' ? performance.now() : 0;
  private dirty = true;
  /** Durum sürümü: her görünür değişiklikte artar (React useSyncExternalStore için) */
  version = 0;
  private readonly frameSubs = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private raf = 0;
  private il = '';
  private profileId = '';

  /** Programı yükle. Çalışırken çağrılırsa cihaz belleği devralınır (çevrimiçi düzenleme). */
  load(il: string, profileId: string, opts: { fresh?: boolean } = {}): LoadResult {
    if (opts.fresh) {
      // Başka devre (sekme değişimi, yeni yükleme): sıfırdan, STOP'ta başla
      this.machine = null;
      this.stale = false;
      this.mode = 'stop';
      this.clearPulses();
      this.il = '';
    }
    if (il === this.il && profileId === this.profileId && this.machine && !this.stale) return { ok: true, diagnostics: [] };
    const { machine, diagnostics } = Machine.fromText(il, { profile: profileId });
    const old = this.machine;
    const sameProfile = profileId === this.profileId;
    this.il = il;
    this.profileId = profileId;
    if (!machine) {
      if (old && sameProfile) {
        // Yazarken geçici bozuk ara durum (ör. satır sonunda yalnızca "LD"): son geçerli programla devam,
        // bellek korunur. Program düzelince adoptState ile yeni programa geçilir.
        this.stale = true;
        this.touch();
        return { ok: false, diagnostics };
      }
      // Hiç geçerli program yok: çalıştırılamaz. Çalışıyorsa durdur.
      this.machine = null;
      this.stale = false;
      if (this.mode !== 'stop') this.mode = 'stop';
      this.touch();
      return { ok: false, diagnostics };
    }
    // Aynı devrenin düzenlenmesi: bellek devralınır (STOP'ta da kalıcı bölgeler kaybolmasın)
    if (old && sameProfile) machine.adoptState(old);
    this.machine = machine;
    this.stale = false;
    this.touch();
    return { ok: true, diagnostics };
  }

  private touch(): void {
    this.dirty = true;
    this.version++;
    this.ensureLoop();
  }

  private ensureLoop(): void {
    if (typeof window === 'undefined') return;
    if (!this.timer) this.timer = setInterval(() => this.tick(), 16);
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (): void => {
    this.raf = 0;
    if (this.dirty) {
      this.dirty = false;
      this.frameSubs.forEach((f) => f());
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Her görünür değişiklikte (en çok kare başına bir kez) çağrılır */
  subscribe(f: () => void): () => void {
    this.frameSubs.add(f);
    this.ensureLoop();
    return () => this.frameSubs.delete(f);
  }

  setInput(i: number, v: boolean): void {
    if (i < 0 || i >= NX) return;
    this.inputs[i] = v ? 1 : 0;
    if (v) this.pulse[i] = 1;
    this.touch();
  }

  toggleLock(i: number): void {
    this.locked[i] = this.locked[i] ? 0 : 1;
    this.setInput(i, !!this.locked[i]);
  }

  private clearPulses(): void {
    this.pulse.fill(0);
  }

  /** STOP'tan çalışmaya geçiş: PLC "RUN" başlangıcı */
  private startFromStop(): void {
    this.machine?.reset('run');
    this.clearPulses();
  }

  run(): void {
    if (!this.machine) return;
    if (this.mode === 'stop') this.startFromStop();
    this.mode = 'run';
    this.last = performance.now();
    this.touch();
  }

  pause(): void {
    if (!this.machine) return;
    if (this.mode === 'stop') this.startFromStop();
    this.mode = 'pause';
    this.touch();
  }

  stop(): void {
    this.mode = 'stop';
    this.machine?.reset('run');
    this.clearPulses();
    this.touch();
  }

  /** Güç kesip açma: kalıcı bölgeler dahil her şey silinir */
  powerCycle(): void {
    this.mode = 'stop';
    this.machine?.reset('power');
    this.clearPulses();
    this.touch();
  }

  /** Tek tarama adımı (duraklatılmış kipe geçer) */
  step(): void {
    if (!this.machine) return;
    if (this.mode === 'stop') this.startFromStop();
    this.mode = 'pause';
    this.scanOnce(SCAN_MS);
    this.touch();
  }

  /** Belirlenimli ilerletme: gerçek zamandan bağımsız ms kadar tara (duraklatılmış kipe geçer) */
  advance(ms: number): void {
    if (!this.machine) return;
    if (this.mode === 'stop') this.startFromStop();
    else if (this.mode === 'run') this.tick();
    this.mode = 'pause';
    let left = Math.max(0, Number(ms) || 0);
    if (!left) this.scanOnce(SCAN_MS);
    while (left > 0) {
      const dt = Math.min(SCAN_MS, left);
      this.scanOnce(dt);
      left -= dt;
    }
    this.touch();
  }

  private scanOnce(dt: number): void {
    const m = this.machine;
    if (!m) return;
    const n = Math.min(m.inputs.length, NX);
    for (let i = 0; i < n; i++) m.inputs[i] = this.inputs[i]! | this.pulse[i]!;
    m.scan(dt);
    this.clearPulses();
  }

  /** Gerçek zaman adımı. Testler için dışarıdan da çağrılabilir: tick(now) */
  tick(now: number = performance.now()): void {
    const real = Math.min(Math.max(0, now - this.last), MAX_CATCHUP_MS);
    this.last = now;
    if (this.mode !== 'run' || !this.machine) return;
    const total = real * this.speed;
    if (total <= 0) return;
    const n = Math.max(1, Math.min(MAX_SCANS_PER_TICK, Math.ceil(total / SCAN_MS)));
    for (let i = 0; i < n; i++) this.scanOnce(total / n);
    this.dirty = true;
    this.version++;
  }

  /** Testler için: son tick zamanını geri al (ör. "3 s önce") */
  rewindClock(ms: number): void {
    this.last = performance.now() - ms;
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.touch();
  }

  get live(): boolean {
    return this.mode !== 'stop' && !!this.machine;
  }
}

export const engine = new Engine();
