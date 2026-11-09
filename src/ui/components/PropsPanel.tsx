// Özellikler: seçili kontak / çıkış / satırın düzenleyicisi.
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, CornerDownRight, GitBranch, ListPlus, Rows3, Trash2 } from 'lucide-react';
import { checkInstrOperands, getProfile, parseAddress, timerRange, type CoilType, type ContactKind } from '../../core';
import { CONTACT_MNEMONICS } from '../../core/instructions';
import { useStore } from '../state/store';
import { apply, locate, setCoil, setComment, setContact, setLabel, type Action } from '../state/edit';
import { COIL_PARTS, CONTACT_PARTS, PartIcon } from './symbols';

const CHIPS_C = ['X0', 'X1', 'X2', 'X3', 'Y0', 'Y1', 'M0', 'M1', 'T0', 'T1', 'C0', 'M1000', 'M1013'];
const CHIPS_O = ['Y0', 'Y1', 'Y2', 'M0', 'M1', 'T0', 'T1', 'C0', 'C1'];

function Act({ a, icon, children, danger, wide }: { a: Action; icon: React.ReactNode; children: React.ReactNode; danger?: boolean; wide?: boolean }) {
  const run = () => {
    const s = useStore.getState();
    s.editLadder((l) => apply(l, s.sel, a));
    if (['addLeft', 'addRight', 'parContact', 'parSeries', 'addBranchContact', 'addOutput'].includes(a)) setTimeout(() => document.getElementById('prop-op')?.focus(), 40);
  };
  return (
    <button className={'btn' + (danger ? ' danger' : '') + (wide ? ' wide' : '')} onClick={run}>
      {icon}
      {children}
    </button>
  );
}

function LabelField({ op }: { op: string }) {
  const labels = useStore((s) => s.doc.ladder?.labels ?? {});
  const key = op.toUpperCase();
  const valid = !!parseAddress(op).addr;
  if (!valid) return null;
  return (
    <label className="field">
      Etiket ({key} için açıklama)
      <input
        className="input"
        value={labels[key] ?? ''}
        placeholder="ör. start butonu"
        onChange={(e) => useStore.getState().editLadder((l) => setLabel(l, op, e.target.value), true)}
      />
    </label>
  );
}

export function PropsPanel() {
  const ladder = useStore((s) => s.doc.ladder);
  const sel = useStore((s) => s.sel);
  const model = useStore((s) => s.settings.model);
  const profile = getProfile(model);
  const loc = ladder ? locate(ladder, sel) : null;
  const edit = useStore.getState().editLadder;

  if (!loc) {
    return (
      <div className="props">
        <h2>Özellikler</h2>
        <p className="hint">Düzenlemek için ladder'da bir kontağa, çıkışa ya da satır numarasına tıkla. Panodan parça sürükle ya da tıkla.</p>
        <div className="keys" style={{ marginTop: 12 }}>
          <kbd>F5</kbd>
          <span>RUN</span>
          <kbd>Boşluk</kbd>
          <span>Duraklat / devam</span>
          <kbd>0</kbd>
          <span>0–7: X0–X7 girişine bas</span>
          <kbd>Enter</kbd>
          <span>Seçilinin yanına komut yaz (X1, |X2, OUT Y1)</span>
          <kbd>Ok tuşları</kbd>
          <span>Ladder'da gezin</span>
          <kbd>Ctrl K</kbd>
          <span>Komut paleti</span>
        </div>
      </div>
    );
  }

  if (loc.kind === 'contact') {
    const c = loc.node;
    const err = checkInstrOperands(CONTACT_MNEMONICS[c.kind][0], [c.op], profile)[0];
    return (
      <div className="props">
        <h2>
          Kontak <span className="tag">satır {loc.ri + 1}</span>
        </h2>
        <div className="field">
          Tür
          <div className="kinds" role="radiogroup" aria-label="Kontak türü">
            {CONTACT_PARTS.map((p) => (
              <button
                key={p.k}
                role="radio"
                aria-checked={c.kind === p.k}
                className={c.kind === p.k ? 'on' : ''}
                title={`${p.name} (${p.il})`}
                onClick={() => edit((l) => setContact(l, c.id, { kind: p.k as ContactKind }))}
              >
                <PartIcon g="c" k={p.k} />
              </button>
            ))}
          </div>
          <span className="tipline">{CONTACT_PARTS.find((p) => p.k === c.kind)?.name} · IL: {CONTACT_PARTS.find((p) => p.k === c.kind)?.il}</span>
        </div>
        <label className="field">
          Adres
          <input
            id="prop-op"
            className={'input mono' + (err ? ' bad' : '')}
            value={c.op}
            spellCheck={false}
            onChange={(e) => edit((l) => setContact(l, c.id, { op: e.target.value.toUpperCase().trim() }), true)}
            onKeyDown={(e) => e.key === 'Enter' && document.getElementById('ladder')?.closest<HTMLElement>('.ladderwrap')?.focus()}
          />
        </label>
        {err && <div className="errmsg">{err.message}</div>}
        <div className="chips">
          {CHIPS_C.map((x) => (
            <button key={x} className={x === c.op ? 'cur' : ''} onClick={() => edit((l) => setContact(l, c.id, { op: x }))}>
              {x}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <LabelField op={c.op} />
        </div>
        <div className="acts">
          <Act a="addLeft" icon={<ArrowLeft />}>
            Sola seri
          </Act>
          <Act a="addRight" icon={<ArrowRight />}>
            Sağa seri
          </Act>
          <Act a="parContact" icon={<CornerDownRight />}>
            Buna paralel
          </Act>
          <Act a="parSeries" icon={<GitBranch />}>
            Hatta paralel
          </Act>
          <Act a="duplicate" icon={<Copy />}>
            Çoğalt
          </Act>
          <Act a="delete" icon={<Trash2 />} danger>
            Sil
          </Act>
        </div>
        <p className="tipline">"Hatta paralel": bu kontağın bulunduğu seri hattın tamamına alt dal açar (mühürleme gibi).</p>
      </div>
    );
  }

  if (loc.kind === 'output') {
    const o = loc.o;
    const c = o.coil;
    if (!c) return null;
    const isTC = c.type === 'TMR' || c.type === 'CNT';
    const err = checkInstrOperands(c.type, isTC ? [c.op, c.k] : [c.op], profile)[0];
    let kHint = '';
    const a = parseAddress(c.op).addr;
    if (c.type === 'TMR' && a?.type === 'T') {
      const tr = timerRange(profile, a.index);
      const k = parseInt(c.k, 10);
      if (tr) {
        const secs = Number.isNaN(k) ? '?' : ((k * tr.baseMs) / 1000).toFixed(tr.baseMs >= 100 ? 1 : 3);
        kHint = `${c.op}: ${tr.baseMs} ms taban${tr.accumulative ? ', birikimli' : ''} → K${Number.isNaN(k) ? '?' : k} = ${secs} s (${profile.id})`;
      }
    }
    return (
      <div className="props">
        <h2>
          Çıkış <span className="tag">satır {loc.ri + 1}</span>
        </h2>
        <div className="field">
          Komut
          <div className="kinds coils" role="radiogroup" aria-label="Çıkış komutu">
            {COIL_PARTS.map((p) => (
              <button key={p.k} role="radio" aria-checked={c.type === p.k} className={c.type === p.k ? 'on' : ''} title={`${p.name}: ${p.desc}`} onClick={() => edit((l) => setCoil(l, o.id, { type: p.k as CoilType }))}>
                {p.k}
              </button>
            ))}
          </div>
          <span className="tipline">{COIL_PARTS.find((p) => p.k === c.type)?.desc}</span>
        </div>
        <label className="field">
          Adres
          <input id="prop-op" className={'input mono' + (err && !/K değeri|sabit/.test(err.message) ? ' bad' : '')} value={c.op} spellCheck={false} onChange={(e) => edit((l) => setCoil(l, o.id, { op: e.target.value.toUpperCase().trim() }), true)} />
        </label>
        <div className="chips">
          {CHIPS_O.filter((x) => (c.type === 'TMR' ? x[0] === 'T' : c.type === 'CNT' ? x[0] === 'C' : c.type === 'RST' ? true : x[0] !== 'T' && x[0] !== 'C')).map((x) => (
            <button key={x} className={x === c.op ? 'cur' : ''} onClick={() => edit((l) => setCoil(l, o.id, { op: x }))}>
              {x}
            </button>
          ))}
        </div>
        {isTC && (
          <label className="field" style={{ marginTop: 10 }}>
            Ayar değeri (K)
            <input className="input mono" type="number" min={profile.minK} max={32767} value={c.k} onChange={(e) => edit((l) => setCoil(l, o.id, { k: e.target.value }), true)} />
            {kHint && <span className="tipline">{kHint}</span>}
          </label>
        )}
        {err && <div className="errmsg">{err.message}</div>}
        <div style={{ marginTop: 10 }}>
          <LabelField op={c.op} />
        </div>
        <div className="acts">
          <Act a="addOutput" icon={<ListPlus />}>
            Alta çıkış
          </Act>
          <Act a="addBranchContact" icon={<CornerDownRight />}>
            Dala kontak
          </Act>
          <Act a="duplicate" icon={<Copy />}>
            Çoğalt
          </Act>
          <Act a="delete" icon={<Trash2 />} danger>
            Sil
          </Act>
        </div>
        <p className="tipline">Alta çıkış: aynı koşulla çalışan ikinci çıkış. Dala kontak: yalnızca bu çıkışa giden ek koşul (IL'de MPS/MRD/MPP olur).</p>
      </div>
    );
  }

  const r = loc.r;
  return (
    <div className="props">
      <h2>Satır {loc.ri + 1}</h2>
      <label className="field">
        Açıklama
        <textarea className="input" rows={3} value={r.comment} placeholder="Bu satır ne yapıyor?" onChange={(e) => edit((l) => setComment(l, r.id, e.target.value), true)} />
      </label>
      <div className="acts">
        <Act a="rungAbove" icon={<Rows3 />}>
          Üstüne satır
        </Act>
        <Act a="rungBelow" icon={<Rows3 />}>
          Altına satır
        </Act>
        <Act a="rungUp" icon={<ArrowUp />}>
          Yukarı taşı
        </Act>
        <Act a="rungDown" icon={<ArrowDown />}>
          Aşağı taşı
        </Act>
        <Act a="duplicate" icon={<Copy />}>
          Çoğalt
        </Act>
        <Act a="delete" icon={<Trash2 />} danger>
          Satırı sil
        </Act>
      </div>
      <p className="tipline">Klavye: Alt+↑/↓ satırı taşır, Ctrl+D çoğaltır.</p>
    </div>
  );
}
