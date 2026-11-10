// Uygulama durumu (Zustand). Her sekmenin asıl verisi IL metnidir; ladder ağacı ondan türetilir.
// Ladder'dan yapılan düzenlemelerde ağaç (kimlikleriyle) korunur ve IL ondan yeniden yazılır;
// IL düzenleyicisinden yapılan düzenlemelerde ağaç IL'den yeniden kurulur.

import { create } from 'zustand';
import {
  DEFAULT_PROFILE_ID,
  EXAMPLES,
  analyze,
  cloneLadder,
  getProfile,
  ilToLadder,
  ladderToIl,
  mapProgramToLadder,
  parseIl,
  type Diagnostic,
  type IlProgram,
  type Ladder,
} from '../../core';
import { newRung } from './edit';
import { engine } from '../sim/engine';
import { loadAll, loadSettings, newId, saveLib, saveSettings, saveTabs, storage, type Library, type TabData } from './persist';

export type Theme = 'light' | 'dark';
export type BottomTab = 'il' | 'watch' | 'problems';
export type LeftTab = 'parts' | 'project';

export interface Settings {
  theme: Theme;
  model: string;
  speed: number;
  zoom: number;
  xMode: 'push' | 'toggle';
  leftW: number;
  rightW: number;
  bottomH: number;
  bottomTab: BottomTab;
  leftTab: LeftTab;
  bottomOpen: boolean;
}

const prefersDark = (): boolean => {
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  model: DEFAULT_PROFILE_ID,
  speed: 1,
  zoom: 1,
  xMode: 'push',
  leftW: 232,
  rightW: 300,
  bottomH: 250,
  bottomTab: 'il',
  leftTab: 'parts',
  bottomOpen: true,
};

/** Yapısı bozuk IL ladder'a çevrilmez (düzenleme satırı sessizce düşürmesin) */
const STRUCTURAL = new Set(['E_UNKNOWN_OP', 'E_NEED_LOAD', 'E_OPEN_BLOCK', 'E_BLOCK_UNDERFLOW', 'E_MPS_UNDERFLOW', 'E_MPS_DEPTH']);

export interface Doc {
  il: string;
  ladder: Ladder | null;
  program: IlProgram;
  diagnostics: Diagnostic[];
  /** Ladder öğesi id'si → komut sırası (canlı akım için); eşleme kurulamadıysa boş */
  instrOf: Map<string, number>;
  /** Ladder'a çevrilemiyorsa nedeni */
  ladderError: string | null;
}

export function deriveDoc(il: string, model: string, keep?: Ladder | null): Doc {
  const profile = getProfile(model);
  const parsed = parseIl(il, profile);
  const an = analyze(parsed.program);
  const diagnostics = [...parsed.diagnostics, ...an.diagnostics];
  let ladder: Ladder | null = keep ?? null;
  let fromIl: Map<string, number> | null = null;
  let ladderError: string | null = null;
  if (!ladder) {
    if (diagnostics.some((d) => STRUCTURAL.has(d.code))) ladderError = 'IL\'de yapı hatası var; ladder görünümü için önce Sorunlar\'daki hataları düzelt.';
    else {
      const conv = ilToLadder(parsed.program);
      diagnostics.push(...conv.diagnostics);
      ladder = conv.ladder;
      fromIl = conv.instrOf;
      if (!ladder) ladderError = conv.diagnostics[0]?.message ?? 'Bu IL ladder olarak gösterilemiyor.';
    }
  }
  diagnostics.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  // Eşleme: IL'den kurulan ağaçta dönüşüm sırasında kaydedilen kaynak; düzenleyici ağacında üretilen IL ile karşılaştırma
  let instrOf = new Map<string, number>();
  if (ladder && fromIl) instrOf = fromIl;
  else if (ladder) {
    const refs = mapProgramToLadder(parsed.program, ladder, profile);
    refs?.forEach((id, i) => id && instrOf.set(id, i));
  }
  return { il, ladder, program: parsed.program, diagnostics, instrOf, ladderError };
}

interface History {
  undo: string[];
  redo: string[];
  lastT: number;
}

export interface ToastMsg {
  id: number;
  text: string;
  bad: boolean;
}

export interface State {
  tabs: TabData[];
  active: number;
  seq: number;
  lib: Library;
  settings: Settings;
  doc: Doc;
  sel: string | null;
  hist: Record<string, History>;
  toast: ToastMsg | null;
  storageOk: boolean;
  migrated: number;
  paletteOpen: boolean;
  helpOpen: boolean;
  libOpen: boolean;

  // düzenleme
  setIlText(text: string): void;
  applyLadder(l: Ladder, sel?: string | null, coalesce?: boolean): void;
  editLadder(fn: (l: Ladder) => string | null | void | { sel: string | null; refuse?: string }, coalesce?: boolean): void;
  select(id: string | null): void;
  undo(): void;
  redo(): void;
  // sekmeler
  switchTab(i: number): void;
  openInNewTab(name: string, il: string, savedAs?: string | null): void;
  newBlankTab(): void;
  removeTab(i: number): void;
  renameTab(i: number, name: string): void;
  moveTab(from: number, to: number): void;
  /** Sekme listesini toplu değiştir (kayıt adı değişimi vb.) ve kaydet */
  patchTabs(fn: (tabs: TabData[]) => TabData[]): void;
  // kayıtlar
  saveAs(name: string): void;
  setLib(lib: Library): void;
  // ayarlar ve arayüz
  set<K extends keyof Settings>(k: K, v: Settings[K]): void;
  showToast(text: string, bad?: boolean): void;
  setUi(p: Partial<Pick<State, 'paletteOpen' | 'helpOpen' | 'libOpen'>>): void;
}

const blankIl = (): string => ladderToIl({ rungs: [newRung({ rungs: [], labels: {} })], labels: {} });

function initial() {
  const loaded = loadAll();
  const settings: Settings = { ...DEFAULT_SETTINGS, theme: prefersDark() ? 'dark' : 'light', ...loadSettings<Settings>() };
  if (!getProfile(settings.model) || getProfile(settings.model).id !== settings.model) settings.model = DEFAULT_PROFILE_ID;
  let tabs = loaded.tabs?.tabs ?? [];
  let active = loaded.tabs?.active ?? 0;
  if (!tabs.length) {
    const ex = EXAMPLES[0]!;
    tabs = [{ id: newId(), name: ex.name, il: ex.il, base: ex.il, savedAs: null }];
    active = 0;
  }
  return { tabs, active, seq: loaded.tabs?.seq ?? tabs.length + 1, lib: loaded.lib, settings, migrated: loaded.migrated };
}

const init = initial();
const firstDoc = deriveDoc(init.tabs[init.active]!.il, init.settings.model);
engine.load(firstDoc.il, init.settings.model, { fresh: true });
engine.speed = init.settings.speed;

let toastSeq = 1;

export const useStore = create<State>()((set, get) => {
  const persistTabs = () => {
    const s = get();
    saveTabs({ v: 2, tabs: s.tabs, active: s.active, seq: s.seq });
  };

  /** Etkin sekmenin IL'ini değiştir: geçmiş, sekme, motor, kalıcılık */
  const commitIl = (il: string, doc: Doc, sel: string | null, coalesce: boolean) => {
    const s = get();
    const tab = s.tabs[s.active]!;
    if (il === tab.il && doc.ladder === s.doc.ladder) {
      set({ sel });
      return;
    }
    const h = s.hist[tab.id] ?? { undo: [], redo: [], lastT: 0 };
    const now = Date.now();
    let undo = h.undo;
    if (il !== tab.il && !(coalesce && now - h.lastT < 1000 && undo.length)) {
      undo = [...undo, tab.il];
      if (undo.length > 200) undo = undo.slice(-200);
    }
    const tabs = s.tabs.slice();
    tabs[s.active] = { ...tab, il };
    set({ tabs, doc, sel, hist: { ...s.hist, [tab.id]: { undo, redo: il !== tab.il ? [] : h.redo, lastT: coalesce ? now : 0 } } });
    engine.load(il, s.settings.model);
    persistTabs();
  };

  const loadActive = (tabs: TabData[], active: number) => {
    const s = get();
    const t = tabs[active]!;
    const doc = deriveDoc(t.il, s.settings.model);
    engine.load(t.il, s.settings.model, { fresh: true });
    set({ tabs, active, doc, sel: null });
    persistTabs();
  };

  return {
    ...init,
    doc: firstDoc,
    sel: null,
    hist: {},
    toast: null,
    storageOk: storage.ok,
    paletteOpen: false,
    helpOpen: false,
    libOpen: false,

    setIlText(text) {
      const doc = deriveDoc(text, get().settings.model);
      const sel = doc.ladder && get().sel ? null : get().sel;
      commitIl(text, doc, sel, true);
    },

    applyLadder(l, sel = get().sel, coalesce = false) {
      const il = ladderToIl(l);
      const doc = deriveDoc(il, get().settings.model, l);
      commitIl(il, doc, sel ?? null, coalesce);
    },

    editLadder(fn, coalesce = false) {
      const s = get();
      if (!s.doc.ladder) {
        s.showToast(s.doc.ladderError ?? 'Ladder düzenlenemiyor', true);
        return;
      }
      const l = cloneLadder(s.doc.ladder);
      const r = fn(l);
      let sel = s.sel;
      if (typeof r === 'string' || r === null) sel = r;
      else if (r && typeof r === 'object') {
        if (r.refuse) {
          s.showToast(r.refuse, true);
          return;
        }
        sel = r.sel;
      }
      get().applyLadder(l, sel, coalesce);
    },

    select(id) {
      if (get().sel !== id) set({ sel: id });
    },

    undo() {
      const s = get();
      const tab = s.tabs[s.active]!;
      const h = s.hist[tab.id];
      if (!h || !h.undo.length) return s.showToast('Geri alınacak adım yok');
      const prev = h.undo[h.undo.length - 1]!;
      const tabs = s.tabs.slice();
      tabs[s.active] = { ...tab, il: prev };
      set({ tabs, doc: deriveDoc(prev, s.settings.model), sel: null, hist: { ...s.hist, [tab.id]: { undo: h.undo.slice(0, -1), redo: [...h.redo, tab.il], lastT: 0 } } });
      engine.load(prev, s.settings.model);
      persistTabs();
    },

    redo() {
      const s = get();
      const tab = s.tabs[s.active]!;
      const h = s.hist[tab.id];
      if (!h || !h.redo.length) return s.showToast('Yinelenecek adım yok');
      const next = h.redo[h.redo.length - 1]!;
      const tabs = s.tabs.slice();
      tabs[s.active] = { ...tab, il: next };
      set({ tabs, doc: deriveDoc(next, s.settings.model), sel: null, hist: { ...s.hist, [tab.id]: { undo: [...h.undo, tab.il], redo: h.redo.slice(0, -1), lastT: 0 } } });
      engine.load(next, s.settings.model);
      persistTabs();
    },

    switchTab(i) {
      const s = get();
      if (i === s.active || !s.tabs[i]) return;
      loadActive(s.tabs, i);
    },

    openInNewTab(name, il, savedAs = null) {
      const s = get();
      const tabs = [...s.tabs, { id: newId(), name, il, base: il, savedAs }];
      loadActive(tabs, tabs.length - 1);
    },

    newBlankTab() {
      const s = get();
      set({ seq: s.seq + 1 });
      get().openInNewTab('Yeni devre ' + s.seq, blankIl());
    },

    removeTab(i) {
      const s = get();
      if (!s.tabs[i]) return;
      const tabs = s.tabs.filter((_, j) => j !== i);
      if (!tabs.length) {
        const il = blankIl();
        loadActive([{ id: newId(), name: 'Yeni devre ' + s.seq, il, base: il, savedAs: null }], 0);
        set({ seq: s.seq + 1 });
        return;
      }
      if (i < s.active) {
        set({ tabs, active: s.active - 1 });
        persistTabs();
      } else if (i === s.active) loadActive(tabs, Math.min(i, tabs.length - 1));
      else {
        set({ tabs });
        persistTabs();
      }
    },

    renameTab(i, name) {
      const s = get();
      if (!s.tabs[i] || !name.trim()) return;
      const tabs = s.tabs.slice();
      tabs[i] = { ...tabs[i]!, name: name.trim() };
      set({ tabs });
      persistTabs();
    },

    moveTab(from, to) {
      const s = get();
      if (from === to || !s.tabs[from] || to < 0 || to >= s.tabs.length) return;
      const tabs = s.tabs.slice();
      const [t] = tabs.splice(from, 1);
      tabs.splice(to, 0, t!);
      const activeId = s.tabs[s.active]!.id;
      set({ tabs, active: tabs.findIndex((x) => x.id === activeId) });
      persistTabs();
    },

    patchTabs(fn) {
      set({ tabs: fn(get().tabs) });
      persistTabs();
    },

    saveAs(name) {
      const s = get();
      const tab = s.tabs[s.active]!;
      const lib = { ...s.lib, [name]: { il: tab.il, savedAt: Date.now() } };
      const tabs = s.tabs.slice();
      tabs[s.active] = { ...tab, name, savedAs: name, base: tab.il };
      set({ lib, tabs });
      saveLib(lib);
      persistTabs();
      s.showToast(storage.ok ? `Kaydedildi: ${name}` : `Kaydedildi (yalnızca bu oturumda): ${name}`, !storage.ok);
      set({ storageOk: storage.ok });
    },

    setLib(lib) {
      set({ lib });
      saveLib(lib);
      set({ storageOk: storage.ok });
    },

    set(k, v) {
      const s = get();
      const settings = { ...s.settings, [k]: v };
      set({ settings });
      saveSettings(settings);
      if (k === 'theme') document.documentElement.dataset.theme = v as Theme;
      if (k === 'speed') engine.setSpeed(v as number);
      if (k === 'model') {
        // Model değişince adres aralıkları ve zamanlayıcı tabanları değişir: yeniden doğrula, STOP'tan başla
        const doc = deriveDoc(s.doc.il, v as string);
        engine.load(s.doc.il, v as string, { fresh: true });
        set({ doc, sel: null });
      }
    },

    showToast(text, bad = false) {
      set({ toast: { id: toastSeq++, text, bad } });
    },

    setUi(p) {
      set(p);
    },
  };
});

/** Etkin sekme */
export const activeTab = (s: State): TabData => s.tabs[s.active]!;
export const isDirty = (t: TabData): boolean => t.il !== t.base;
