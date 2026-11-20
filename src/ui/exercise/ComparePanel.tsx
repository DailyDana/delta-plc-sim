// Alt paneldeki "Karşılaştırma" sekmesi: seçili senaryoda öğrencinin izi (düz) ile beklenen iz (kesikli) üst üste,
// ayrışan aralıklar vurgulu; ilk sorunun anında A imleci. "Bu senaryoyu oynat" olayları gerçek motora uygular.
// Referans çözümün yalnızca izi (simulate çıktısı) kullanılır; IL'i hiçbir yerde gösterilmez.

import { useMemo } from 'react';
import { Play, Square } from 'lucide-react';
import { fmtSeconds, traceDiff, traceFromChanges } from '../../core';
import { activeTab, useStore } from '../state/store';
import { engine } from '../sim/engine';
import { useLive } from '../sim/useLive';
import { Waveform, type WaveRow } from '../timing/Waveform';
import { playScenario, stopPlayback, usePlayback } from './playback';
import { publicExercise, useExercises } from './store';

function PlayButton({ tabId, i, name, duration, events }: { tabId: string; i: number; name: string; duration: number; events: Parameters<typeof playScenario>[1] }) {
  const play = usePlayback((s) => s.play);
  useLive();
  const mine = !!play && play.tabId === tabId && play.scenario === i;
  if (mine) {
    const t = Math.min(duration, engine.machine?.timeMs ?? 0);
    return (
      <>
        <button className="btn sm" onClick={() => stopPlayback(true)} id="exPlay" data-playing="1">
          <Square /> Durdur
        </button>
        <span className="ex-playt mono" aria-live="off">
          {fmtSeconds(t)} / {fmtSeconds(duration)}
        </span>
      </>
    );
  }
  return (
    <button
      className="btn sm"
      id="exPlay"
      title="Senaryonun buton/anahtar olaylarını gerçek PLC'ye uygular (STOP → RUN); ladder'da akımı izleyebilirsin"
      onClick={() => {
        playScenario({ tabId, scenario: i, name, duration }, events);
        if (engine.mode === 'run') useStore.getState().showToast(`Oynatılıyor: ${name}`);
        else useStore.getState().showToast('Program çalıştırılamıyor; önce Sorunlar\'daki hatayı düzelt', true);
      }}
    >
      <Play /> Bu senaryoyu oynat
    </button>
  );
}

export function ComparePanel() {
  const tab = useStore(activeTab);
  const entry = useExercises((s) => s.results[tab.id]);
  const selRaw = useExercises((s) => s.scenario[tab.id]);
  const ex = publicExercise(tab.exercise);
  const scs = entry && !entry.result.blocked ? entry.result.scenarios : [];
  const sel = selRaw !== undefined && selRaw < scs.length ? selRaw : 0;
  const sc = scs[sel];

  const data = useMemo(() => {
    if (!sc || !ex) return null;
    const label = (d: string) => ex.inputs.find((x) => x.dev === d)?.label ?? ex.outputs.find((x) => x.dev === d)?.label;
    const rows: WaveRow[] = sc.watch.map((d) => ({ key: d, label: label(d) }));
    const student = traceFromChanges(sc.student, sc.duration, sc.watch);
    const expected = traceFromChanges(sc.reference, sc.duration, sc.watch);
    const outs = ex.outputs.map((o) => o.dev);
    const diff = traceDiff(student, expected, outs);
    const diffs = outs.flatMap((d) => (diff[d] ?? []).map(([a, b]) => ({ dev: d, label: label(d), a, b })));
    return { rows, student, expected, diffs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sc, ex?.id]);

  if (!ex) return <div className="hint" style={{ padding: 14 }}>Bu sekme bir alıştırmaya bağlı değil.</div>;
  if (!entry || entry.result.blocked || !sc || !data) {
    return (
      <div className="hint ex-cmp-empty">
        {entry?.result.blocked
          ? 'Program çalıştırılamadığı için karşılaştırma yok. Sorunlar sekmesindeki hatayı düzeltip yeniden kontrol et.'
          : 'Görev panelinde "Kontrol et"e bas. Sonra bir senaryoya tıklayınca devrenin davranışı burada beklenenle üst üste çizilir.'}
      </div>
    );
  }
  const first = sc.failures[0];
  const sel_ = (i: number) => useExercises.getState().selectScenario(tab.id, i);
  return (
    <div className="ex-compare" data-scenario={sel} data-passed={sc.passed ? '1' : '0'}>
      <div className="ex-cmp-head">
        <label className="ex-cmp-sel">
          <select className="select" value={sel} onChange={(e) => sel_(Number(e.target.value))} aria-label="Senaryo">
            {scs.map((x, i) => (
              <option key={i} value={i}>
                {`${x.name} (${x.passed ? 'geçti' : 'kaldı'})`}
              </option>
            ))}
          </select>
        </label>
        <span className="ex-legend" aria-label="Çizgi anlamları">
          <span className="ln solid" aria-hidden /> senin devren
          <span className="ln dashed" aria-hidden /> beklenen
          {data.diffs.length > 0 && (
            <>
              <span className="ln diff" aria-hidden /> ayrışma
            </>
          )}
        </span>
      </div>
      <div className="ex-cmp-info" role="status">
        {sc.passed ? (
          <span className="ok">Bu senaryo geçti. Kesikli çizgi beklenen davranışı gösterir.</span>
        ) : (
          <>
            {first && (
              <span className="bad" data-first={first.t}>
                <b>İlk sorun {fmtSeconds(first.t)}:</b> {first.message}
              </span>
            )}
            {data.diffs.length > 0 && (
              <span className="ex-diffs" data-diffs={data.diffs.length}>
                Ayrışma:{' '}
                {data.diffs
                  .slice(0, 4)
                  .map((d) => `${d.dev}${d.label ? ' (' + d.label + ')' : ''} ${fmtSeconds(d.a).replace(' s', '')}–${fmtSeconds(d.b)}`)
                  .join(' · ')}
                {data.diffs.length > 4 ? ` · +${data.diffs.length - 4}` : ''}
              </span>
            )}
          </>
        )}
      </div>
      <Waveform
        key={tab.id + ':' + sel + ':' + entry.seq}
        rows={data.rows}
        trace={data.student}
        expected={data.expected}
        showDiff
        marker={first ? first.t : null}
        rowH={24}
        pngName={`karsilastirma-${ex.id}-${sel + 1}.png`}
        pngTitle={`${ex.title} — ${sc.name}`}
        toolbarStart={<PlayButton tabId={tab.id} i={sel} name={sc.name} duration={sc.duration} events={sc.events} />}
      />
    </div>
  );
}
