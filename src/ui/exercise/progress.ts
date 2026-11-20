// Alıştırma ilerlemesi ve sekme bağı için saf işlevler (React ve tarayıcı nesnesi kullanmaz; vitest ile sınanır).
// İlerleme tarayıcıda `dps2.exercises` anahtarında JSON olarak saklanır (persist.ts'teki korumalı sarmalayıcıyla).

export interface Progress {
  v: 1;
  /** Çözülen alıştırmalar: kimlik → ilk çözülme zamanı (ms) */
  solved: Record<string, number>;
  /** Öğrencinin son IL'i (başlangıç IL'iyle aynıysa saklanmaz) */
  il: Record<string, string>;
  /** Açılan ipucu sayısı */
  hints: Record<string, number>;
}

export const PROGRESS_KEY = 'dps2.exercises';

export const emptyProgress = (): Progress => ({ v: 1, solved: {}, il: {}, hints: {} });

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Saklanan metni oku; bozuksa ya da yoksa boş ilerleme. Bilinmeyen kimlikler (`known` verilirse) atılır. */
export function parseProgress(raw: string | null, known?: (id: string) => boolean): Progress {
  const p = emptyProgress();
  if (!raw) return p;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return p;
  }
  if (!isObj(data)) return p;
  const keep = (id: string) => !known || known(id);
  if (isObj(data.solved)) for (const [k, v] of Object.entries(data.solved)) if (keep(k) && typeof v === 'number') p.solved[k] = v;
  if (isObj(data.il)) for (const [k, v] of Object.entries(data.il)) if (keep(k) && typeof v === 'string') p.il[k] = v;
  if (isObj(data.hints)) for (const [k, v] of Object.entries(data.hints)) if (keep(k) && typeof v === 'number' && v > 0) p.hints[k] = Math.floor(v);
  return p;
}

/** Çözüldü işaretle (ilk çözülme zamanı korunur) */
export function markSolved(p: Progress, id: string, now: number): Progress {
  if (p.solved[id]) return p;
  return { ...p, solved: { ...p.solved, [id]: now } };
}

/** Öğrencinin IL'ini hatırla; başlangıç IL'ine dönülmüşse kaydı sil. Değişiklik yoksa aynı nesne döner. */
export function rememberIl(p: Progress, id: string, il: string, starter: string): Progress {
  const norm = (x: string) => x.replace(/\r/g, '').trim();
  if (norm(il) === norm(starter)) {
    if (!(id in p.il)) return p;
    const rest = { ...p.il };
    delete rest[id];
    return { ...p, il: rest };
  }
  if (p.il[id] === il) return p;
  return { ...p, il: { ...p.il, [id]: il } };
}

/** Bir sonraki ipucunu aç (en çok `total`) */
export function revealHint(p: Progress, id: string, total: number): Progress {
  const n = p.hints[id] ?? 0;
  if (n >= total) return p;
  return { ...p, hints: { ...p.hints, [id]: n + 1 } };
}

/** Alıştırma sekmesinde açılacak IL: öğrencinin kaldığı yer, yoksa başlangıç */
export const startIl = (ex: { id: string; starterIl: string }, p: Progress): string => p.il[ex.id] ?? ex.starterIl;

/** Alıştırmaya bağlı açık sekmenin sırası (yoksa -1) */
export const findExerciseTab = (tabs: readonly { exercise?: string | undefined }[], id: string): number => tabs.findIndex((t) => t.exercise === id);

/** Sekme adı */
export const exerciseTabName = (title: string): string => 'Alıştırma: ' + title;

/** "#alistirma=muhurleme" → "muhurleme"; başka bağlantı türleri ya da boş kimlik → null */
export function exerciseIdFromHash(hash: string): string | null {
  const h = hash.replace(/^#/, '');
  if (!h) return null;
  const v = new URLSearchParams(h).get('alistirma');
  return v && v.trim() ? v.trim() : null;
}

/** Sıradaki alıştırma: listede bundan sonraki ilk çözülmemiş; hepsi çözülmüşse bir sonraki; sonuncuysa null */
export function nextExerciseId(list: readonly { id: string }[], id: string, p?: Progress): string | null {
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return list[0]?.id ?? null;
  const after = list.slice(i + 1);
  const open = p ? after.find((e) => !p.solved[e.id]) : undefined;
  return open?.id ?? after[0]?.id ?? null;
}

/** Düzeye göre gruplu liste (sıra korunur) */
export function groupByLevel<T extends { level: number }>(list: readonly T[]): { level: number; items: T[] }[] {
  const out: { level: number; items: T[] }[] = [];
  for (const e of list) {
    let g = out.find((x) => x.level === e.level);
    if (!g) out.push((g = { level: e.level, items: [] }));
    g.items.push(e);
  }
  return out.sort((a, b) => a.level - b.level);
}
