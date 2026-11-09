// Sürükle-bırak (pointer tabanlı; fare, kalem ve dokunmatik). Sürükleme başlayınca tüm geçerli bırakma
// noktaları ladder'da gösterilir; imlece en yakın nokta (mıknatıs yarıçapı içinde) seçilir ve ne olacağı
// etiketle yazılır. Ladder'daki parça sürüklenirse taşınır (Ctrl: kopyalanır); sol panele bırakılırsa silinir.

import { create } from 'zustand';
import { drop, remove, slotAccepts, slotLabel, type DragPayload, type Slot } from '../state/edit';
import { useStore } from '../state/store';

const SNAP = 64; // ekran px
const DRAG_START = 5;

export interface DragState {
  active: boolean;
  payload: DragPayload | null;
  name: string;
  x: number;
  y: number;
  valid: Slot[];
  hot: Slot | null;
  label: string;
  overTrash: boolean;
  inLadder: boolean;
  copy: boolean;
}
export const useDrag = create<DragState>(() => ({ active: false, payload: null, name: '', x: 0, y: 0, valid: [], hot: null, label: '', overTrash: false, inLadder: false, copy: false }));

/** Ladder görünümü kendini bırakma hedefi olarak kaydeder */
export interface DropTarget {
  svg: () => SVGSVGElement | null;
  wrap: () => HTMLElement | null;
  zoom: () => number;
  slots: () => Slot[];
}
let target: DropTarget | null = null;
export const registerTarget = (t: DropTarget | null): void => {
  target = t;
};
let trashEl: HTMLElement | null = null;
export const registerTrash = (el: HTMLElement | null): void => {
  trashEl = el;
};

/** Son sürüklemeden hemen sonra gelen tıklamayı yut (bırakma = tıklama sayılmasın) */
let suppressUntil = 0;
export const clickSuppressed = (): boolean => performance.now() < suppressUntil;

interface Pending {
  payload: DragPayload;
  name: string;
  sx: number;
  sy: number;
  started: boolean;
  raf: number;
}
let pend: Pending | null = null;

export function beginPointer(e: { clientX: number; clientY: number; button: number }, payload: DragPayload, name: string): void {
  if (e.button !== 0) return;
  pend = { payload, name, sx: e.clientX, sy: e.clientY, started: false, raf: 0 };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', onKey);
}

function start(): void {
  if (!pend || !target) return;
  const l = useStore.getState().doc.ladder;
  if (!l) {
    cancel();
    useStore.getState().showToast(useStore.getState().doc.ladderError ?? 'Ladder düzenlenemiyor', true);
    return;
  }
  pend.started = true;
  document.body.classList.add('dragging');
  const valid = target.slots().filter((s) => slotAccepts(l, s, pend!.payload));
  useDrag.setState({ active: true, payload: pend.payload, name: pend.name, valid, hot: null, label: '' });
  pend.raf = requestAnimationFrame(autoScroll);
}

function svgPoint(cx: number, cy: number): { x: number; y: number } | null {
  const svg = target?.svg();
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  const z = target!.zoom();
  return { x: (cx - r.left) / z, y: (cy - r.top) / z };
}

function nearest(px: number, py: number, valid: Slot[]): Slot | null {
  let best: Slot | null = null;
  let bd = SNAP / (target?.zoom() ?? 1);
  for (const s of valid) {
    let d: number;
    if (s.t === 'r') {
      if (px < s.x0 - 30 || px > s.x1 + 30) continue;
      d = Math.abs(py - s.y) * 1.6 + 4;
    } else d = Math.hypot(px - s.x, py - s.y);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

function update(x: number, y: number, copy: boolean): void {
  const st = useDrag.getState();
  if (!st.active || !st.payload) return;
  const inRect = (el: Element | null | undefined) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  const overTrash = st.payload.src === 'ladder' && inRect(trashEl);
  const inLadder = inRect(target?.wrap());
  const pt = svgPoint(x, y);
  const hot = !overTrash && inLadder && pt ? nearest(pt.x, pt.y, st.valid) : null;
  const n = useStore.getState().doc.ladder?.rungs.length ?? 0;
  useDrag.setState({ x, y, overTrash, inLadder, hot, copy, label: hot ? slotLabel(hot, st.payload, copy, n) : '' });
}

function onMove(e: PointerEvent): void {
  if (!pend) return;
  if (!pend.started) {
    if (Math.hypot(e.clientX - pend.sx, e.clientY - pend.sy) < DRAG_START) return;
    start();
    if (!pend?.started) return;
  }
  update(e.clientX, e.clientY, e.ctrlKey);
}

function autoScroll(): void {
  if (!pend?.started) return;
  const w = target?.wrap();
  const { x, y, copy } = useDrag.getState();
  if (w) {
    const r = w.getBoundingClientRect();
    const edge = 44;
    let dy = 0;
    let dx = 0;
    if (x > r.left && x < r.right) {
      if (y < r.top + edge && y > r.top - 30) dy = -Math.ceil((r.top + edge - y) / 4);
      else if (y > r.bottom - edge && y < r.bottom + 30) dy = Math.ceil((y - (r.bottom - edge)) / 4);
    }
    if (y > r.top && y < r.bottom) {
      if (x > r.right - edge && x < r.right + 30) dx = Math.ceil((x - (r.right - edge)) / 4);
      else if (x < r.left + edge && x > r.left - 10) dx = -Math.ceil((r.left + edge - x) / 4);
    }
    if (dx || dy) {
      w.scrollTop += dy;
      w.scrollLeft += dx;
      update(x, y, copy);
    }
  }
  pend.raf = requestAnimationFrame(autoScroll);
}

function end(): void {
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', cancel);
  window.removeEventListener('keydown', onKey);
  document.body.classList.remove('dragging');
  if (pend?.raf) cancelAnimationFrame(pend.raf);
  if (pend?.started) suppressUntil = performance.now() + 250;
  pend = null;
  useDrag.setState({ active: false, payload: null, valid: [], hot: null, overTrash: false, label: '' });
}

function cancel(): void {
  end();
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    cancel();
  } else if (e.key === 'Control') {
    const s = useDrag.getState();
    update(s.x, s.y, true);
  }
}

function onUp(e: PointerEvent): void {
  if (!pend) return;
  if (!pend.started) {
    end(); // yalnızca tıklama: normal click işler
    return;
  }
  const st = useDrag.getState();
  const p = st.payload!;
  const copy = e.ctrlKey;
  end();
  const store = useStore.getState();
  if (st.overTrash && p.src === 'ladder') {
    store.editLadder((l) => remove(l, p.id));
    store.showToast('Silindi. Geri almak için Ctrl+Z');
    return;
  }
  if (!st.hot) {
    if (p.src === 'palette') store.showToast('Bırakma noktası yoktu. Parçayı mavi noktalardan birine yaklaştır');
    return;
  }
  const hot = st.hot;
  store.editLadder((l) => drop(l, p, hot, copy));
  if (p.src === 'ladder') store.showToast(copy ? 'Kopyalandı' : 'Taşındı');
  else focusOperandSoon();
}

/** Silgi aracı: açıkken tıklanan parça silinir (Esc kapatır) */
export const useEraser = create<{ on: boolean; toggle: (v?: boolean) => void }>((set, get) => ({
  on: false,
  toggle: (v) => set({ on: v ?? !get().on }),
}));

/** Panodan yeni parça eklenince adres kutusuna odaklan (hızlı adres yazımı) */
export function focusOperandSoon(): void {
  setTimeout(() => {
    const el = document.getElementById('prop-op') as HTMLInputElement | null;
    if (el) {
      el.focus({ preventScroll: true });
      el.select();
    }
  }, 40);
}
