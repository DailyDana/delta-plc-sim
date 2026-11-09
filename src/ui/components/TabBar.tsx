// Sekmeler: tıkla geç, çift tıkla adlandır, orta tık / × kapat, sürükleyerek sırala.
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { isDirty, useStore } from '../state/store';
import { closeTab, renameTabDlg } from './fileops';

export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const active = useStore((s) => s.active);
  const [dragI, setDragI] = useState<number | null>(null);
  const st = useStore.getState;
  return (
    <nav className="tabbar" role="tablist" aria-label="Açık devreler" id="tabs">
      {tabs.map((t, i) => {
        const dirty = isDirty(t) || !t.savedAs;
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={i === active}
            tabIndex={i === active ? 0 : -1}
            className={'tab' + (i === active ? ' active' : '')}
            title={(t.savedAs ? `Kayıt: ${t.savedAs}` : 'Kaydedilmemiş') + ' · çift tık: yeniden adlandır'}
            draggable
            onDragStart={() => setDragI(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragI !== null) st().moveTab(dragI, i);
              setDragI(null);
            }}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                void closeTab(i);
              }
            }}
            onClick={() => st().switchTab(i)}
            onDoubleClick={() => void renameTabDlg(i)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') st().switchTab(Math.min(tabs.length - 1, i + 1));
              if (e.key === 'ArrowLeft') st().switchTab(Math.max(0, i - 1));
              if (e.key === 'F2') void renameTabDlg(i);
            }}
          >
            <span className="tname">{t.name}</span>
            {dirty && <span className="dot" title={t.savedAs ? 'Kaydedilmemiş değişiklik var' : 'Henüz kayıtlara eklenmedi'} />}
            <button
              className="x"
              title="Sekmeyi kapat"
              aria-label={`${t.name} sekmesini kapat`}
              onClick={(e) => {
                e.stopPropagation();
                void closeTab(i);
              }}
            >
              <X />
            </button>
          </div>
        );
      })}
      <button className="tabadd" onClick={() => st().newBlankTab()} title="Yeni sekme" aria-label="Yeni sekme" id="tabAdd">
        <Plus size={16} />
      </button>
    </nav>
  );
}
