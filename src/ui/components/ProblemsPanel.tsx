// Sorunlar: kodlu tanılamalar. Tıklayınca IL'de o satıra gider ve (varsa) ladder satırını seçer.

import type { Diagnostic } from '../../core';
import { useStore } from '../state/store';
import { revealIlLine } from './IlEditor';

function go(d: Diagnostic): void {
  const s = useStore.getState();
  if (d.rung !== undefined) {
    const r = s.doc.ladder?.rungs[d.rung];
    if (r) s.select(r.id);
  }
  if (d.line) {
    if (s.settings.bottomTab !== 'il') s.set('bottomTab', 'il');
    revealIlLine(d.line);
  }
}

export function ProblemsPanel() {
  const diags = useStore((s) => s.doc.diagnostics);
  if (!diags.length) return <div className="okline">Sorun yok: program çalıştırılabilir.</div>;
  return (
    <div role="list">
      {diags.map((d, i) => (
        <div
          key={i}
          role="listitem"
          tabIndex={0}
          className={'diag ' + d.severity}
          onClick={() => go(d)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              go(d);
            }
          }}
        >
          <span className="sev">{d.severity === 'error' ? 'HATA' : 'UYARI'}</span>
          <span className="where">{d.line ? `IL ${d.line}` : d.rung !== undefined ? `satır ${d.rung + 1}` : ''}</span>
          <span>{d.message}</span>
          <span className="code">{d.code}</span>
        </div>
      ))}
    </div>
  );
}
