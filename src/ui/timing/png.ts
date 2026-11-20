// Zaman diyagramını PNG olarak dışa aktar: açık (baskıya uygun) palet, satır başlıkları, eksen, imleçler.

import { formatMs, traceKeyName, type Trace } from '../../core';
import { PRINT_PALETTE, drawAxis, drawRows, valueText, type Cursors, type WaveGeom } from './draw';

export interface PngInput {
  title: string;
  rows: { key: string; label?: string }[];
  trace: Trace;
  expected?: Trace | null;
  t0: number;
  t1: number;
  cursors: Cursors;
  /** Çizim alanı genişliği (CSS px) */
  plotWidth?: number;
  rowH?: number;
}

export function renderPng(inp: PngInput, scale = 2): HTMLCanvasElement {
  const pal = PRINT_PALETTE;
  const namesW = 190;
  const plotW = Math.max(600, Math.round(inp.plotWidth ?? 900));
  const rowH = inp.rowH ?? 30;
  const titleH = 34;
  const axisH = 24;
  const footH = 26;
  const W = namesW + plotW + 12;
  const H = titleH + axisH + inp.rows.length * rowH + footH;
  const cv = document.createElement('canvas');
  cv.width = W * scale;
  cv.height = H * scale;
  const ctx = cv.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = pal.ink;
  ctx.font = "600 15px Barlow, system-ui, sans-serif";
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(inp.title, 10, titleH / 2);
  ctx.font = "12px Barlow, system-ui, sans-serif";
  ctx.fillStyle = pal.ink3;
  ctx.textAlign = 'right';
  ctx.fillText(`PLC zamanı ${formatMs(inp.t0)} – ${formatMs(inp.t1)}`, W - 12, titleH / 2);

  const g: WaveGeom = { width: plotW, rowH, t0: inp.t0, t1: inp.t1 };
  ctx.save();
  ctx.translate(namesW, titleH);
  drawAxis(ctx, g, axisH, pal, inp.cursors);
  ctx.translate(0, axisH);
  drawRows(ctx, g, { rows: inp.rows, trace: inp.trace, expected: inp.expected ?? null, cursors: inp.cursors }, pal);
  ctx.restore();

  // satır başlıkları
  const at = inp.cursors.a ?? inp.trace.end;
  inp.rows.forEach((r, i) => {
    const y = titleH + axisH + i * rowH + rowH / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.ink;
    ctx.font = "700 12.5px 'JetBrains Mono', Consolas, monospace";
    const name = traceKeyName(r.key);
    ctx.fillText(name, 10, y);
    const nw = ctx.measureText(name).width;
    if (r.label) {
      ctx.fillStyle = pal.ink3;
      ctx.font = "12px Barlow, system-ui, sans-serif";
      let lbl = r.label;
      while (lbl.length > 1 && ctx.measureText(lbl).width > namesW - nw - 54) lbl = lbl.slice(0, -2) + '…';
      ctx.fillText(lbl, 16 + nw, y);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = pal.ink;
    ctx.font = "600 12px 'JetBrains Mono', Consolas, monospace";
    ctx.fillText(valueText(r.key, inp.trace.signals[r.key], at), namesW - 8, y);
    ctx.fillStyle = pal.grid;
    ctx.fillRect(0, titleH + axisH + (i + 1) * rowH - 1, namesW, 1);
  });
  ctx.fillStyle = pal.grid;
  ctx.fillRect(namesW - 1, titleH, 1, axisH + inp.rows.length * rowH);

  // imleç özeti
  const { a, b } = inp.cursors;
  const parts: string[] = [];
  if (a !== null) parts.push(`A = ${formatMs(a)}`);
  if (b !== null) parts.push(`B = ${formatMs(b)}`);
  if (a !== null && b !== null) parts.push(`Δt = ${formatMs(Math.abs(b - a))}`);
  if (parts.length) {
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.ink;
    ctx.font = "600 12px 'JetBrains Mono', Consolas, monospace";
    ctx.fillText(parts.join('    ') + (a !== null ? '   (değerler A anında)' : ''), 10, H - footH / 2);
  }
  return cv;
}

/** Tuvali dosya olarak indir */
export function downloadCanvas(cv: HTMLCanvasElement, name: string): Promise<void> {
  return new Promise((resolve) => {
    cv.toBlob((blob) => {
      if (!blob) return resolve();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      resolve();
    }, 'image/png');
  });
}
