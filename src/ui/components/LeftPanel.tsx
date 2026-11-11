// Sol panel: parça panosu (sürükle ya da tıkla) ve proje (örnekler + kayıtlar).
import { useEffect, useRef } from 'react';
import { Download, Eraser, FileText, FolderOpen, Pencil, Rows3, Trash2, Upload } from 'lucide-react';
import { EXAMPLES, parseIl } from '../../core';
import { useStore } from '../state/store';
import { apply, insertPart, newRung, type DragPayload } from '../state/edit';
import { parseBackup } from '../state/persist';
import { beginPointer, clickSuppressed, focusOperandSoon, registerTrash, useDrag, useEraser } from '../ladder/drag';
import { API_PARTS, COIL_PARTS, CONTACT_PARTS, DATA_CONTACT_PARTS, MC_PARTS, PartIcon } from './symbols';
import { askConfirm, askText, showText } from './dialogs';
import { downloadText, fileSafe, openOrSwitch } from './fileops';

function Part({ payload, name, title }: { payload: Extract<DragPayload, { src: 'palette' }>; name: string; title: string }) {
  return (
    <button
      className="part"
      title={`${title}\nSürükle: istediğin yere bırak · tıkla: seçilinin yanına ekle`}
      data-part={payload.k}
      onPointerDown={(e) => beginPointer(e, payload, name)}
      onClick={() => {
        if (clickSuppressed()) return;
        useEraser.getState().toggle(false);
        const s = useStore.getState();
        s.editLadder((l) => insertPart(l, s.sel, payload));
        focusOperandSoon();
      }}
    >
      <PartIcon g={payload.g} k={payload.k} />
      <span>{name}</span>
    </button>
  );
}

function Parts() {
  const eraser = useEraser((s) => s.on);
  return (
    <div className="pbody">
      <div className="trashmsg">
        <Trash2 /> Buraya bırak: sil
      </div>
      <div className="sect">
        <h3>Kontaklar</h3>
        <div className="parts">
          {CONTACT_PARTS.map((p) => (
            <Part key={p.k} payload={{ src: 'palette', g: 'c', k: p.k }} name={p.name} title={`${p.name} (${p.il})`} />
          ))}
        </div>
      </div>
      <div className="sect">
        <h3>Çıkışlar</h3>
        <div className="parts">
          {COIL_PARTS.map((p) => (
            <Part key={p.k} payload={{ src: 'palette', g: 'o', k: p.k }} name={p.name} title={`${p.k}: ${p.desc}`} />
          ))}
        </div>
      </div>
      <div className="sect">
        <h3>Ana kontrol (MC / MCR)</h3>
        <div className="parts">
          {MC_PARTS.map((p) => (
            <Part key={p.k} payload={{ src: 'palette', g: 'o', k: p.k }} name={p.name} title={p.desc} />
          ))}
        </div>
      </div>
      <div className="sect">
        <h3>Veri ve karşılaştırma</h3>
        <div className="parts">
          {DATA_CONTACT_PARTS.map((p) => (
            <Part key={p.k} payload={{ src: 'palette', g: 'c', k: p.k }} name={p.name} title={`${p.name} (${p.il})`} />
          ))}
          {API_PARTS.map((p) => (
            <Part key={p.k} payload={{ src: 'palette', g: 'o', k: p.k }} name={p.name} title={p.desc} />
          ))}
        </div>
      </div>
      <div className="sect">
        <h3>Araçlar</h3>
        <div className="parts">
          <button
            className="part tool"
            title="Seçili satırın altına yeni satır"
            onClick={() => {
              const s = useStore.getState();
              s.editLadder((l) => {
                if (s.sel) {
                  const r = apply(l, s.sel, 'rungBelow');
                  if (!r.refuse) return r;
                }
                const r = newRung(l);
                l.rungs.push(r);
                return r.id;
              });
            }}
          >
            <Rows3 /> Satır
          </button>
          <button className={'part tool' + (eraser ? ' on' : '')} aria-pressed={eraser} title="Açıkken tıkladığın parça silinir (Esc kapatır)" onClick={() => useEraser.getState().toggle()}>
            <Eraser /> Silgi
          </button>
        </div>
      </div>
      <p className="hint">Ladder'da bir öğe seçip <kbd>Enter</kbd>'a basarak komut da yazabilirsin: <code className="mono">X1</code>, <code className="mono">/X2</code>, <code className="mono">|X3</code>, <code className="mono">TMR T0 K50</code>, <code className="mono">MC N0</code>.</p>
    </div>
  );
}

function Project() {
  const lib = useStore((s) => s.lib);
  const tabs = useStore((s) => s.tabs);
  const fileIn = useRef<HTMLInputElement>(null);
  const names = Object.keys(lib).sort((a, b) => lib[b]!.savedAt - lib[a]!.savedAt);
  const s = useStore.getState;

  const rename = async (n: string) => {
    const nn = await askText('Kaydı yeniden adlandır', n, 'Yeni ad:');
    if (!nn || nn === n) return;
    const L = { ...s().lib };
    if (L[nn] && !(await askConfirm('Üzerine yazılsın mı?', `"${nn}" adında bir kayıt zaten var.`, { okText: 'Üzerine yaz', danger: true }))) return;
    if (!L[n]) return;
    L[nn] = L[n]!;
    delete L[n];
    s().setLib(L);
    s().patchTabs((ts) => ts.map((t) => (t.savedAs === n ? { ...t, savedAs: nn, name: nn } : t)));
  };
  const del = async (n: string) => {
    if (!(await askConfirm('Kayıt silinsin mi?', `"${n}" kaydı silinecek. Açık sekme kapanmaz.`, { okText: 'Sil', danger: true }))) return;
    const L = { ...s().lib };
    delete L[n];
    s().setLib(L);
    s().patchTabs((ts) => ts.map((t) => (t.savedAs === n ? { ...t, savedAs: null } : t)));
  };
  const importFile = async (f: File) => {
    const text = await f.text();
    const L = parseBackup(text);
    if (!L) {
      if (/\b(LD|LDI|OUT|END)\b/i.test(text)) {
        s().openInNewTab(f.name.replace(/\.[^.]+$/, ''), text);
        s().showToast('IL dosyası yeni sekmede açıldı');
      } else s().showToast('Dosya okunamadı: .json yedeği ya da .txt IL değil', true);
      return;
    }
    const cur = { ...s().lib };
    let n = 0;
    for (const [k, v] of Object.entries(L)) {
      let name = k;
      let j = 2;
      while (cur[name] && cur[name]!.il !== v.il) name = `${k} (${j++})`;
      cur[name] = v;
      n++;
    }
    s().setLib(cur);
    s().showToast(`${n} kayıt içe aktarıldı`);
  };

  return (
    <div className="pbody">
      <div className="sect">
        <h3>Kayıtlarım</h3>
        <div className="plist">
          {names.length === 0 && <p className="hint">Henüz kayıt yok. Devreyi kurup Ctrl+S ile kaydet.</p>}
          {names.map((n) => {
            const open = tabs.some((t) => t.savedAs === n);
            const rungs = parseIl(lib[n]!.il).program.instrs.filter((i) => i.def.cls === 'output').length;
            return (
              <div key={n} className="pitem" tabIndex={0} onClick={() => openOrSwitch(n)} onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && openOrSwitch(n)} title={`Aç: ${n}\n${new Date(lib[n]!.savedAt).toLocaleString('tr-TR')}`}>
                <FileText size={15} className="muted" />
                <span className="nm">{n}</span>
                {open && <span className="badge">açık</span>}
                <span className="meta">{rungs} çıkış</span>
                <span className="acts" onClick={(e) => e.stopPropagation()}>
                  <button title="Yeniden adlandır" aria-label="Yeniden adlandır" onClick={() => rename(n)}>
                    <Pencil />
                  </button>
                  <button title=".txt indir" aria-label="İndir" onClick={() => downloadText(fileSafe(n) + '.txt', lib[n]!.il)}>
                    <Download />
                  </button>
                  <button title="Metni göster / kopyala" aria-label="Metin" onClick={() => showText(n, lib[n]!.il)}>
                    <FolderOpen />
                  </button>
                  <button title="Sil" aria-label="Sil" onClick={() => del(n)}>
                    <Trash2 />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn sm" onClick={() => downloadText('delta-plc-kayitlar.json', JSON.stringify({ library: s().lib }, null, 2), 'application/json')} disabled={!names.length}>
            <Download /> Yedek al
          </button>
          <button className="btn sm" onClick={() => fileIn.current?.click()}>
            <Upload /> İçe aktar
          </button>
          <button className="btn sm" onClick={() => showText('Kayıt yedeği (JSON)', JSON.stringify({ library: s().lib }, null, 2), 'İndirme engelliyse bu metni kopyalayıp saklayabilirsin.')} disabled={!names.length}>
            Metin
          </button>
          <input
            ref={fileIn}
            type="file"
            accept=".json,.txt,.il"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      <div className="sect">
        <h3>Örnek devreler</h3>
        <div className="plist">
          {EXAMPLES.map((ex, i) => (
            <div key={i} className="pitem" tabIndex={0} data-example={i} onClick={() => s().openInNewTab(ex.name, ex.il)} onKeyDown={(e) => e.key === 'Enter' && s().openInNewTab(ex.name, ex.il)}>
              <FileText size={15} className="muted" />
              <span className="nm">{ex.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LeftPanel() {
  const tab = useStore((s) => s.settings.leftTab);
  const dragSrcLadder = useDrag((s) => s.active && s.payload?.src === 'ladder');
  const overTrash = useDrag((s) => s.overTrash);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    registerTrash(ref.current);
    return () => registerTrash(null);
  }, []);
  const set = useStore.getState().set;
  return (
    <aside className={'side left' + (dragSrcLadder ? ' trash' : '') + (overTrash ? ' hot' : '')} ref={ref} aria-label="Parçalar ve proje">
      <div className="ptabs" role="tablist">
        <button role="tab" aria-selected={tab === 'parts'} className={tab === 'parts' ? 'on' : ''} onClick={() => set('leftTab', 'parts')}>
          Parçalar
        </button>
        <button role="tab" aria-selected={tab === 'project'} className={tab === 'project' ? 'on' : ''} onClick={() => set('leftTab', 'project')}>
          Proje
        </button>
      </div>
      {tab === 'parts' ? <Parts /> : <Project />}
    </aside>
  );
}
