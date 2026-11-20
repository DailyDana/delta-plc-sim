// Görev paneli (sağ panelin üstü): alıştırma sekmesi etkinken görev metni, G/Ç tablosu, Kontrol et / İpucu /
// Baştan başla ve denetim sonucu. Senaryoya tıklamak alt paneldeki "Karşılaştırma" sekmesini açar.

import { ArrowRight, Check, ChevronDown, ChevronRight, CircleCheck, Lightbulb, ListChecks, RotateCcw, TriangleAlert, X } from 'lucide-react';
import type { IoKind } from '../../core';
import { activeTab, useStore } from '../state/store';
import { askConfirm } from '../components/dialogs';
import { checkActive, nextHint, nextOf, openExercise, publicExercise, restartActive, useExercises, type PublicExercise } from './store';

const KIND: Record<IoKind, string> = {
  buton: 'buton (NO)',
  anahtar: 'anahtar',
  sensor: 'sensör',
  lamba: 'lamba',
  motor: 'motor',
  kontaktor: 'kontaktör',
};

export const LEVEL_NAME: Record<number, string> = { 1: 'temel', 2: 'orta', 3: 'uygulama' };

function IoTable({ ex }: { ex: PublicExercise }) {
  const group = (title: string, list: PublicExercise['inputs']) => (
    <tbody>
      <tr className="ex-io-grp">
        <th colSpan={3} scope="colgroup">
          {title}
        </th>
      </tr>
      {list.map((io) => (
        <tr key={io.dev}>
          <td className="mono">{io.dev}</td>
          <td>{io.label}</td>
          <td className="muted">{KIND[io.kind]}</td>
        </tr>
      ))}
    </tbody>
  );
  return (
    <table className="ex-io" aria-label="Girişler ve çıkışlar">
      {group('Girişler', ex.inputs)}
      {group('Çıkışlar', ex.outputs)}
    </table>
  );
}

/** Senaryonun karşılaştırmasını alt panelde aç; panel tüm satırları gösteremeyecek kadar alçaksa büyüt */
export function openCompare(tabId: string, i: number): void {
  useExercises.getState().selectScenario(tabId, i);
  const s = useStore.getState();
  s.set('bottomOpen', true);
  s.set('bottomTab', 'exercise');
  const rows = useExercises.getState().results[tabId]?.result.scenarios[i]?.watch.length ?? 3;
  // sekme başlığı + senaryo/ileti satırları + araç çubuğu + eksen + satırlar (24 px)
  const need = 34 + 116 + 38 + 26 + rows * 24 + 8;
  const max = Math.max(160, window.innerHeight - 250);
  if (s.settings.bottomH < need) s.set('bottomH', Math.min(need, max));
}

function Result({ tabId, il, exId }: { tabId: string; il: string; exId: string }) {
  const entry = useExercises((s) => s.results[tabId]);
  const sel = useExercises((s) => s.scenario[tabId]);
  const bottomTab = useStore((s) => (s.settings.bottomOpen ? s.settings.bottomTab : null));
  if (!entry) return null;
  const r = entry.result;
  const stale = entry.il !== il;
  if (r.blocked) {
    return (
      <div className="ex-result bad" role="status" data-state="blocked">
        <TriangleAlert />
        <div>
          <p>{r.message}</p>
          <button
            className="btn sm"
            onClick={() => {
              const s = useStore.getState();
              s.set('bottomOpen', true);
              s.set('bottomTab', 'problems');
            }}
          >
            Sorunlar'ı göster
          </button>
        </div>
      </div>
    );
  }
  const next = r.passed ? nextOf(exId) : null;
  const nextEx = next ? publicExercise(next) : null;
  const ok = r.scenarios.filter((x) => x.passed).length;
  return (
    <div className="ex-res" data-state={r.passed ? 'passed' : 'failed'}>
      {r.passed ? (
        <div className="ex-result ok" role="status">
          <CircleCheck />
          <div>
            <p>
              <b>Tüm senaryolar geçti ({ok}/{r.scenarios.length}).</b> Alıştırma çözüldü.
            </p>
            {nextEx && (
              <button className="btn sm" onClick={() => openExercise(nextEx.id)} data-next={nextEx.id}>
                Sonraki: {nextEx.title} <ArrowRight />
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="ex-sum" role="status">
          {r.scenarios.length} senaryonun {ok} tanesi geçti. Ayrıntı ve dalga karşılaştırması için senaryoya tıkla.
        </p>
      )}
      {stale && <p className="ex-stale">Program bu kontrolden sonra değişti; sonucu güncellemek için yeniden kontrol et.</p>}
      <ol className="ex-scen" aria-label="Senaryolar">
        {r.scenarios.map((sc, i) => {
          const on = bottomTab === 'exercise' && sel === i;
          return (
            <li key={i}>
              <button className={'ex-sc ' + (sc.passed ? 'ok' : 'bad') + (on ? ' on' : '')} data-scenario={i} aria-current={on || undefined} onClick={() => openCompare(tabId, i)} title="Dalga karşılaştırmasını aç">
                <span className="ic" aria-label={sc.passed ? 'geçti' : 'kaldı'}>
                  {sc.passed ? <Check /> : <X />}
                </span>
                <span className="nm">{sc.name}</span>
                {!sc.passed && sc.message && <span className="msg">{sc.message}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function ExercisePanel() {
  const tab = useStore(activeTab);
  const collapsed = useExercises((s) => s.collapsed);
  const progress = useExercises((s) => s.progress);
  const ex = publicExercise(tab.exercise);
  if (!ex) return null;
  const used = Math.min(progress.hints[ex.id] ?? 0, ex.hints.length);
  const solved = !!progress.solved[ex.id];
  const restart = async () => {
    const ok = await askConfirm('Baştan başlansın mı?', 'Devre başlangıçtaki hâline döner. Bu adımı Geri al (Ctrl+Z) ile geri alabilirsin.', { okText: 'Baştan başla', danger: true });
    if (ok) restartActive();
  };
  return (
    <section key={tab.id} className={'ex-task' + (collapsed ? ' collapsed' : '')} aria-label="Görev" data-exercise={ex.id}>
      <header className="ex-head">
        <button className="ex-toggle" aria-expanded={!collapsed} onClick={() => useExercises.getState().setCollapsed(!collapsed)} title={collapsed ? 'Görevi göster' : 'Görevi daralt'}>
          {collapsed ? <ChevronRight /> : <ChevronDown />}
          <span className="ex-eyebrow">
            Görev · Düzey {ex.level} ({LEVEL_NAME[ex.level]})
          </span>
        </button>
        {solved && (
          <span className="ex-solved" title="Bu alıştırmayı çözdün">
            <CircleCheck /> Çözüldü
          </span>
        )}
      </header>
      <h2 className="ex-title">{ex.title}</h2>
      {!collapsed && (
        <div className="ex-body">
          <div className="ex-text">
            {ex.task.split('\n').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <IoTable ex={ex} />
          <div className="ex-actions">
            <button className="btn primary sm" id="exCheck" onClick={() => checkActive()}>
              <ListChecks /> Kontrol et
            </button>
            <button className="btn sm" id="exHint" onClick={nextHint} disabled={used >= ex.hints.length} title={used >= ex.hints.length ? 'Tüm ipuçları açık' : 'Bir sonraki ipucunu göster'}>
              <Lightbulb /> İpucu {used}/{ex.hints.length}
            </button>
            <button className="btn sm ghost icon" id="exRestart" onClick={() => void restart()} title="Baştan başla" aria-label="Baştan başla">
              <RotateCcw />
            </button>
          </div>
          {used > 0 && (
            <ol className="ex-hints" aria-label="İpuçları">
              {ex.hints.slice(0, used).map((h, i) => (
                <li key={i}>
                  <span className="n">İpucu {i + 1}</span> {h}
                </li>
              ))}
            </ol>
          )}
          <Result tabId={tab.id} il={tab.il} exId={ex.id} />
        </div>
      )}
    </section>
  );
}
