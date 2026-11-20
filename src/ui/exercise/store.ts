// Alıştırma modu durumu: ilerleme (kalıcı), sekme başına son denetim sonucu ve seçili senaryo (geçici).
// Denetim checkExercise ile ayrı sanal makinelerde koşar; motorun RUN/STOP durumuna ve belleğine dokunmaz.
// Referans çözümün IL'i bu modülde tutulmaz ve dışarı verilmez; yalnızca denetim sonucundaki iz (reference) saklanır.

import { create } from 'zustand';
import { EXERCISES, checkExercise, getExercise, type CheckResult, type Exercise } from '../../core';
import { activeTab, useStore } from '../state/store';
import { storage } from '../state/persist';
import { PROGRESS_KEY, exerciseTabName, findExerciseTab, markSolved, nextExerciseId, parseProgress, rememberIl, revealHint, startIl, type Progress } from './progress';

/** Öğrenciye gösterilen alıştırma bilgisi: referans çözüm alanı bilerek yok */
export type PublicExercise = Omit<Exercise, 'solutionIl'>;

export function publicExercise(id: string | undefined): PublicExercise | null {
  const ex = id ? getExercise(id) : undefined;
  if (!ex) return null;
  const { solutionIl: _hidden, ...rest } = ex;
  void _hidden;
  return rest;
}

export const EXERCISE_LIST: { id: string; title: string; level: number }[] = EXERCISES.map((e) => ({ id: e.id, title: e.title, level: e.level }));

export interface CheckEntry {
  /** Denetlenen IL (sonradan değiştiyse sonuç "eski" gösterilir) */
  il: string;
  model: string;
  result: CheckResult;
  /** Denetim sıra numarası (görünümleri yenilemek için) */
  seq: number;
}

let checkSeq = 0;

interface ExState {
  progress: Progress;
  /** Sekme kimliği → son denetim */
  results: Record<string, CheckEntry>;
  /** Sekme kimliği → karşılaştırması açık senaryo */
  scenario: Record<string, number>;
  /** Görev paneli daraltıldı mı */
  collapsed: boolean;
  setCollapsed(v: boolean): void;
  selectScenario(tabId: string, i: number): void;
}

const known = (id: string) => !!getExercise(id);
const loadProgress = (): Progress => parseProgress(storage.get(PROGRESS_KEY), known);

export const useExercises = create<ExState>()((set) => ({
  progress: loadProgress(),
  results: {},
  scenario: {},
  collapsed: false,
  setCollapsed: (v) => set({ collapsed: v }),
  selectScenario: (tabId, i) => set((s) => ({ scenario: { ...s.scenario, [tabId]: i } })),
}));

function setProgress(p: Progress): void {
  if (p === useExercises.getState().progress) return;
  useExercises.setState({ progress: p });
  storage.set(PROGRESS_KEY, JSON.stringify(p));
  if (useStore.getState().storageOk !== storage.ok) useStore.setState({ storageOk: storage.ok });
}

// Alıştırma sekmelerinin IL'i değiştikçe ilerlemeye yaz (yenilemede ve sekme kapansa da kalsın)
useStore.subscribe((s, prev) => {
  if (s.tabs === prev.tabs) return;
  let p = useExercises.getState().progress;
  for (const t of s.tabs) {
    if (!t.exercise) continue;
    const ex = getExercise(t.exercise);
    if (ex) p = rememberIl(p, ex.id, t.il, ex.starterIl);
  }
  setProgress(p);
});

/** Etkin sekmenin alıştırması (yoksa null) */
export const activeExerciseId = (): string | null => activeTab(useStore.getState()).exercise ?? null;

/** Alıştırmayı aç: zaten açıksa o sekmeye geç, değilse kaldığı (ya da başlangıç) IL'iyle yeni sekmede aç */
export function openExercise(id: string): boolean {
  const ex = getExercise(id);
  const s = useStore.getState();
  if (!ex) {
    s.showToast(`Alıştırma bulunamadı: ${id}`, true);
    return false;
  }
  const i = findExerciseTab(s.tabs, id);
  if (i >= 0) s.switchTab(i);
  else s.openInNewTab(exerciseTabName(ex.title), startIl(ex, useExercises.getState().progress), null, { exercise: id });
  return true;
}

/** Etkin alıştırma sekmesini denetle; sonucu sekmeye kaydet, geçtiyse çözüldü işaretle */
export function checkActive(): CheckEntry | null {
  const s = useStore.getState();
  const tab = activeTab(s);
  const ex = tab.exercise ? getExercise(tab.exercise) : undefined;
  if (!ex) return null;
  const result = checkExercise(tab.il, ex, { profile: s.settings.model });
  const entry: CheckEntry = { il: tab.il, model: s.settings.model, result, seq: ++checkSeq };
  const st = useExercises.getState();
  // önceki seçim geçerliyse korunur; yoksa ilk kalan senaryo
  const firstBad = result.scenarios.findIndex((x) => !x.passed);
  const prevSel = st.scenario[tab.id];
  const sel = prevSel !== undefined && prevSel < result.scenarios.length ? prevSel : Math.max(0, firstBad);
  useExercises.setState({ results: { ...st.results, [tab.id]: entry }, scenario: { ...st.scenario, [tab.id]: sel } });
  if (result.passed) setProgress(markSolved(useExercises.getState().progress, ex.id, Date.now()));
  return entry;
}

/** Sonraki ipucunu aç */
export function nextHint(): void {
  const id = activeExerciseId();
  const ex = id ? getExercise(id) : undefined;
  if (!ex) return;
  setProgress(revealHint(useExercises.getState().progress, ex.id, ex.hints.length));
}

/** Etkin sekmeyi başlangıç IL'ine döndür (geri alınabilir); son sonuç silinir */
export function restartActive(): void {
  const s = useStore.getState();
  const tab = activeTab(s);
  const ex = tab.exercise ? getExercise(tab.exercise) : undefined;
  if (!ex) return;
  s.setIlText(ex.starterIl, false); // ayrı geri alma adımı
  const st = useExercises.getState();
  const results = { ...st.results };
  delete results[tab.id];
  useExercises.setState({ results });
}

/** Sıradaki alıştırmanın kimliği */
export const nextOf = (id: string): string | null => nextExerciseId(EXERCISES, id, useExercises.getState().progress);
