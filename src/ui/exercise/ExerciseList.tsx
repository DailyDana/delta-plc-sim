// Sol paneldeki "Alıştırma" sekmesi: düzeye göre gruplu liste, çözülenler işaretli.

import { Circle, CircleCheck } from 'lucide-react';
import { useStore } from '../state/store';
import { groupByLevel } from './progress';
import { EXERCISE_LIST, openExercise, useExercises } from './store';
import { LEVEL_NAME } from './ExercisePanel';

function Level({ n }: { n: number }) {
  return (
    <span className="ex-lvl" title={`Düzey ${n}`} aria-label={`Düzey ${n}`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= n ? 'on' : ''} />
      ))}
    </span>
  );
}

export function ExerciseList() {
  const progress = useExercises((s) => s.progress);
  const tabs = useStore((s) => s.tabs);
  const activeEx = useStore((s) => s.tabs[s.active]?.exercise);
  const solved = EXERCISE_LIST.filter((e) => progress.solved[e.id]).length;
  return (
    <div className="pbody ex-list">
      <p className="hint">Bir görev seç, devreyi kur, "Kontrol et" ile dene. Çalışman bu tarayıcıda saklanır.</p>
      <div className="ex-progress" aria-label="İlerleme">
        <span>
          <b>{solved}</b> / {EXERCISE_LIST.length} çözüldü
        </span>
        <span className="bar" aria-hidden>
          <span style={{ width: `${(solved / EXERCISE_LIST.length) * 100}%` }} />
        </span>
      </div>
      {groupByLevel(EXERCISE_LIST).map((g) => (
        <div className="sect" key={g.level}>
          <h3>
            Düzey {g.level} · {LEVEL_NAME[g.level]}
          </h3>
          <div className="plist">
            {g.items.map((e) => {
              const ok = !!progress.solved[e.id];
              const open = tabs.some((t) => t.exercise === e.id);
              return (
                <div
                  key={e.id}
                  className={'pitem ex-item' + (activeEx === e.id ? ' cur' : '') + (ok ? ' solved' : '')}
                  tabIndex={0}
                  role="button"
                  data-exercise={e.id}
                  data-solved={ok ? '1' : '0'}
                  aria-label={`${e.title}, düzey ${e.level}${ok ? ', çözüldü' : ''}`}
                  onClick={() => openExercise(e.id)}
                  onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), openExercise(e.id))}
                >
                  {ok ? <CircleCheck size={15} className="ex-ok" aria-hidden /> : <Circle size={15} className="muted" aria-hidden />}
                  <span className="nm" title={e.title}>
                    {e.title}
                  </span>
                  {open && <span className="badge">açık</span>}
                  <Level n={e.level} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
