// IL (komut listesi) düzenleyicisi: CodeMirror 6. Ladder ile eşzamanlı; tek geri-al yığını store'dadır.
// Canlı izleme: motor çalışırken akımı ileten komut satırları vurgulanır (WPLSoft'taki çevrimiçi izleme gibi).

import { useEffect, useRef } from 'react';
import { Annotation, EditorState, RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, type DecorationSet } from '@codemirror/view';
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { Tag } from '@lezer/highlight';
import { autocompletion, completionKeymap, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { INSTRUCTIONS, type Diagnostic, type IlProgram } from '../../core';
import { useStore } from '../state/store';
import { engine } from '../sim/engine';
import { useFrame } from '../sim/useLive';

// ------------------------------------------------------------------ sözdizimi
const T = { mn: Tag.define(), dev: Tag.define(), k: Tag.define(), com: Tag.define(), lbl: Tag.define() };

interface LexState {
  pos: number;
}

const ilLanguage = StreamLanguage.define<LexState>({
  name: 'delta-il',
  startState: () => ({ pos: 0 }),
  token(stream, state) {
    if (stream.sol()) {
      state.pos = 0;
      if (stream.match(/^\s*#/, false)) {
        stream.skipToEnd();
        return 'illbl';
      }
    }
    if (stream.eatSpace()) return null;
    if (stream.peek() === ';') {
      stream.skipToEnd();
      return 'ilcom';
    }
    const w = stream.match(/^[^\s;]+/) as RegExpMatchArray | null;
    if (!w) {
      stream.next();
      return null;
    }
    const word = w[0];
    const first = state.pos === 0;
    state.pos++;
    if (first) return 'ilmn';
    if (/^K\d[XYMS]\d+$/i.test(word)) return 'ildev'; // K1Y0 bit grubu
    if (/^[KH]-?[0-9A-F]+$/i.test(word) || /^-?\d+$/.test(word)) return 'ilk';
    if (/^[XYMSTCD]\d+$/i.test(word)) return 'ildev';
    return null;
  },
  tokenTable: { ilmn: T.mn, ildev: T.dev, ilk: T.k, ilcom: T.com, illbl: T.lbl },
});

const ilHighlight = HighlightStyle.define([
  { tag: T.mn, class: 'cm-il-mn' },
  { tag: T.dev, class: 'cm-il-dev' },
  { tag: T.k, class: 'cm-il-k' },
  { tag: T.com, class: 'cm-il-com' },
  { tag: T.lbl, class: 'cm-il-lbl' },
]);

// ------------------------------------------------------------------ tema (renkler CSS değişkenlerinden)
const theme = EditorView.theme({
  '&': { color: 'var(--ink)', backgroundColor: 'var(--canvas)', height: '100%' },
  '.cm-content': { caretColor: 'var(--ink)', fontFamily: 'var(--mono)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ink)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 24%, transparent) !important',
  },
  '.cm-tooltip': { backgroundColor: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '4px' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--mono)', fontSize: '12.5px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' },
  '.cm-completionDetail': { fontFamily: 'var(--font)', color: 'var(--ink-3)', marginLeft: '10px', fontStyle: 'normal' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail': { color: 'inherit', opacity: 0.8 },
  '.cm-diagnostic': { fontFamily: 'var(--font)', fontSize: '12.5px' },
  '.cm-diagnostic-error': { borderLeftColor: 'var(--err)' },
  '.cm-diagnostic-warning': { borderLeftColor: 'var(--warn)' },
  '.cm-lint-marker': { width: '0.9em', height: '0.9em' },
});

// ------------------------------------------------------------------ canlı izleme dekorasyonu
const setLive = StateEffect.define<number[]>();
const liveField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setLive)) continue;
      const b = new RangeSetBuilder<Decoration>();
      const doc = tr.state.doc;
      for (const ln of e.value) if (ln >= 1 && ln <= doc.lines) b.add(doc.line(ln).from, doc.line(ln).from, liveLine);
      deco = b.finish();
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});
const liveLine = Decoration.line({ class: 'cm-il-live' });

// ------------------------------------------------------------------ otomatik tamamlama
const MNEMONICS = Object.values(INSTRUCTIONS).map((d) => ({ label: d.mn, detail: d.desc, type: 'keyword' }));
const DEFAULT_ADDR = [
  ...Array.from({ length: 8 }, (_, i) => 'X' + i),
  ...Array.from({ length: 8 }, (_, i) => 'Y' + i),
  ...Array.from({ length: 10 }, (_, i) => 'M' + i),
  ...Array.from({ length: 4 }, (_, i) => 'T' + i),
  ...Array.from({ length: 4 }, (_, i) => 'C' + i),
];

function usedAddresses(p: IlProgram): string[] {
  const s = new Set<string>();
  for (const it of p.instrs) for (const o of it.ops) if (o.addr && !o.invalid) s.add(o.addr.text);
  return [...s];
}

function complete(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/[A-Za-z0-9]*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, word.from - line.from);
  if (/^\s*[;#]/.test(before) || before.includes(';')) return null;
  if (/^\s*$/.test(before)) return { from: word.from, options: MNEMONICS, validFor: /^[A-Za-z]*$/ };
  const doc = useStore.getState().doc;
  const labels = doc.program.labels;
  const used = usedAddresses(doc.program);
  const all = [...used, ...DEFAULT_ADDR.filter((a) => !used.includes(a))];
  return {
    from: word.from,
    options: all.map((a, i) => ({ label: a, detail: labels[a] ?? (i < used.length ? 'programda' : undefined), type: 'variable', boost: i < used.length ? 1 : 0 })),
    validFor: /^[A-Za-z0-9]*$/,
  };
}

// ------------------------------------------------------------------ satıra git (Sorunlar panelinden)
let current: EditorView | null = null;
let pendingLine: number | null = null;

function goLine(v: EditorView, line: number): void {
  const n = Math.max(1, Math.min(v.state.doc.lines, line));
  const l = v.state.doc.line(n);
  v.dispatch({ selection: { anchor: l.from, head: l.to }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
  v.focus();
}

/** IL düzenleyicisinde satırı seç ve göster; düzenleyici henüz açık değilse açılınca uygulanır */
export function revealIlLine(line: number): void {
  if (current) goLine(current, line);
  else pendingLine = line;
}

// ------------------------------------------------------------------ bileşen
/** Dışarıdan (ladder, geri al, sekme) gelen içerik değişimi: kullanıcı yazımı sayılmaz */
const External = Annotation.define<boolean>();

function toCm(view: EditorView, ds: readonly Diagnostic[]): CmDiagnostic[] {
  const doc = view.state.doc;
  const out: CmDiagnostic[] = [];
  for (const d of ds) {
    if (!d.line || d.line > doc.lines) continue;
    const l = doc.line(d.line);
    out.push({ from: l.from, to: Math.max(l.from, l.to), severity: d.severity === 'error' ? 'error' : 'warning', message: d.message, source: d.code });
  }
  return out;
}

export function IlEditor() {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastLive = useRef('');
  const il = useStore((s) => s.doc.il);
  const diagnostics = useStore((s) => s.doc.diagnostics);
  const program = useStore((s) => s.doc.program);
  const ladderError = useStore((s) => s.doc.ladderError);

  // kurulum (bir kez)
  useEffect(() => {
    if (!host.current) return;
    const appKeys = keymap.of([
      { key: 'Mod-z', run: () => (useStore.getState().undo(), true), preventDefault: true },
      { key: 'Mod-y', run: () => (useStore.getState().redo(), true), preventDefault: true },
      { key: 'Mod-Shift-z', run: () => (useStore.getState().redo(), true), preventDefault: true },
    ]);
    const ext: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      lintGutter(),
      ilLanguage,
      syntaxHighlighting(ilHighlight),
      autocompletion({ override: [complete], icons: false }),
      appKeys,
      keymap.of([...completionKeymap, ...defaultKeymap, indentWithTab]),
      liveField,
      theme,
      EditorView.contentAttributes.of({ 'aria-label': 'IL komut listesi', spellcheck: 'false' }),
      EditorView.updateListener.of((u) => {
        if (!u.docChanged) return;
        if (u.transactions.some((t) => t.annotation(External))) return;
        useStore.getState().setIlText(u.state.doc.toString());
      }),
    ];
    const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: useStore.getState().doc.il, extensions: ext }) });
    viewRef.current = view;
    current = view;
    view.dispatch(setDiagnostics(view.state, toCm(view, useStore.getState().doc.diagnostics)));
    if (pendingLine !== null) {
      const ln = pendingLine;
      pendingLine = null;
      requestAnimationFrame(() => viewRef.current && goLine(viewRef.current, ln));
    }
    return () => {
      if (current === view) current = null;
      viewRef.current = null;
      view.destroy();
    };
  }, []);

  // dışarıdan gelen IL değişimi
  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur === il) return;
    const head = Math.min(v.state.selection.main.head, il.length);
    lastLive.current = '';
    v.dispatch({ changes: { from: 0, to: cur.length, insert: il }, selection: { anchor: head }, annotations: External.of(true) });
  }, [il]);

  // tanılamalar
  useEffect(() => {
    const v = viewRef.current;
    if (!v || v.state.doc.toString() !== useStore.getState().doc.il) return;
    v.dispatch(setDiagnostics(v.state, toCm(v, diagnostics)));
  }, [diagnostics, il]);

  // canlı izleme: akımı ileten komut satırları
  useFrame(() => {
    const v = viewRef.current;
    if (!v) return;
    const m = engine.machine;
    const lines: number[] = [];
    if (engine.live && m && m.traced && !engine.stale && m.accOut.length === program.instrs.length && v.state.doc.toString() === useStore.getState().doc.il) {
      program.instrs.forEach((it, i) => {
        if (m.accOut[i]) lines.push(it.line);
      });
    }
    const key = lines.join(',');
    if (key === lastLive.current) return;
    lastLive.current = key;
    v.dispatch({ effects: setLive.of(lines) });
  }, [program]);

  return (
    <div className="ilwrap">
      <div ref={host} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} />
      <div className={'ilnote' + (ladderError ? ' bad' : '')}>{ladderError ?? 'Ladder ile eşzamanlı · Ctrl+Space: tamamla · çalışırken akım ileten satırlar yeşil'}</div>
    </div>
  );
}
