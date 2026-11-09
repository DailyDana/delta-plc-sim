// İzleme tablosu: programda geçen Y/M/S/T/C/D cihazlarının canlı değerleri.
// X girişleri G/Ç panelinde olduğu için burada yok. STOP'ta makinedeki değer gösterilir (kalıcılar korunur).

import { counterRange, getProfile, isLatched, parseAddress, timerRange, type DevType, type IlProgram } from '../../core';
import { useStore } from '../state/store';
import { engine } from '../sim/engine';
import { useLive } from '../sim/useLive';

const ORDER: DevType[] = ['Y', 'M', 'S', 'T', 'C', 'D'];

interface Dev {
  text: string;
  type: DevType;
  index: number;
}

function devicesOf(p: IlProgram): Dev[] {
  const seen = new Map<string, Dev>();
  for (const it of p.instrs)
    for (const o of it.ops)
      if (o.addr && !o.invalid && o.addr.type !== 'X' && !seen.has(o.addr.text)) seen.set(o.addr.text, { text: o.addr.text, type: o.addr.type, index: o.addr.index });
  return [...seen.values()].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.index - b.index);
}

/** Programdaki TMR/CNT ayar değeri (makine yokken ya da henüz çalışmamışken) */
function setValueOf(p: IlProgram, text: string): number | null {
  for (const it of p.instrs) if ((it.mn === 'TMR' || it.mn === 'CNT') && it.ops[0]?.addr?.text === text && it.ops[1]?.k !== undefined) return it.ops[1].k;
  return null;
}

const secs = (cv: number, base: number): string => ((cv * base) / 1000).toFixed(base >= 100 ? 1 : base >= 10 ? 2 : 3) + ' s';

export function WatchPanel() {
  useLive();
  const program = useStore((s) => s.doc.program);
  const model = useStore((s) => s.settings.model);
  const m = engine.machine;
  const profile = m?.profile ?? getProfile(model);
  const devs = devicesOf(program);

  if (!devs.length)
    return <div className="hint" style={{ padding: 14 }}>Programda izlenecek cihaz yok. Bir çıkış, röle (M), zamanlayıcı (T) ya da sayıcı (C) ekleyince değerleri burada canlı görünür.</div>;

  return (
    <table className="grid">
      <thead>
        <tr>
          <th>Adres</th>
          <th>Değer</th>
          <th>Durum</th>
          <th>Açıklama</th>
        </tr>
      </thead>
      <tbody>
        {devs.map((d) => {
          const label = program.labels[d.text];
          const latched = isLatched(profile, d.type, d.index);
          let on = false;
          let val: React.ReactNode = '—';
          let bar: React.ReactNode = null;
          const notes: string[] = [];
          if (d.type === 'T') {
            const tr = timerRange(profile, d.index);
            const base = tr?.baseMs ?? 100;
            notes.push(`${base} ms taban`);
            if (tr?.accumulative) notes.push('birikimli');
            if (m) {
              const cv = m.Tcv[d.index] ?? 0;
              const svm = m.Tsv[d.index] ?? -1;
              const sv = svm >= 0 ? svm : setValueOf(program, d.text);
              on = m.Tdone[d.index] === 1;
              val = `${cv} / ${sv ?? '?'}  (${secs(cv, base)})`;
              bar = (
                <div className={'meter' + (on ? ' done' : '')}>
                  <i style={{ width: `${sv ? Math.min(100, (cv / sv) * 100) : on ? 100 : 0}%` }} />
                </div>
              );
            }
          } else if (d.type === 'C') {
            const cr = counterRange(profile, d.index);
            if (cr) notes.push(`${cr.bits} bit`);
            if (m) {
              const cv = m.Ccv[d.index] ?? 0;
              const svm = m.Csv[d.index] ?? -1;
              const sv = svm >= 0 ? svm : setValueOf(program, d.text);
              on = m.Cdone[d.index] === 1;
              val = `${cv} / ${sv ?? '?'}`;
              bar = (
                <div className={'meter' + (on ? ' done' : '')}>
                  <i style={{ width: `${sv ? Math.min(100, (cv / sv) * 100) : on ? 100 : 0}%` }} />
                </div>
              );
            }
          } else if (d.type === 'D') {
            if (m) val = String(m.D[d.index] ?? 0);
          } else {
            if (d.type === 'M' && d.index >= 1000) notes.push('özel röle');
            if (m) {
              const a = parseAddress(d.text).addr;
              on = !!a && m.read(a.type, a.index);
              val = (
                <>
                  <span className={'bit' + (on ? ' on' : '')} />
                  {on ? '1' : '0'}
                </>
              );
            }
          }
          if (latched) notes.push('kalıcı');
          return (
            <tr key={d.text} className={on ? 'on' : undefined}>
              <td className="addr">
                {d.text}
                {label ? <span className="muted" style={{ fontFamily: 'var(--font)', fontWeight: 400, marginLeft: 6 }}>{label}</span> : null}
              </td>
              <td className="val">{val}</td>
              <td>{bar}</td>
              <td className="muted">{notes.join(', ')}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
