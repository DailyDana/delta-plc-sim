// Kalıcılık: localStorage, erişilemezse bellek (gömülü/gizli tarayıcılarda depolama kapalı olabilir).
// Şema sürümlüdür; v1 kayıtları (deltaPlcSim.*) ilk açılışta bir kez aktarılır, v1 anahtarlarına dokunulmaz.

export interface TabData {
  id: string;
  name: string;
  il: string;
  /** Son kaydedilen hâli (değişti mi göstergesi) */
  base: string;
  /** Bağlı olduğu kayıt adı */
  savedAs: string | null;
}

export interface LibEntry {
  il: string;
  savedAt: number;
}
export type Library = Record<string, LibEntry>;

export interface TabsData {
  v: 2;
  tabs: TabData[];
  active: number;
  seq: number;
}

const K = {
  tabs: 'dps2.tabs',
  lib: 'dps2.library',
  settings: 'dps2.settings',
  migrated: 'dps2.migratedV1',
  v1Tabs: 'deltaPlcSim.tabs',
  v1Lib: 'deltaPlcSim.library',
  v1Single: 'deltaPlcSim.il',
} as const;

const mem = new Map<string, string>();
let ok = true;

function probe(): boolean {
  try {
    const ls = window.localStorage;
    const k = 'dps2.__probe';
    ls.setItem(k, '1');
    const v = ls.getItem(k);
    ls.removeItem(k);
    return v === '1';
  } catch {
    return false;
  }
}
ok = typeof window !== 'undefined' && probe();

export const storage = {
  /** Kalıcı depolama çalışıyor mu? (false: yalnızca bu oturum) */
  get ok(): boolean {
    return ok;
  },
  get(k: string): string | null {
    if (ok) {
      try {
        return window.localStorage.getItem(k);
      } catch {
        ok = false;
      }
    }
    return mem.get(k) ?? null;
  },
  set(k: string, v: string): void {
    mem.set(k, v);
    if (!ok) return;
    try {
      window.localStorage.setItem(k, v);
    } catch {
      ok = false;
      listeners.forEach((f) => f());
    }
  },
  remove(k: string): void {
    mem.delete(k);
    if (!ok) return;
    try {
      window.localStorage.removeItem(k);
    } catch {
      ok = false;
    }
  },
};
const listeners = new Set<() => void>();
export const onStorageFail = (f: () => void): (() => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

function readJson<T>(k: string): T | null {
  const s = storage.get(k);
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

const isTab = (t: unknown): t is TabData =>
  !!t && typeof t === 'object' && typeof (t as TabData).il === 'string' && typeof (t as TabData).name === 'string';

function cleanTabs(raw: unknown): TabsData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { tabs?: unknown[]; active?: number; seq?: number };
  if (!Array.isArray(r.tabs)) return null;
  const tabs = r.tabs.filter(isTab).map((t) => ({
    id: typeof t.id === 'string' ? t.id : newId(),
    name: t.name,
    il: t.il,
    base: typeof t.base === 'string' ? t.base : t.il,
    savedAs: typeof t.savedAs === 'string' ? t.savedAs : null,
  }));
  if (!tabs.length) return null;
  return { v: 2, tabs, active: Math.max(0, Math.min(tabs.length - 1, r.active ?? 0)), seq: r.seq ?? tabs.length + 1 };
}

function cleanLib(raw: unknown): Library {
  const out: Library = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const e = v as LibEntry;
    if (e && typeof e.il === 'string') out[k] = { il: e.il, savedAt: typeof e.savedAt === 'number' ? e.savedAt : Date.now() };
  }
  return out;
}

export const newId = (): string => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export interface Loaded {
  tabs: TabsData | null;
  lib: Library;
  /** v1'den aktarılan sekme + kayıt sayısı (0: aktarım yok) */
  migrated: number;
}

/** Açılışta: v2 verisi; yoksa v1 verisini bir kez aktar. */
export function loadAll(): Loaded {
  let tabs = cleanTabs(readJson(K.tabs));
  let lib = cleanLib(readJson(K.lib));
  let migrated = 0;
  if (!storage.get(K.migrated)) {
    const v1Lib = cleanLib(readJson(K.v1Lib));
    for (const [k, v] of Object.entries(v1Lib)) {
      if (!lib[k]) {
        lib[k] = v;
        migrated++;
      }
    }
    if (!tabs) {
      tabs = cleanTabs(readJson(K.v1Tabs));
      if (tabs) migrated += tabs.tabs.length;
      else {
        const single = storage.get(K.v1Single);
        if (single) {
          tabs = { v: 2, tabs: [{ id: newId(), name: 'Devre 1', il: single, base: single, savedAs: null }], active: 0, seq: 2 };
          migrated++;
        }
      }
    }
    storage.set(K.migrated, String(Date.now()));
    if (migrated) {
      if (tabs) saveTabs(tabs);
      saveLib(lib);
    }
  }
  return { tabs, lib, migrated };
}

export const saveTabs = (t: TabsData): void => storage.set(K.tabs, JSON.stringify(t));
export const saveLib = (l: Library): void => storage.set(K.lib, JSON.stringify(l));
export const loadSettings = <T>(): Partial<T> => readJson<Partial<T>>(K.settings) ?? {};
export const saveSettings = (s: unknown): void => storage.set(K.settings, JSON.stringify(s));

/** .json yedeği (v1 ve v2 aynı biçim: { library: { ad: { il, savedAt } } }) */
export function parseBackup(text: string): Library | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const src = (data as { library?: unknown })?.library ?? data;
  const lib = cleanLib(src);
  return Object.keys(lib).length ? lib : null;
}
