// Alıştırma motoru: "şu davranışı yapan devreyi kur" türü görevler ve davranış denetleyicisi.
// Öğrencinin IL'i her senaryoda simulate() ile çalıştırılır; yalnızca görevde tanımlı çıkışlar denetlenir.
// Beklentiler yapıya değil davranışa bakar: örnek noktaları kenarlardan uzak seçilir, zamanlama toleranslıdır,
// değişmezler her taramada (izdeki her değişim anında) denetlenir. Böylece referanstan farklı kurulmuş
// doğru çözümler (SET/RST, başka zamanlayıcı, yardımcı röle gecikmesi) geçer.

import type { Diagnostic } from './diagnostics';
import { isBlocking } from './vm';
import { getProfile, type Profile } from './profiles';
import { parseEvents, simulate, type Change, type InputEvent } from './simulate';
import { EXERCISES } from './exercises/index';

export { EXERCISES };

/** Cihazın türü; iletilerde doğru fiil seçmek için ("lamba yandı", "motor durdu", "yıldız bıraktı") */
export type IoKind = 'buton' | 'anahtar' | 'sensor' | 'lamba' | 'motor' | 'kontaktor';

export interface ExerciseIo {
  /** "X0", "Y1" */
  dev: string;
  /** Kısa etiket; başlangıç IL'inde `#X0 start` satırı olur */
  label: string;
  kind: IoKind;
}

/** Örnek noktası: `t` anında `dev` şu değerde olmalı */
export interface Sample {
  /** ms */
  t: number;
  dev: string;
  v: 0 | 1;
  /** Kalırsa iletiye eklenen kısa yönlendirme cümlesi */
  note?: string;
}

/** Değişmez: senaryonun tamamında, her taramada sağlanmalı */
export type Invariant =
  | { kind: 'never'; dev: string; note?: string }
  | { kind: 'notBoth'; a: string; b: string; note?: string };

export type Edge = 'rise' | 'fall';

/** Zamanlama beklentisi: `after` olayından `delay` ± `tol` ms sonra `dev`'de `edge` olmalı */
export interface TimingExpect {
  after: { dev: string; edge: Edge; /** kaçıncı kenar (1'den), varsayılan 1 */ n?: number };
  dev: string;
  edge: Edge;
  /** ms */
  delay: number;
  /** ms */
  tol: number;
  note?: string;
}

export interface Scenario {
  /** Öğrenciye görünen ad: "start'a kısa bas, sonra stop" */
  name: string;
  /** parseEvents biçimi: "0:X0=1 200:X0=0 3s:X1=1" */
  events: string;
  /** ms */
  duration: number;
  samples: Sample[];
  invariants?: Invariant[];
  timing?: TimingExpect[];
}

export interface Exercise {
  /** Kalıcı kısa ad (sıra değişse de aynı kalır); CLI ve kayıtlarda bu kullanılır */
  id: string;
  title: string;
  level: 1 | 2 | 3;
  /** Öğrenciye görev metni (birkaç satır olabilir) */
  task: string;
  inputs: ExerciseIo[];
  outputs: ExerciseIo[];
  /** Yalnızca etiketler + görev özeti yorumu + END; çözüm içermez */
  starterIl: string;
  /** Gizli referans çözüm; öğrenciye gösterilmez */
  solutionIl: string;
  /** Kademeli ipuçları (1–3); sonuncusu bile çözümün tamamını vermez */
  hints: string[];
  scenarios: Scenario[];
}

export interface Failure {
  /** İletinin ilgili olduğu an (ms) */
  t: number;
  kind: 'sample' | 'invariant' | 'timing';
  /** İlgili cihazlar (arayüz vurgulamak için) */
  devs: string[];
  message: string;
}

export interface ScenarioResult {
  name: string;
  passed: boolean;
  /** Kaldıysa en erken başarısız beklentinin iletisi */
  message?: string;
  /** Tüm başarısızlıklar, zamana göre sıralı */
  failures: Failure[];
  events: InputEvent[];
  duration: number;
  /** İzlenen cihazlar: görevin girişleri + çıkışları */
  watch: string[];
  /** Öğrencinin izi (simulate() changes biçimi) */
  student: Change[];
  /** Referans çözümün izi */
  reference: Change[];
}

export interface CheckResult {
  passed: boolean;
  /** Program engelleyici hata yüzünden çalıştırılamadı (senaryolara girilmedi) */
  blocked: boolean;
  /** Programın tanılamaları (uyarılar dahil) */
  diagnostics: Diagnostic[];
  /** Genel ileti: "3 senaryonun 2'si geçti" ya da çalıştırılamama nedeni */
  message: string;
  scenarios: ScenarioResult[];
}

export interface CheckOptions {
  profile?: string | Profile;
  /** Tarama süresi (ms), varsayılan 10 */
  dt?: number;
}

/** "2,0 s" biçimi; gerekiyorsa iki ondalık ("0,25 s") */
export function fmtSeconds(ms: number): string {
  const s = ms / 1000;
  const txt = Math.abs(Math.round(s * 10) - s * 10) < 1e-9 ? s.toFixed(1) : s.toFixed(2);
  return txt.replace('.', ',') + ' s';
}

// --- iletilerde kullanılan sözcükler ---

const STATE: Record<IoKind, [string, string]> = {
  buton: ['bırakık', 'basılı'],
  anahtar: ['kapalı', 'açık'],
  sensor: ['görmüyor', 'görüyor'],
  lamba: ['sönük', 'yanık'],
  motor: ['duruyor', 'çalışıyor'],
  kontaktor: ['bırakık', 'çekik'],
};
const SHOULD: Record<IoKind, [string, string]> = {
  buton: ['bırakılmalıydı', 'basılmalıydı'],
  anahtar: ['kapanmalıydı', 'açılmalıydı'],
  sensor: ['boşalmalıydı', 'algılamalıydı'],
  lamba: ['sönmeliydi', 'yanmalıydı'],
  motor: ['durmalıydı', 'çalışmaya başlamalıydı'],
  kontaktor: ['bırakmalıydı', 'çekmeliydi'],
};
const DID: Record<IoKind, [string, string]> = {
  buton: ['bırakıldı', 'basıldı'],
  anahtar: ['kapandı', 'açıldı'],
  sensor: ['boşaldı', 'algıladı'],
  lamba: ['söndü', 'yandı'],
  motor: ['durdu', 'çalışmaya başladı'],
  kontaktor: ['bıraktı', 'çekti'],
};
const AFTER: Record<IoKind, [string, string]> = {
  buton: ['bırakıldıktan', 'basıldıktan'],
  anahtar: ['kapatıldıktan', 'açıldıktan'],
  sensor: ['boşaldıktan', 'algıladıktan'],
  lamba: ['söndükten', 'yandıktan'],
  motor: ['durduktan', 'çalışmaya başladıktan'],
  kontaktor: ['bıraktıktan', 'çektikten'],
};
const NEG: Record<IoKind, [string, string]> = {
  buton: ['bırakılmadı', 'basılmadı'],
  anahtar: ['kapanmadı', 'açılmadı'],
  sensor: ['boşalmadı', 'algılamadı'],
  lamba: ['sönmedi', 'yanmadı'],
  motor: ['durmadı', 'çalışmaya başlamadı'],
  kontaktor: ['bırakmadı', 'çekmedi'],
};
const NEVER: Record<IoKind, string> = {
  buton: 'basılmamalıydı',
  anahtar: 'açılmamalıydı',
  sensor: 'algılamamalıydı',
  lamba: 'yanmamalıydı',
  motor: 'çalışmamalıydı',
  kontaktor: 'çekmemeliydi',
};
const BOTH: Record<IoKind, string> = {
  buton: 'birlikte basılı kaldı',
  anahtar: 'birlikte açık kaldı',
  sensor: 'birlikte algıladı',
  lamba: 'birlikte yandı',
  motor: 'birlikte çalıştı',
  kontaktor: 'birlikte çekti',
};

function ioOf(ex: Exercise, dev: string): ExerciseIo {
  return ex.inputs.find((i) => i.dev === dev) ?? ex.outputs.find((o) => o.dev === dev) ?? { dev, label: '', kind: 'lamba' };
}
const nameOf = (io: ExerciseIo): string => (io.label ? `${io.dev} (${io.label})` : io.dev);
const withNote = (msg: string, note?: string): string => msg + '.' + (note ? ' ' + note : '');

// --- iz okuma ---

/** `dev`'in `t` anındaki değeri (t anındaki değişimler dahil) */
function levelAt(changes: Change[], dev: string, t: number): number {
  let v = 0;
  for (const c of changes) {
    if (c.t > t) break;
    if (c.dev === dev) v = c.v;
  }
  return v;
}

/** `dev`'in kenar anları (ms), sırayla */
function edgesOf(changes: Change[], dev: string, edge: Edge): number[] {
  const out: number[] = [];
  let v = 0;
  for (const c of changes) {
    if (c.dev !== dev) continue;
    if (c.v && !v && edge === 'rise') out.push(c.t);
    if (!c.v && v && edge === 'fall') out.push(c.t);
    v = c.v ? 1 : 0;
  }
  return out;
}

// --- beklentileri denetleme ---

function checkSamples(ex: Exercise, sc: Scenario, tr: Change[]): Failure[] {
  const out: Failure[] = [];
  for (const s of sc.samples) {
    const v = levelAt(tr, s.dev, s.t) ? 1 : 0;
    if (v === s.v) continue;
    const io = ioOf(ex, s.dev);
    const st = STATE[io.kind];
    out.push({
      t: s.t,
      kind: 'sample',
      devs: [s.dev],
      message: withNote(`${fmtSeconds(s.t)}'de ${nameOf(io)} ${st[s.v]} olmalıydı, ${st[v]}`, s.note),
    });
  }
  return out;
}

function checkInvariants(ex: Exercise, sc: Scenario, tr: Change[]): Failure[] {
  const out: Failure[] = [];
  for (const inv of sc.invariants ?? []) {
    // Cihazlar yalnızca izdeki anlarda değişir: her değişim anında (o andaki tüm değişimler uygulandıktan sonra) bakmak
    // her taramada bakmakla aynıdır.
    const cur = new Map<string, number>();
    let hit = -1;
    for (let i = 0; i < tr.length && hit < 0; ) {
      const t = tr[i]!.t;
      while (i < tr.length && tr[i]!.t === t) {
        cur.set(tr[i]!.dev, tr[i]!.v);
        i++;
      }
      const ok = inv.kind === 'never' ? !cur.get(inv.dev) : !(cur.get(inv.a) && cur.get(inv.b));
      if (!ok) hit = t;
    }
    if (hit < 0) continue;
    if (inv.kind === 'never') {
      const io = ioOf(ex, inv.dev);
      out.push({ t: hit, kind: 'invariant', devs: [inv.dev], message: withNote(`${fmtSeconds(hit)}'de ${nameOf(io)} ${DID[io.kind][1]}; bu senaryoda hiç ${NEVER[io.kind]}`, inv.note) });
    } else {
      const a = ioOf(ex, inv.a);
      const b = ioOf(ex, inv.b);
      out.push({ t: hit, kind: 'invariant', devs: [inv.a, inv.b], message: withNote(`${fmtSeconds(hit)}'de ${nameOf(a)} ve ${nameOf(b)} ${BOTH[a.kind]}`, inv.note) });
    }
  }
  return out;
}

function checkTiming(ex: Exercise, sc: Scenario, tr: Change[]): Failure[] {
  const out: Failure[] = [];
  for (const tm of sc.timing ?? []) {
    const trig = edgesOf(tr, tm.after.dev, tm.after.edge)[(tm.after.n ?? 1) - 1];
    const tio = ioOf(ex, tm.after.dev);
    const io = ioOf(ex, tm.dev);
    const ei = tm.edge === 'rise' ? 1 : 0;
    const ti = tm.after.edge === 'rise' ? 1 : 0;
    if (trig === undefined) {
      // Tetikleyici (çoğunlukla başka bir çıkış) hiç oluşmadı
      const msg = `${nameOf(tio)} hiç ${NEG[tio.kind][ti]}; ${nameOf(io)} ondan ${fmtSeconds(tm.delay)} sonra ${SHOULD[io.kind][ei]}`;
      // Asıl neden tetikleyicinin kendi beklentisidir; bu ileti onun önüne geçmesin diye sona konur
      out.push({ t: sc.duration, kind: 'timing', devs: [tm.after.dev, tm.dev], message: withNote(msg, tm.note) });
      continue;
    }
    const hit = edgesOf(tr, tm.dev, tm.edge).find((t) => t >= trig);
    if (hit !== undefined && Math.abs(hit - trig - tm.delay) <= tm.tol) continue;
    const head = `${nameOf(io)}, ${nameOf(tio)} ${AFTER[tio.kind][ti]} ${fmtSeconds(tm.delay)} sonra ${SHOULD[io.kind][ei]}`;
    const got = hit === undefined ? `hiç ${NEG[io.kind][ei]}` : `${fmtSeconds(hit - trig)} sonra ${DID[io.kind][ei]}`;
    out.push({ t: hit === undefined ? trig + tm.delay : Math.min(hit, trig + tm.delay), kind: 'timing', devs: [tm.dev], message: withNote(`${head}; ${got}`, tm.note) });
  }
  return out;
}

const KIND_ORDER: Record<Failure['kind'], number> = { timing: 0, invariant: 1, sample: 2 };

const blockingText =(ds: Diagnostic[], profile: Profile): string => {
  const d = ds.find((x) => isBlocking(x, profile));
  return d ? `satır ${d.line ?? '?'}: ${d.message}` : '';
};

/** Öğrencinin IL'ini alıştırmanın her senaryosunda çalıştırıp beklentilerle karşılaştırır. */
export function checkExercise(il: string, exercise: Exercise, opts: CheckOptions = {}): CheckResult {
  const profile = typeof opts.profile === 'object' ? opts.profile : getProfile(opts.profile);
  const dt = opts.dt ?? 10;
  const watch = [...exercise.inputs.map((i) => i.dev), ...exercise.outputs.map((o) => o.dev)];
  const scenarios: ScenarioResult[] = [];
  let diagnostics: Diagnostic[] = [];
  for (const sc of exercise.scenarios) {
    const events = parseEvents(sc.events);
    const run = (text: string) => simulate(text, { events, duration: sc.duration, dt, watch, profile });
    const st = run(il);
    diagnostics = st.diagnostics;
    if (!st.final) {
      return {
        passed: false,
        blocked: true,
        diagnostics,
        message: `Program çalıştırılamıyor (${blockingText(diagnostics, profile)}). Önce bu hatayı düzelt.`,
        scenarios: [],
      };
    }
    const ref = run(exercise.solutionIl);
    const outs = new Set(exercise.outputs.map((o) => o.dev));
    const failures = [...checkSamples(exercise, sc, st.changes), ...checkInvariants(exercise, sc, st.changes), ...checkTiming(exercise, sc, st.changes)]
      .filter((f) => f.devs.some((d) => outs.has(d)))
      // Aynı anda birden çok başarısızlık varsa nedeni en iyi anlatan önce: zamanlama, değişmez, örnek
      .sort((a, b) => a.t - b.t || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    const r: ScenarioResult = { name: sc.name, passed: !failures.length, failures, events, duration: sc.duration, watch, student: st.changes, reference: ref.changes };
    if (failures.length) r.message = failures[0]!.message;
    scenarios.push(r);
  }
  const ok = scenarios.filter((s) => s.passed).length;
  const passed = ok === scenarios.length;
  return {
    passed,
    blocked: false,
    diagnostics,
    message: passed ? `Tüm senaryolar geçti (${ok}/${scenarios.length}).` : `${scenarios.length} senaryonun ${ok} tanesi geçti.`,
    scenarios,
  };
}

/** Kimlikle alıştırma bul */
export function getExercise(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id);
}
