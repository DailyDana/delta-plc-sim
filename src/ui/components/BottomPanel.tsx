// Alt panel: IL düzenleyicisi · izleme tablosu · sorunlar.

import { ChevronDown, FileCode, Gauge, TriangleAlert } from 'lucide-react';
import { useStore, type BottomTab } from '../state/store';
import { IlEditor } from './IlEditor';
import { WatchPanel } from './WatchPanel';
import { ProblemsPanel } from './ProblemsPanel';

export function BottomPanel() {
  const tab = useStore((s) => s.settings.bottomTab);
  const diags = useStore((s) => s.doc.diagnostics);
  const errs = diags.filter((d) => d.severity === 'error').length;
  const warns = diags.length - errs;
  const setTab = (t: BottomTab) => useStore.getState().set('bottomTab', t);

  const tabs: { id: BottomTab; label: string; icon: React.ReactNode; extra?: React.ReactNode }[] = [
    { id: 'il', label: 'IL', icon: <FileCode size={15} /> },
    { id: 'watch', label: 'İzleme', icon: <Gauge size={15} /> },
    {
      id: 'problems',
      label: 'Sorunlar',
      icon: <TriangleAlert size={15} />,
      extra: errs ? <span className="count err">{errs}</span> : warns ? <span className="count warn">{warns}</span> : <span className="count">0</span>,
    },
  ];

  return (
    <section className="bottom" aria-label="Alt panel">
      <div className="ptabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : undefined} onClick={() => setTab(t.id)}>
            {t.icon}
            {t.label}
            {t.extra}
          </button>
        ))}
        <div className="tools">
          <button className="btn ghost icon sm" title="Paneli gizle" aria-label="Paneli gizle" onClick={() => useStore.getState().set('bottomOpen', false)}>
            <ChevronDown />
          </button>
        </div>
      </div>
      <div className="bbody" role="tabpanel">
        {tab === 'il' ? <IlEditor /> : tab === 'watch' ? <WatchPanel /> : <ProblemsPanel />}
      </div>
    </section>
  );
}
