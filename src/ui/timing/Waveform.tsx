// Yeniden kullanılabilir zaman diyagramı görünümü. Girdi: iz (Trace) — sabit nesne ya da canlı kayıt için her
// karede çağrılan işlev — ve satır listesi. İsteğe bağlı ikinci iz (beklenen) aynı satırda kesikli çizilir,
// ayrışan aralıklar kırmızı zeminle vurgulanır (alıştırma modu).
//
// Çizim canvas'ta ve React'siz yapılır: canlı izde `subscribe` (motor kareleri) her karede draw() çağırır;
// satır başlıklarındaki değerler doğrudan DOM'a yazılır. React yalnızca satır/araç çubuğu değişince çizer.
//
// Etkileşim: tıkla = imleç (A, sonra B; ikisi varsa yakın olan taşınır), imleci sürükle, boş yeri sürükle =
// kaydır, Ctrl+tekerlek = yakınlaştır, Shift+tekerlek = kaydır. İmleç yakındaki kenara yapışır (Alt basılıysa
// yapışmaz). Esc imleçleri siler.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Download, Eraser, Maximize2, Radio, ZoomIn, ZoomOut } from 'lucide-react';
import { formatMs, snapToEdge, traceKeyName, type Trace } from '../../core';
import { drawAxis, drawRows, readPalette, tOf, valueText, xOf, type Cursors, type WaveGeom } from './draw';
import { downloadCanvas, renderPng } from './png';

export interface WaveRow {
  /** İz anahtarı: "X0", "Y0", "T0" (kontak), "T0.v" (değer), "D0" */
  key: string;
  /** Cihaz etiketi (#X0 start → "start") */
  label?: string;
}

export interface WaveformProps {
  rows: WaveRow[];
  /** İz ya da canlı iz kaynağı (her çizimde çağrılır) */
  trace: Trace | (() => Trace);
  /** Beklenen iz: aynı satırda kesikli çizilir */
  expected?: Trace | null;
  /** Ayrışan aralıkları vurgula (varsayılan: expected varsa açık) */
  showDiff?: boolean;
  /** Canlı kaynak: her yeni karede çağrılacak geri çağırmayı kaydeder, aboneliği bitiren işlev döner */
  subscribe?: (cb: () => void) => () => void;
  /** Başlangıç görünür süresi (ms); canlı izde varsayılan 10 s, sabit izde tamamı */
  initialSpan?: number;
  rowActions?: (row: WaveRow, i: number) => ReactNode;
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  /** PNG dosya adı ve başlığı */
  pngName?: string;
  pngTitle?: string;
  /** Satır yokken gösterilecek metin */
  emptyText?: ReactNode;
  /** Kayıt yokken (iz boş) çizim alanının üstünde gösterilecek ipucu */
  idleText?: ReactNode;
  rowH?: number;
}

const AXIS_H = 26;
const MIN_SPAN = 50;
const MAX_SPAN = 30 * 60 * 1000;
const SNAP_PX = 8;

export function Waveform(props: WaveformProps) {
  const { rows, expected = null, subscribe, rowActions } = props;
  const rowH = props.rowH ?? 30;
  const live = !!subscribe;
  const getTrace = useRef<() => Trace>(() => ({ start: 0, end: 0, signals: {} }));
  getTrace.current = typeof props.trace === 'function' ? props.trace : () => props.trace as Trace;

  const plotRef = useRef<HTMLDivElement>(null);
  const rowsCv = useRef<HTMLCanvasElement>(null);
  const axisCv = useRef<HTMLCanvasElement>(null);
  const valEls = useRef<(HTMLSpanElement | null)[]>([]);
  const nameEls = useRef<(HTMLDivElement | null)[]>([]);
  const idleRef = useRef<HTMLDivElement>(null);

  // görünüm durumu (React dışı; her karede okunur)
  const view = useRef({ span: props.initialSpan ?? 10000, t1: 0, follow: live, fitted: false, width: 0 });
  const cur = useRef<Cursors & { active: 'a' | 'b' }>({ a: null, b: null, active: 'a' });
  const geom = useRef<WaveGeom>({ width: 1, rowH, t0: 0, t1: 1 });
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const expRef = useRef(expected);
  expRef.current = expected;
  const diffRef = useRef(props.showDiff);
  diffRef.current = props.showDiff;

  const [follow, setFollow] = useState(live);
  const [meas, setMeas] = useState<Cursors>({ a: null, b: null });
  const [spanTxt, setSpanTxt] = useState('');

  const draw = useCallback(() => {
    const plot = plotRef.current;
    const rc = rowsCv.current;
    const ac = axisCv.current;
    if (!plot || !rc || !ac) return;
    const tr = getTrace.current();
    const v = view.current;
    const width = Math.max(1, plot.clientWidth);
    const total = Math.max(0, tr.end - tr.start);
    if (!live && !v.fitted) {
      // sabit iz: ilk açılışta tamamı
      v.span = Math.max(MIN_SPAN, props.initialSpan ?? Math.max(total, 1000));
      v.t1 = tr.start + v.span;
      v.fitted = true;
    }
    let t1: number;
    if (v.follow) t1 = Math.max(tr.end, tr.start + v.span);
    else {
      const maxT1 = Math.max(tr.end, tr.start + v.span);
      t1 = Math.min(Math.max(v.t1, tr.start + v.span * 0.1), maxT1 + v.span * 0.5);
    }
    v.t1 = t1;
    const g: WaveGeom = { width, rowH, t0: t1 - v.span, t1 };
    geom.current = g;
    const dpr = window.devicePixelRatio || 1;
    const rs = rowsRef.current;
    const h = Math.max(1, rs.length * rowH);
    const fit = (c: HTMLCanvasElement, w: number, hh: number) => {
      const W = Math.round(w * dpr);
      const H = Math.round(hh * dpr);
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
        c.style.width = w + 'px';
        c.style.height = hh + 'px';
      }
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    };
    const pal = readPalette(plot);
    const c = cur.current;
    drawRows(fit(rc, width, h), g, { rows: rs, trace: tr, expected: expRef.current, showDiff: diffRef.current, cursors: c }, pal);
    drawAxis(fit(ac, width, AXIS_H), g, AXIS_H, pal, c);
    rc.dataset.t0 = String(g.t0);
    rc.dataset.t1 = String(g.t1);
    rc.dataset.end = String(tr.end);
    // başlıklardaki değerler: etkin imleçte, imleç yoksa kaydın sonunda
    const at = (c.active === 'b' ? c.b : c.a) ?? c.a ?? c.b ?? tr.end;
    rs.forEach((r, i) => {
      const el = valEls.current[i];
      if (!el) return;
      const txt = valueText(r.key, tr.signals[r.key], at);
      if (el.textContent !== txt) el.textContent = txt;
      nameEls.current[i]?.classList.toggle('on', txt === '1');
    });
    if (idleRef.current) idleRef.current.hidden = total > 0 || Object.keys(tr.signals).length > 0;
  }, [live, rowH, props.initialSpan]);

  const syncUi = useCallback(() => {
    const v = view.current;
    setFollow(v.follow);
    setSpanTxt(formatMs(v.span));
    setMeas({ a: cur.current.a, b: cur.current.b });
  }, []);

  // canlı kaynak: her karede çiz
  useEffect(() => {
    draw();
    if (!subscribe) return;
    return subscribe(draw);
  }, [subscribe, draw]);

  // satırlar, beklenen iz ya da sabit iz değişince
  useLayoutEffect(() => {
    draw();
  }, [rows, expected, props.trace, props.showDiff, draw]);

  // boyut ve tema değişimi
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(plot);
    const mo = new MutationObserver(() => draw());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    syncUi();
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [draw, syncUi, rows.length > 0]);

  const zoom = (f: number, anchorX?: number) => {
    const v = view.current;
    const g = geom.current;
    const ns = Math.min(MAX_SPAN, Math.max(MIN_SPAN, v.span * f));
    if (anchorX === undefined || v.follow) {
      if (!v.follow) v.t1 = g.t1 - (g.t1 - g.t0) / 2 + ns / 2; // ortadan
    } else {
      const ta = tOf(g, anchorX);
      const frac = anchorX / g.width;
      v.t1 = ta + (1 - frac) * ns;
    }
    v.span = ns;
    draw();
    syncUi();
  };

  const fitAll = () => {
    const tr = getTrace.current();
    const v = view.current;
    v.span = Math.min(MAX_SPAN, Math.max(1000, tr.end - tr.start));
    v.t1 = tr.start + v.span;
    v.follow = live;
    draw();
    syncUi();
  };

  const goLive = () => {
    view.current.follow = true;
    draw();
    syncUi();
  };

  const clearCursors = () => {
    cur.current = { a: null, b: null, active: 'a' };
    draw();
    syncUi();
  };

  const exportPng = async () => {
    const g = geom.current;
    const cv = renderPng({
      title: props.pngTitle ?? 'Zaman diyagramı',
      rows: rowsRef.current,
      trace: getTrace.current(),
      expected: expRef.current,
      t0: g.t0,
      t1: g.t1,
      cursors: { a: cur.current.a, b: cur.current.b },
      plotWidth: Math.max(900, g.width),
      rowH,
    });
    await downloadCanvas(cv, props.pngName ?? 'zaman-diyagrami.png');
  };

  /** İmleç zamanı: kenara yapıştır (Alt: yapıştırma) */
  const snapAt = (x: number, y: number | null, noSnap: boolean): number => {
    const g = geom.current;
    const t = tOf(g, x);
    if (noSnap) return t;
    const rs = rowsRef.current;
    const ri = y === null ? -1 : Math.floor(y / rowH);
    const prefer = rs[ri]?.key;
    const tol = (SNAP_PX * (g.t1 - g.t0)) / g.width;
    return snapToEdge(getTrace.current(), rs.map((r) => r.key), t, tol, prefer).t;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, isAxis: boolean) => {
    if (e.button !== 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x0 = e.clientX - box.left;
    const yOf = (ev: { clientY: number }) => (isAxis ? null : ev.clientY - box.top);
    const g = geom.current;
    const c = cur.current;
    // imlecin üstünde mi?
    let dragCur: 'a' | 'b' | null = null;
    for (const k of ['b', 'a'] as const) {
      const t = c[k];
      if (t !== null && Math.abs(xOf(g, t) - x0) <= 6) dragCur = k;
    }
    const startT1 = view.current.t1;
    let moved = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    const target = e.currentTarget;
    const move = (ev: PointerEvent) => {
      const x = ev.clientX - box.left;
      if (Math.abs(x - x0) > 3) moved = true;
      if (!moved) return;
      if (dragCur) {
        cur.current[dragCur] = snapAt(x, yOf(ev), ev.altKey);
        cur.current.active = dragCur;
      } else {
        const gg = geom.current;
        const v = view.current;
        v.t1 = startT1 - ((x - x0) * (gg.t1 - gg.t0)) / gg.width;
        const tr = getTrace.current();
        v.follow = live && v.t1 >= Math.max(tr.end, tr.start + v.span) - 1e-6;
      }
      draw();
    };
    const up = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      if (!moved) {
        const t = snapAt(x0, yOf(ev), ev.altKey);
        const cc = cur.current;
        if (cc.a === null) (cc.a = t), (cc.active = 'a');
        else if (cc.b === null) (cc.b = t), (cc.active = 'b');
        else {
          const k = Math.abs(cc.a - t) <= Math.abs(cc.b - t) ? 'a' : 'b';
          cc[k] = t;
          cc.active = k;
        }
        draw();
      }
      syncUi();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      zoom(e.deltaY > 0 ? 1.25 : 0.8, e.clientX - box.left);
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const d = e.shiftKey ? e.deltaY || e.deltaX : e.deltaX;
      const g = geom.current;
      const v = view.current;
      v.t1 = g.t1 + (d * (g.t1 - g.t0)) / g.width;
      const tr = getTrace.current();
      v.follow = live && v.t1 >= Math.max(tr.end, tr.start + v.span) - 1e-6;
      draw();
      syncUi();
    }
  };

  // Ctrl+tekerlek sayfayı yakınlaştırmasın (React onWheel pasif)
  useEffect(() => {
    const plot = plotRef.current?.parentElement;
    if (!plot) return;
    const f = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    plot.addEventListener('wheel', f, { passive: false });
    return () => plot.removeEventListener('wheel', f);
  }, [rows.length > 0]);

  const { a, b } = meas;
  return (
    <div
      className="wave"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') clearCursors();
      }}
    >
      <div className="wave-bar" role="toolbar" aria-label="Zaman diyagramı araçları">
        {props.toolbarStart}
        {live && (
          <button
            className={'btn sm' + (follow ? ' wave-live' : '')}
            onClick={goLive}
            disabled={follow}
            title={follow ? 'Sona yapışık: yeni kayıt geldikçe kayar' : 'Canlı görünüme dön (sona yapış)'}
          >
            <Radio /> {follow ? 'Canlı' : 'Canlıya dön'}
          </button>
        )}
        <div className="wave-zoom">
          <button className="btn sm icon" onClick={() => zoom(1.6)} title="Uzaklaştır" aria-label="Uzaklaştır">
            <ZoomOut />
          </button>
          <span className="wave-span mono" title="Görünür süre">
            {spanTxt}
          </span>
          <button className="btn sm icon" onClick={() => zoom(1 / 1.6)} title="Yakınlaştır" aria-label="Yakınlaştır">
            <ZoomIn />
          </button>
          <button className="btn sm icon" onClick={fitAll} title="Kaydın tamamını göster" aria-label="Tamamını göster">
            <Maximize2 />
          </button>
        </div>
        <div className="wave-meas mono" aria-live="polite">
          {a === null && b === null ? (
            <span className="muted wave-tip">Tıkla: imleç A, tekrar tıkla: B</span>
          ) : (
            <>
              {a !== null && (
                <span className="ca" data-a={a}>
                  A {formatMs(a)}
                </span>
              )}
              {b !== null && (
                <span className="cb" data-b={b}>
                  B {formatMs(b)}
                </span>
              )}
              {a !== null && b !== null && (
                <b className="dt" data-dt={Math.abs(b - a)}>
                  Δt {formatMs(Math.abs(b - a))}
                </b>
              )}
              <button className="btn sm ghost icon" onClick={clearCursors} title="İmleçleri sil (Esc)" aria-label="İmleçleri sil">
                <Eraser />
              </button>
            </>
          )}
        </div>
        <div className="wave-tools">
          {props.toolbarEnd}
          <button className="btn sm" onClick={() => void exportPng()} title="Görünen aralığı PNG olarak indir (açık tema, baskıya uygun)">
            <Download /> PNG
          </button>
        </div>
      </div>
      {rows.length ? (
        <div className="wave-body">
          <div className="wave-grid" style={{ gridTemplateRows: `${AXIS_H}px ${rows.length * rowH}px` }}>
            <div className="wave-corner">Cihaz</div>
            <div className="wave-axis" onPointerDown={(e) => onPointerDown(e, true)} onWheel={onWheel}>
              <canvas ref={axisCv} />
            </div>
            <div className="wave-names">
              {rows.map((r, i) => (
                <div
                  key={r.key}
                  className="wave-name"
                  data-key={r.key}
                  style={{ height: rowH }}
                  ref={(el) => {
                    nameEls.current[i] = el;
                  }}
                  title={r.label ? `${traceKeyName(r.key)} · ${r.label}` : traceKeyName(r.key)}
                >
                  <span className="k">{traceKeyName(r.key)}</span>
                  {r.label && <span className="l">{r.label}</span>}
                  <span
                    className="v"
                    ref={(el) => {
                      valEls.current[i] = el;
                    }}
                  />
                  {rowActions && <span className="acts">{rowActions(r, i)}</span>}
                </div>
              ))}
            </div>
            <div className="wave-plot" ref={plotRef} onPointerDown={(e) => onPointerDown(e, false)} onWheel={onWheel}>
              <canvas ref={rowsCv} className="wave-rows" aria-label="Dalga biçimleri" />
              {props.idleText && (
                <div className="wave-idle" ref={idleRef}>
                  {props.idleText}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="hint" style={{ padding: 14 }}>
          {props.emptyText ?? 'Gösterilecek cihaz yok.'}
        </div>
      )}
    </div>
  );
}
