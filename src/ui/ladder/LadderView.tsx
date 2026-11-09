// Ladder tuvali: sahneyi SVG olarak çizer; seçim, klavye gezintisi, hızlı ekleme, sürükle-bırak ve
// canlı akım. Canlı görünüm React yeniden çizimi olmadan doğrudan DOM sınıflarıyla güncellenir.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Scan } from 'lucide-react';
import { checkInstrOperands, getProfile, parseAddress, timerRange, type Coil, type Ladder } from '../../core';
import { CONTACT_MNEMONICS } from '../../core/instructions';
import { useStore } from '../state/store';
import { apply, locate, newRung, pasteClip, remove, takeClip, type Clip } from '../state/edit';
import { ladderToIl } from '../../core';
import { engine } from '../sim/engine';
import { useFrame } from '../sim/useLive';
import { beginPointer, clickSuppressed, registerTarget, useDrag, useEraser } from './drag';
import { COILW, CW, LEFT, RH, layout, type Scene } from './layout';
import { computePower } from './power';
import { applyQuick, parseQuick } from './quick';

/** Uygulama içi pano (sekmeler arası da geçerli) */
let clip: Clip | null = null;

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function coilText(c: Coil): string {
  if (c.type === 'TMR' || c.type === 'CNT') {
    const k = parseInt(c.k, 10);
    return `${c.type} ${c.op || '?'} K${Number.isNaN(k) ? '?' : k}`;
  }
  return `${c.type} ${c.op || '?'}`;
}

interface SvgProps {
  sc: Scene;
  ladder: Ladder;
  sel: string | null;
  model: string;
}

/** Statik sahne (seçim dışında yalnızca program değişince yeniden çizilir) */
const SceneSvg = memo(function SceneSvg({ sc, ladder, sel, model }: SvgProps) {
  const profile = getProfile(model);
  const labels = ladder.labels;
  const lbl = (op: string) => labels[op.toUpperCase()] ?? labels[op] ?? '';
  const selRung = sel ? locate(ladder, sel)?.ri ?? -1 : -1;
  return (
    <g>
      {sc.rungs.map((r) => (
        <g key={r.id}>
          <rect className={'rungbg' + (sel === r.id ? ' sel' : '')} data-sel={r.id} x={2} y={r.y} width={sc.rightX + 8} height={r.h} />
          <text className={'rnum' + (selRung === r.ri ? ' sel' : '')} data-sel={r.id} x={LEFT - 12} y={r.top + RH / 2 + 4} textAnchor="end">
            {r.ri + 1}
            <title>{`Satır ${r.ri + 1}: tıkla, satır işlemleri`}</title>
          </text>
          {r.comment && (
            <text className="rcom" x={LEFT + 8} y={r.y + 15}>
              {trunc(r.comment.split('\n')[0]!, 90)}
            </text>
          )}
        </g>
      ))}
      {sc.wires.map((w, i) => (
        <line key={i} className={'w' + (w.pw ? '' : ' off')} data-pw={w.pw} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} />
      ))}
      {sc.contacts.map((c) => {
        const m = c.x + CW / 2;
        const cy = c.cy;
        const bad = checkInstrOperands(CONTACT_MNEMONICS[c.kind][0], [c.op], profile)[0];
        const l = lbl(c.op) || (/^M10(0\d|1[0-4])$/.test(c.op.toUpperCase()) ? 'özel röle' : '');
        return (
          <g key={c.id}>
            <g className="ct" data-cl={c.id}>
              <rect className="face" x={m - 10} y={cy - 14} width={20} height={28} />
              <line className="bar" x1={m - 10} y1={cy - 15} x2={m - 10} y2={cy + 15} />
              <line className="bar" x1={m + 10} y1={cy - 15} x2={m + 10} y2={cy + 15} />
              {c.kind === 'NC' && <line className="slash" x1={m - 15} y1={cy + 13} x2={m + 15} y2={cy - 13} />}
              {c.kind === 'P' && <path className="slash" fill="none" d={`M${m} ${cy + 7}V${cy - 7}M${m - 4} ${cy - 3}L${m} ${cy - 7}l4 4`} />}
              {c.kind === 'F' && <path className="slash" fill="none" d={`M${m} ${cy - 7}V${cy + 7}M${m - 4} ${cy + 3}L${m} ${cy + 7}l4 -4`} />}
            </g>
            <text className={'op' + (bad ? ' bad' : '')} x={m} y={cy - 21} textAnchor="middle">
              {c.op || '?'}
            </text>
            {l && (
              <text className="lbl" x={m} y={cy + 30} textAnchor="middle">
                {trunc(l, 14)}
              </text>
            )}
            <rect className={'hit' + (sel === c.id ? ' sel' : '')} data-sel={c.id} data-g="c" x={c.x + 4} y={cy - RH / 2 + 2} width={CW - 8} height={RH - 4}>
              <title>{`${c.op}${bad ? ' — ' + bad.message : ''}\nTıkla: düzenle · sürükle: taşı (Ctrl: kopyala)`}</title>
            </rect>
          </g>
        );
      })}
      {sc.coils.map((o) => {
        const c = o.coil;
        const cy = o.cy;
        const x = o.x;
        const ops = c.type === 'TMR' || c.type === 'CNT' ? [c.op, c.k] : [c.op];
        const bad = checkInstrOperands(c.type, ops, profile)[0];
        const l = lbl(c.op);
        const isOut = c.type === 'OUT';
        const m = x + COILW / 2;
        const tc = (c.type === 'TMR' || c.type === 'CNT') && parseAddress(c.op).addr;
        return (
          <g key={o.id}>
            {isOut ? (
              <>
                <line className="w" data-pw={o.id + ':q'} x1={x} y1={cy} x2={m - 13} y2={cy} />
                <g className="coil" data-q={o.id}>
                  <circle className="core" cx={m} cy={cy} r={11} />
                  <path className="ring" d={`M${m - 7},${cy - 14} Q${m - 16},${cy} ${m - 7},${cy + 14} M${m + 7},${cy - 14} Q${m + 16},${cy} ${m + 7},${cy + 14}`} />
                </g>
                <line className="w off" x1={m + 13} y1={cy} x2={sc.rightX} y2={cy} />
                <text className={'op' + (bad ? ' bad' : '')} x={m} y={cy - 21} textAnchor="middle">
                  {c.op || '?'}
                </text>
                {l && (
                  <text className="lbl" x={m} y={cy + 30} textAnchor="middle">
                    {trunc(l, 24)}
                  </text>
                )}
              </>
            ) : (
              <>
                <line className="w" data-pw={o.id + ':q'} x1={x} y1={cy} x2={x + 6} y2={cy} />
                <g className="coil" data-q={o.id}>
                  <rect className="box" x={x + 6} y={cy - 15} width={COILW - 12} height={30} rx={3} />
                </g>
                <text className={'boxt' + (bad ? ' op bad' : '')} x={m} y={cy + 5} textAnchor="middle">
                  {coilText(c)}
                </text>
                <line className="w off" x1={x + COILW - 6} y1={cy} x2={sc.rightX} y2={cy} />
                {tc && (
                  <>
                    <rect className="tvbar" x={x + 14} y={cy + 17} width={COILW - 28} height={3} rx={1.5} />
                    <rect className="tvfill" data-tvbar={c.op.toUpperCase()} x={x + 14} y={cy + 17} width={0} height={3} rx={1.5} />
                    <text className="tv" data-tv={c.op.toUpperCase()} x={m} y={cy + 29} textAnchor="middle" />
                  </>
                )}
                {l && (
                  <text className="lbl" x={m} y={cy - 20} textAnchor="middle">
                    {trunc(l, 24)}
                  </text>
                )}
              </>
            )}
            <rect className={'hit' + (sel === o.id ? ' sel' : '')} data-sel={o.id} data-g="o" x={x + 2} y={cy - RH / 2 + 2} width={COILW - 4} height={RH - 4}>
              <title>{`${coilText(c)}${bad ? ' — ' + bad.message : ''}\nTıkla: düzenle · sürükle: taşı (Ctrl: kopyala)`}</title>
            </rect>
          </g>
        );
      })}
      <line className="rail" data-pw="1" x1={LEFT} y1={4} x2={LEFT} y2={sc.bottomY} />
      <line className="rail" x1={sc.rightX} y1={4} x2={sc.rightX} y2={sc.bottomY} />
      <g className="addrow" data-add="1">
        <rect x={LEFT + 10} y={sc.bottomY + 6} width={sc.rightX - LEFT - 20} height={36} />
        <text x={(LEFT + sc.rightX) / 2} y={sc.bottomY + 29} textAnchor="middle">
          + Yeni satır ekle (ya da parçayı buraya sürükle)
        </text>
      </g>
    </g>
  );
});

/** Sürükleme sırasında bırakma noktaları */
function DropLayer() {
  const { active, valid, hot, label } = useDrag();
  if (!active) return null;
  const hx = hot ? (hot.t === 'r' ? hot.x0 + 30 : hot.x) : 0;
  const hy = hot ? hot.y : 0;
  const w = label.length * 6.8 + 18;
  return (
    <g pointerEvents="none">
      {valid.map((s, i) =>
        s === hot ? null : s.t === 'r' ? (
          <rect key={i} className="slot" x={s.x0 + 12} y={s.y - 1} width={s.x1 - s.x0 - 24} height={2} rx={1} />
        ) : (
          <circle key={i} className="slot" cx={s.x} cy={s.y} r={4.5} />
        ),
      )}
      {hot && (
        <>
          {hot.t === 'c' && <rect className="hotbar" x={hot.x - 2} y={hot.y - 20} width={4} height={40} rx={2} />}
          {hot.t === 'p' && <rect className="hotbar" x={hot.x - 34} y={hot.y - 2} width={68} height={4} rx={2} />}
          {hot.t === 'o' && <rect className="hotbar" x={hot.x - 80} y={hot.y - 2} width={160} height={4} rx={2} />}
          {hot.t === 'r' && <rect className="hotbar" x={hot.x0 + 6} y={hot.y - 2} width={hot.x1 - hot.x0 - 12} height={4} rx={2} />}
          <circle className="hotring" cx={hx} cy={hy} r={10} />
          <path className="hotplus" d={`M${hx - 5} ${hy}h10M${hx} ${hy - 5}v10`} />
          <g className="hotlbl">
            <rect x={hx + 14} y={hy - 30} width={w} height={20} rx={6} />
            <text x={hx + 23} y={hy - 16}>
              {label}
            </text>
          </g>
        </>
      )}
    </g>
  );
}

export function LadderView() {
  const ladder = useStore((s) => s.doc.ladder);
  const ladderError = useStore((s) => s.doc.ladderError);
  const instrOf = useStore((s) => s.doc.instrOf);
  const sel = useStore((s) => s.sel);
  const zoom = useStore((s) => s.settings.zoom);
  const model = useStore((s) => s.settings.model);
  const eraser = useEraser((s) => s.on);
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [quick, setQuick] = useState<{ x: number; y: number; text: string; err: string } | null>(null);

  const sc = useMemo(() => (ladder ? layout(ladder) : null), [ladder]);
  const scRef = useRef(sc);
  scRef.current = sc;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    registerTarget({ svg: () => svg.current, wrap: () => wrap.current, zoom: () => zoomRef.current, slots: () => scRef.current?.slots ?? [] });
    return () => registerTarget(null);
  }, []);

  // ---------------------------------------------------------------- canlı akım
  const els = useRef<{ pw: SVGElement[]; cl: SVGElement[]; q: SVGElement[]; tv: SVGTextElement[]; tvbar: SVGRectElement[] }>({ pw: [], cl: [], q: [], tv: [], tvbar: [] });
  useEffect(() => {
    const s = svg.current;
    if (!s) return;
    els.current = {
      pw: [...s.querySelectorAll<SVGElement>('[data-pw]')],
      cl: [...s.querySelectorAll<SVGElement>('[data-cl]')],
      q: [...s.querySelectorAll<SVGElement>('[data-q]')],
      tv: [...s.querySelectorAll<SVGTextElement>('[data-tv]')],
      tvbar: [...s.querySelectorAll<SVGRectElement>('[data-tvbar]')],
    };
  }, [sc, sel]);

  useFrame(() => {
    const e = els.current;
    const m = engine.machine;
    const live = engine.live && !!ladder && !!m;
    if (!live || !ladder || !m) {
      for (const el of e.pw) el.classList.remove('on');
      for (const el of e.cl) el.classList.remove('on');
      for (const el of e.q) el.classList.remove('on');
    } else {
      const closedOf = (id: string): boolean => {
        const i = instrOf.get(id);
        if (m.traced && i !== undefined && i < m.closed.length) return m.closed[i] === 1;
        // eşleme yok: cihaz durumundan yaklaşık (kenar kontakları gösterilmez)
        const loc = locate(ladder, id);
        if (loc?.kind !== 'contact') return false;
        let b = false;
        try {
          b = m.bit(loc.node.op) === 1;
        } catch {
          return false;
        }
        return loc.node.kind === 'NO' ? b : loc.node.kind === 'NC' ? !b : false;
      };
      const pm = computePower(ladder, closedOf);
      for (const el of e.pw) el.classList.toggle('on', !!pm.get(el.dataset.pw!));
      for (const el of e.cl) el.classList.toggle('on', !!pm.get(el.dataset.cl + ':closed'));
      for (const el of e.q) el.classList.toggle('on', !!pm.get(el.dataset.q + ':q'));
    }
    // zamanlayıcı/sayıcı değerleri (STOP'ta da: kalıcı değerler görünsün)
    const p = m?.profile;
    e.tv.forEach((el, i) => {
      const op = el.dataset.tv!;
      const a = parseAddress(op).addr;
      if (!m || !a) {
        el.textContent = '';
        return;
      }
      const isT = a.type === 'T';
      const cv = isT ? m.Tcv[a.index] ?? 0 : m.Ccv[a.index] ?? 0;
      const svRaw = isT ? m.Tsv[a.index] ?? -1 : m.Csv[a.index] ?? -1;
      const sv = svRaw >= 0 ? svRaw : 0;
      let t = `${cv} / ${svRaw >= 0 ? svRaw : '?'}`;
      if (isT && p) {
        const base = timerRange(p, a.index)?.baseMs ?? 100;
        t += ` · ${((cv * base) / 1000).toFixed(base >= 100 ? 1 : base >= 10 ? 2 : 3)} s`;
      }
      el.textContent = t;
      const bar = e.tvbar[i];
      if (bar) {
        const full = COILW - 28;
        bar.setAttribute('width', String(sv > 0 ? Math.min(1, cv / sv) * full : 0));
        bar.classList.toggle('done', sv > 0 && cv >= sv);
      }
    });
  }, [sc, instrOf, ladder]);

  // ---------------------------------------------------------------- etkileşim
  const store = useStore.getState;
  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as SVGElement;
    const id = t.dataset?.sel;
    const g = t.dataset?.g as 'c' | 'o' | undefined;
    if (!id || !g || useEraser.getState().on) return;
    beginPointer(e, { src: 'ladder', id, g }, t.parentElement?.querySelector('text')?.textContent ?? id);
  };

  const onClick = (e: React.MouseEvent) => {
    if (clickSuppressed()) return;
    const t = e.target as SVGElement;
    wrap.current?.focus({ preventScroll: true });
    if (t.closest('[data-add]')) {
      store().editLadder((l) => {
        const r = newRung(l);
        l.rungs.push(r);
        return r.id;
      });
      return;
    }
    const id = (t as SVGElement).dataset?.sel ?? null;
    if (useEraser.getState().on && id) {
      const loc = ladder && locate(ladder, id);
      if (loc && loc.kind !== 'rung') store().editLadder((l) => remove(l, id));
      return;
    }
    store().select(id);
    setQuick(null);
  };

  const openQuick = useCallback(
    (prefill: string) => {
      const sc0 = scRef.current;
      if (!sc0) return;
      const cur = store().sel;
      const it = sc0.order.find((o) => o.id === cur);
      const z = zoomRef.current;
      const x = it ? it.x * z + 20 : LEFT * z + 40;
      const y = it ? it.y * z + 28 : (sc0.bottomY - 40) * z;
      setQuick({ x, y, text: prefill, err: '' });
    },
    [store],
  );

  const commitQuick = () => {
    if (!quick) return;
    const q = parseQuick(quick.text);
    if (typeof q === 'string') {
      setQuick({ ...quick, err: q });
      return;
    }
    store().editLadder((l) => applyQuick(l, store().sel, q));
    setQuick(null);
    wrap.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== wrap.current) return;
    const s = scRef.current;
    const st = store();
    const cur = st.sel;
    if (e.key === 'Escape') {
      if (useEraser.getState().on) useEraser.getState().toggle(false);
      else st.select(null);
      return;
    }
    if (!s || !ladder) return;
    const order = s.order;
    const i = order.findIndex((o) => o.id === cur);
    const here = order[i];
    const pick = (dir: 'l' | 'r' | 'u' | 'd') => {
      if (!here) return order[0]?.id ?? null;
      let best: string | null = null;
      let bd = Infinity;
      for (const o of order) {
        if (o.id === here.id) continue;
        const dx = o.x - here.x;
        const dy = o.y - here.y;
        let d: number;
        if (dir === 'r' && dx > 1) d = dx + Math.abs(dy) * 3;
        else if (dir === 'l' && dx < -1) d = -dx + Math.abs(dy) * 3;
        else if (dir === 'd' && dy > 1) d = dy * 2 + Math.abs(dx);
        else if (dir === 'u' && dy < -1) d = -dy * 2 + Math.abs(dx);
        else continue;
        if (d < bd) {
          bd = d;
          best = o.id;
        }
      }
      return best ?? here.id;
    };
    const key = e.key;
    const mod = e.ctrlKey || e.metaKey;
    if (e.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
      e.preventDefault();
      if (cur) st.editLadder((l) => apply(l, locate(l, cur)?.r.id ?? cur, key === 'ArrowUp' ? 'rungUp' : 'rungDown'));
      return;
    }
    const dirs: Record<string, 'l' | 'r' | 'u' | 'd'> = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' };
    const dir = dirs[key];
    if (dir) {
      e.preventDefault();
      const id = pick(dir);
      st.select(id);
      scrollIntoView(id);
      return;
    }
    if (key === 'Home' || key === 'End') {
      e.preventDefault();
      const id = (key === 'Home' ? order[0] : order[order.length - 1])?.id ?? null;
      st.select(id);
      scrollIntoView(id);
      return;
    }
    if ((key === 'Delete' || key === 'Backspace') && cur) {
      e.preventDefault();
      st.editLadder((l) => apply(l, cur, 'delete'));
      return;
    }
    if (mod && (key.toLowerCase() === 'c' || key.toLowerCase() === 'x') && cur) {
      e.preventDefault();
      const c = takeClip(ladder, cur);
      if (!c) return;
      clip = c;
      // Satırın IL'i sistem panosuna da gider (mesaja/rapora yapıştırılabilir)
      if (c.k === 'rung') void navigator.clipboard?.writeText(ladderToIl({ rungs: [c.r], labels: {} })).catch(() => {});
      if (key.toLowerCase() === 'x') st.editLadder((l) => apply(l, cur, 'delete'));
      st.showToast(key.toLowerCase() === 'x' ? 'Kesildi' : c.k === 'rung' ? 'Satır kopyalandı' : 'Kopyalandı');
      return;
    }
    if (mod && key.toLowerCase() === 'v') {
      e.preventDefault();
      const c = clip;
      if (!c) return st.showToast('Panoda parça yok: önce Ctrl+C ile kopyala');
      st.editLadder((l) => pasteClip(l, cur, c));
      return;
    }
    if (mod && key.toLowerCase() === 'd' && cur) {
      e.preventDefault();
      st.editLadder((l) => apply(l, cur, 'duplicate'));
      return;
    }
    if (key === 'Enter' || key === 'F2') {
      e.preventDefault();
      if (key === 'F2' || e.shiftKey) {
        document.getElementById('prop-op')?.focus();
        return;
      }
      openQuick('');
      return;
    }
    if (!mod && !e.altKey && key.length === 1 && /[a-zA-Z/|]/.test(key)) {
      e.preventDefault();
      openQuick(key);
    }
  };

  const scrollIntoView = (id: string | null) => {
    const s = scRef.current;
    const w = wrap.current;
    const it = s?.order.find((o) => o.id === id);
    if (!w || !it) return;
    const z = zoomRef.current;
    const x = it.x * z;
    const y = it.y * z;
    if (y < w.scrollTop + 40) w.scrollTop = y - 60;
    else if (y > w.scrollTop + w.clientHeight - 40) w.scrollTop = y - w.clientHeight + 80;
    if (x < w.scrollLeft + 40) w.scrollLeft = x - 80;
    else if (x > w.scrollLeft + w.clientWidth - 40) w.scrollLeft = x - w.clientWidth + 120;
  };

  const setZoom = (z: number) => store().set('zoom', Math.round(Math.min(2, Math.max(0.5, z)) * 100) / 100);
  const fit = () => {
    if (!sc || !wrap.current) return;
    setZoom(Math.min(1.4, (wrap.current.clientWidth - 24) / sc.width));
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  };

  return (
    <div
      className={'ladderwrap' + (eraser ? ' eraser' : '')}
      ref={wrap}
      tabIndex={0}
      aria-label="Ladder diyagramı. Ok tuşları: gezin, Enter: komut yazarak ekle, Delete: sil"
      onKeyDown={onKeyDown}
      onWheel={onWheel}
      data-testid="ladder"
    >
      {sc && ladder ? (
        <svg
          ref={svg}
          className="ladder"
          id="ladder"
          width={Math.round(sc.width * zoom)}
          height={Math.round(sc.height * zoom)}
          viewBox={`0 0 ${sc.width} ${sc.height}`}
          onPointerDown={onPointerDown}
          onClick={onClick}
        >
          <SceneSvg sc={sc} ladder={ladder} sel={sel} model={model} />
          <DropLayer />
        </svg>
      ) : (
        <div className="ladder-empty">
          <h3>Ladder görünümü kullanılamıyor</h3>
          <p>{ladderError ?? 'Program boş.'}</p>
          <p className="hint">Program IL olarak çalışmaya devam eder. Alttaki IL sekmesinden düzenleyebilirsin.</p>
        </div>
      )}
      {quick && (
        <div className="quick" style={{ left: quick.x, top: quick.y }}>
          <input
            className={'input mono' + (quick.err ? ' bad' : '')}
            autoFocus
            value={quick.text}
            placeholder="X1, /X2, |X3, OUT Y1, TMR T0 K50"
            onChange={(e) => setQuick({ ...quick, text: e.target.value, err: '' })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitQuick();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setQuick(null);
                wrap.current?.focus({ preventScroll: true });
              }
            }}
            onBlur={() => setQuick(null)}
            aria-label="Hızlı ekleme komutu"
          />
          <small className={quick.err ? 'bad' : ''}>{quick.err || 'Enter: ekle · | paralel · / kapalı kontak · Esc: vazgeç'}</small>
        </div>
      )}
      <div className="zoombar">
        <button className="btn ghost icon sm" title="Uzaklaş (Ctrl+tekerlek)" onClick={() => setZoom(zoom / 1.15)} aria-label="Uzaklaş">
          <Minus />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="btn ghost icon sm" title="Yakınlaş (Ctrl+tekerlek)" onClick={() => setZoom(zoom * 1.15)} aria-label="Yakınlaş">
          <Plus />
        </button>
        <button className="btn ghost icon sm" title="Genişliğe sığdır" onClick={fit} aria-label="Sığdır">
          <Scan />
        </button>
      </div>
    </div>
  );
}
