// Özellikler: seçili kontak / çıkış / fonksiyon kutusu / satırın düzenleyicisi.
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, CornerDownRight, GitBranch, ListPlus, Rows3, Trash2 } from 'lucide-react';
import { CMP_OPS, INSTRUCTIONS, checkInstrOperands, coilOperands, contactOperands, getProfile, parseAddress, timerRange, type CmpOp, type Coil, type ContactKind, type Diagnostic, type Profile } from '../../core';
import { useStore } from '../state/store';
import { API_BASES, apiVariant, apply, isApiType, locate, setCoil, setComment, setContact, setLabel, type Action } from '../state/edit';
import { API_PARTS, COIL_PARTS, CONTACT_PARTS, DATA_CONTACT_PARTS, PartIcon } from './symbols';

const CHIPS_C = ['X0', 'X1', 'X2', 'X3', 'Y0', 'Y1', 'M0', 'M1', 'T0', 'T1', 'C0', 'M1000', 'M1013'];
const CHIPS_O = ['Y0', 'Y1', 'Y2', 'M0', 'M1', 'T0', 'T1', 'C0', 'C1'];
const CHIPS_W = ['D0', 'D1', 'D2', 'K0', 'K1', 'K10', 'K100', 'T0', 'C0', 'K1Y0'];
const CMP_TITLE: Record<CmpOp, string> = { '=': 'eşit', '>': 'büyük', '<': 'küçük', '<>': 'eşit değil', '<=': 'küçük ya da eşit', '>=': 'büyük ya da eşit' };

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
  const a = parseAddress(op).addr;
  if (!a) return null;
  return (
    <label className="field">
      Etiket ({key} için açıklama)
      <input className="input" value={labels[key] ?? ''} placeholder="ör. start butonu" onChange={(e) => useStore.getState().editLadder((l) => setLabel(l, op, e.target.value), true)} />
    </label>
  );
}

/** Hata, hangi işlenene ait? (mesajda işlenen metni geçiyorsa) */
const errFor = (errs: Diagnostic[], raw: string): Diagnostic | undefined => errs.find((d) => raw && d.message.toUpperCase().includes(raw.toUpperCase()));

function OpInput({ id, value, bad, onChange, placeholder }: { id?: string; value: string; bad: boolean; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      id={id}
      className={'input mono' + (bad ? ' bad' : '')}
      value={value}
      spellCheck={false}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.toUpperCase().replace(/\s+/g, ''))}
      onKeyDown={(e) => e.key === 'Enter' && document.querySelector<HTMLElement>('.ladderwrap')?.focus()}
    />
  );
}

function ContactProps({ c, ri, profile }: { c: import('../../core').Contact; ri: number; profile: Profile }) {
  const edit = useStore.getState().editLadder;
  const co = contactOperands(c);
  const errs = checkInstrOperands(co.mn, co.ops, profile);
  const kinds = [...CONTACT_PARTS, ...DATA_CONTACT_PARTS];
  const cur = kinds.find((p) => p.k === c.kind);
  return (
    <div className="props">
      <h2>
        {c.kind === 'CMP' ? 'Karşılaştırma kontağı' : c.kind === 'INV' ? 'Ters çevir (INV)' : 'Kontak'} <span className="tag">satır {ri + 1}</span>
      </h2>
      <div className="field">
        Tür
        <div className="kinds" role="radiogroup" aria-label="Kontak türü">
          {kinds.map((p) => (
            <button key={p.k} role="radio" aria-checked={c.kind === p.k} className={c.kind === p.k ? 'on' : ''} title={`${p.name} (${p.il})`} onClick={() => edit((l) => setContact(l, c.id, { kind: p.k as ContactKind }))}>
              <PartIcon g="c" k={p.k} />
            </button>
          ))}
        </div>
        <span className="tipline">
          {cur?.name} · IL: {c.kind === 'CMP' ? `${co.mn} S1 S2` : cur?.il}
        </span>
      </div>

      {c.kind === 'CMP' && (
        <>
          <div className="field">
            Koşul: S1 ? S2 doğruysa kontak kapanır
            <div className="kinds cmpops" role="radiogroup" aria-label="Karşılaştırma işleci">
              {CMP_OPS.map((op) => (
                <button key={op} role="radio" aria-checked={c.cmp === op} className={c.cmp === op ? 'on' : ''} title={`S1 ${CMP_TITLE[op]} S2 ise`} onClick={() => edit((l) => setContact(l, c.id, { cmp: op }))}>
                  {op}
                </button>
              ))}
            </div>
          </div>
          <div className="pair">
            <label className="field">
              S1
              <OpInput id="prop-op" value={c.op} bad={!!errFor(errs, c.op)} onChange={(v) => edit((l) => setContact(l, c.id, { op: v }), true)} />
            </label>
            <span className="pairop mono">{c.cmp}</span>
            <label className="field">
              S2
              <OpInput value={c.op2 ?? ''} bad={!!errFor(errs, c.op2 ?? '')} onChange={(v) => edit((l) => setContact(l, c.id, { op2: v }), true)} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={!!c.d32} onChange={(e) => edit((l) => setContact(l, c.id, { d32: e.target.checked }))} /> 32 bit (D{co.mn.replace(/^D/, '')})
          </label>
          {errs[0] && <div className="errmsg">{errs[0].message}</div>}
          <div className="chips">
            {CHIPS_W.map((x) => (
              <button key={x} onClick={() => edit((l) => setContact(l, c.id, { op2: x }))} title="S2 olarak yaz">
                {x}
              </button>
            ))}
          </div>
          <p className="tipline">Kelime işlenenleri: D0, T0 (değeri), C0 (değeri), K10 sabit, H1F onaltılık, K1Y0 (Y0–Y3 bit grubu). İşaretli karşılaştırır.</p>
        </>
      )}

      {c.kind === 'INV' && <p className="tipline">INV, solundaki koşulun sonucunu ters çevirir: akım geliyorsa keser, gelmiyorsa geçirir. Paralel dal içindeyse yalnızca o dalın sonucunu çevirir.</p>}

      {c.kind !== 'CMP' && c.kind !== 'INV' && (
        <>
          <label className="field">
            Adres
            <OpInput id="prop-op" value={c.op} bad={!!errs[0]} onChange={(v) => edit((l) => setContact(l, c.id, { op: v }), true)} />
          </label>
          {errs[0] && <div className="errmsg">{errs[0].message}</div>}
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
        </>
      )}
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

function ApiProps({ id, c, profile }: { id: string; c: Coil; profile: Profile }) {
  const edit = useStore.getState().editLadder;
  const def = INSTRUCTIONS[c.type]!;
  const base = def.base!;
  const ops = [c.op, ...(c.args ?? [])];
  const errs = checkInstrOperands(c.type, ops, profile);
  const canD32 = !!apiVariant(c.type, true, !!def.pulse);
  const setOp = (i: number, v: string) =>
    edit((l) => {
      const next = [...ops];
      next[i] = v;
      setCoil(l, id, { op: next[0] ?? '', args: next.slice(1) });
    }, true);
  const variant = (d32: boolean, pulse: boolean) => {
    const mn = apiVariant(c.type, d32, pulse);
    if (mn) edit((l) => setCoil(l, id, { type: mn }));
  };
  return (
    <>
      <label className="field">
        Fonksiyon
        <select className="select" value={base} onChange={(e) => edit((l) => setCoil(l, id, { type: e.target.value }))}>
          {API_BASES.map((b) => (
            <option key={b} value={b}>
              {b} · {API_PARTS.find((p) => p.k === b)?.name ?? INSTRUCTIONS[b]?.desc}
            </option>
          ))}
        </select>
      </label>
      <p className="tipline" style={{ marginTop: 6 }}>
        {INSTRUCTIONS[base]?.desc} <span className="mono">(API {def.api})</span>
      </p>
      {def.operands.map((spec, i) => {
        const v = ops[i] ?? '';
        return (
          <label className="field" key={i} style={{ marginTop: 8 }}>
            {spec.name}
            <OpInput id={i === 0 ? 'prop-op' : undefined} value={v} bad={!!errFor(errs, v) || (!v && errs.length > 0)} onChange={(nv) => setOp(i, nv)} />
          </label>
        );
      })}
      {errs[0] && <div className="errmsg">{errs[0].message}</div>}
      <div className="checks">
        <label className="check" title="Yalnızca sürücü akımın yükselen kenarında bir kez çalışır (ör. INCP her basışta +1)">
          <input type="checkbox" checked={!!def.pulse} onChange={(e) => variant(!!def.d32, e.target.checked)} /> Darbe (P): her basışta bir kez
        </label>
        <label className="check" title={canD32 ? '32 bit: D0 ile D1 birlikte (D1 yüksek kelime)' : 'Bu komutun 32 bit biçimi yok'}>
          <input type="checkbox" disabled={!canD32 && !def.d32} checked={!!def.d32} onChange={(e) => variant(e.target.checked, !!def.pulse)} /> 32 bit (D önekli)
        </label>
      </div>
      <p className="tipline">Kelime işlenenleri: D0, T0, C0, K10, H1F, K1Y0 (Y0–Y3). Komut adı: <b className="mono">{c.type}</b></p>
    </>
  );
}

function CoilProps({ id, c, ri, profile }: { id: string; c: Coil; ri: number; profile: Profile }) {
  const edit = useStore.getState().editLadder;
  const api = isApiType(c.type);
  const isTC = c.type === 'TMR' || c.type === 'CNT';
  const co = coilOperands(c);
  const errs = checkInstrOperands(co.mn, co.ops, profile);
  let kHint = '';
  const a = parseAddress(c.op).addr;
  if (c.type === 'TMR' && a?.type === 'T') {
    const tr = timerRange(profile, a.index);
    const k = parseInt(c.k, 10);
    if (tr) {
      const fromD = /^D/i.test(c.k.trim());
      const secs = fromD || Number.isNaN(k) ? '?' : ((k * tr.baseMs) / 1000).toFixed(tr.baseMs >= 100 ? 1 : 3);
      kHint = `${c.op}: ${tr.baseMs} ms taban${tr.accumulative ? ', birikimli' : ''} → ${fromD ? c.k.toUpperCase() + ' içeriği × ' + tr.baseMs + ' ms' : `K${Number.isNaN(k) ? '?' : k} = ${secs} s`} (${profile.id})`;
    }
  }
  return (
    <div className="props">
      <h2>
        {api ? 'Fonksiyon kutusu' : 'Çıkış'} <span className="tag">satır {ri + 1}</span>
      </h2>
      <div className="field">
        Komut
        <div className="kinds coils" role="radiogroup" aria-label="Çıkış komutu">
          {COIL_PARTS.map((p) => (
            <button key={p.k} role="radio" aria-checked={c.type === p.k} className={c.type === p.k ? 'on' : ''} title={`${p.name}: ${p.desc}`} onClick={() => edit((l) => setCoil(l, id, { type: p.k }))}>
              {p.k}
            </button>
          ))}
          <button role="radio" aria-checked={api} className={api ? 'on' : ''} title="Fonksiyon kutusu: MOV, CMP, ADD…" onClick={() => !api && edit((l) => setCoil(l, id, { type: 'MOV' }))}>
            FNC
          </button>
        </div>
        {!api && <span className="tipline">{COIL_PARTS.find((p) => p.k === c.type)?.desc}</span>}
      </div>
      {api ? (
        <ApiProps id={id} c={c} profile={profile} />
      ) : (
        <>
          <label className="field">
            Adres
            <OpInput id="prop-op" value={c.op} bad={!!errFor(errs, c.op) || (!!errs[0] && !isTC)} onChange={(v) => edit((l) => setCoil(l, id, { op: v }), true)} />
          </label>
          <div className="chips">
            {CHIPS_O.filter((x) => (c.type === 'TMR' ? x[0] === 'T' : c.type === 'CNT' ? x[0] === 'C' : c.type === 'RST' ? true : x[0] !== 'T' && x[0] !== 'C')).map((x) => (
              <button key={x} className={x === c.op ? 'cur' : ''} onClick={() => edit((l) => setCoil(l, id, { op: x }))}>
                {x}
              </button>
            ))}
          </div>
          {isTC && (
            <label className="field" style={{ marginTop: 10 }}>
              Ayar değeri (sayı ya da D kaydedicisi)
              <OpInput value={c.k} bad={!!errFor(errs, c.k)} onChange={(v) => edit((l) => setCoil(l, id, { k: v.replace(/^K(?=\d)/, '') }), true)} placeholder="50 ya da D0" />
              {kHint && <span className="tipline">{kHint}</span>}
            </label>
          )}
          {errs[0] && <div className="errmsg">{errs[0].message}</div>}
          <div style={{ marginTop: 10 }}>
            <LabelField op={c.op} />
          </div>
        </>
      )}
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
          <span>Seçilinin yanına komut yaz (X1, |X2, MOV K5 D0)</span>
          <kbd>Ok tuşları</kbd>
          <span>Ladder'da gezin</span>
          <kbd>Ctrl K</kbd>
          <span>Komut paleti</span>
        </div>
      </div>
    );
  }

  if (loc.kind === 'contact') return <ContactProps c={loc.node} ri={loc.ri} profile={profile} />;
  if (loc.kind === 'output') return loc.o.coil ? <CoilProps id={loc.o.id} c={loc.o.coil} ri={loc.ri} profile={profile} /> : null;

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
