// Zaman diyagramında gösterilen cihazlar: sekme başına hatırlanır (localStorage, yoksa bellek).
// Kullanıcı hiç değiştirmediyse seçim programdan türetilir: kullanılan X, Y, T, C (program değiştikçe güncellenir).

import { create } from 'zustand';
import { getProfile, instrDevices, formatAddress, type DevType, type IlProgram } from '../../core';
import { storage } from '../state/persist';
import { activeTab, useStore } from '../state/store';
import { setExtraKeys } from '../sim/recording';

const KEY = 'dps2.timing';
const MAX_TABS = 100;

function load(): Record<string, string[]> {
  try {
    const raw = JSON.parse(storage.get(KEY) ?? '{}') as Record<string, unknown>;
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(raw)) if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string');
    return out;
  } catch {
    return {};
  }
}

interface TimingState {
  /** sekme kimliği → kullanıcının seçtiği cihazlar (yoksa varsayılan) */
  sel: Record<string, string[]>;
  setFor(tabId: string, keys: string[] | null): void;
}

export const useTiming = create<TimingState>()((set, get) => ({
  sel: load(),
  setFor(tabId, keys) {
    const sel = { ...get().sel };
    delete sel[tabId];
    if (keys) sel[tabId] = keys;
    const ids = Object.keys(sel);
    if (ids.length > MAX_TABS) for (const id of ids.slice(0, ids.length - MAX_TABS)) delete sel[id];
    set({ sel });
    storage.set(KEY, JSON.stringify(sel));
  },
}));

/** Programda geçen cihazlar, türe göre sıralı */
export function programDevices(program: IlProgram, model: string): Record<DevType, string[]> {
  const profile = getProfile(model);
  const sets: Record<DevType, Set<number>> = { X: new Set(), Y: new Set(), M: new Set(), S: new Set(), T: new Set(), C: new Set(), D: new Set() };
  for (const it of program.instrs) {
    try {
      for (const a of instrDevices(it, profile)) sets[a.type].add(a.index);
    } catch {
      /* hatalı komut: atla */
    }
  }
  const out = {} as Record<DevType, string[]>;
  for (const t of Object.keys(sets) as DevType[]) out[t] = [...sets[t]].sort((a, b) => a - b).map((i) => formatAddress(t, i));
  return out;
}

/** Varsayılan seçim: kullanılan X, Y ve T/C kontakları */
export function defaultKeys(program: IlProgram, model: string): string[] {
  const u = programDevices(program, model);
  return [...u.X, ...u.Y, ...u.T, ...u.C];
}

/** Eklenebilecek cihaz önerileri: programdaki her şey + T/C değerleri */
export function candidateKeys(program: IlProgram, model: string): string[] {
  const u = programDevices(program, model);
  return [...u.X, ...u.Y, ...u.M, ...u.S, ...u.T, ...u.T.map((t) => t + '.v'), ...u.C, ...u.C.map((c) => c + '.v'), ...u.D];
}

/** Etkin sekmenin seçimi ve kullanıcı mı seçti */
export function useSelection(): { keys: string[]; custom: boolean; tabId: string } {
  const tabId = useStore((s) => activeTab(s).id);
  const program = useStore((s) => s.doc.program);
  const model = useStore((s) => s.settings.model);
  const saved = useTiming((s) => s.sel[tabId]);
  return { keys: saved ?? defaultKeys(program, model), custom: !!saved, tabId };
}

// Seçimdeki ama programda geçmeyen cihazlar da kaydedilsin (sekme değişince ya da seçim değişince)
function syncExtra(): void {
  const s = useStore.getState();
  const saved = useTiming.getState().sel[activeTab(s).id];
  setExtraKeys(saved ?? []);
}
useStore.subscribe(syncExtra);
useTiming.subscribe(syncExtra);
syncExtra();
