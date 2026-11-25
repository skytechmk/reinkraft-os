import { useMemo, useState } from 'react';
import { useInventory, useSettings } from '../../lib/api';
import { buildTree, defaultOpen, type SectionId } from './grouping';
import { ItemRow } from './ItemRow';
import { AddItemForm } from './AddItemForm';
import { chip, input } from '../../ui';
import { useI18n, type MessageKey } from '../../i18n';

const folderKey = (id: string) => `inventory.folder.${id}` as MessageKey;
const subKey = (id: string) => (id === 'UNSORTED' ? 'inventory.folder.UNSORTED' : `inventory.sub.${id}`) as MessageKey;

function Header({ title, count, low, open, onToggle, level }: { title: string; count: number; low: number; open: boolean; onToggle: () => void; level: 1 | 2 }) {
  const { t } = useI18n();
  return (
    <button
      type="button" aria-expanded={open} onClick={onToggle}
      className={`flex min-h-[48px] w-full items-center gap-3 rounded-[3px] px-3 text-left ${level === 1 ? 'bg-deck font-display text-lg font-extrabold' : 'bg-raised font-semibold'}`}
    >
      <span className="text-signal" aria-hidden>{open ? '▼' : '▶'}</span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="num text-sm text-mute">{t('inventory.itemCount', { n: count })}</span>
      {low > 0 && <span className="rounded-[2px] bg-crit px-1.5 text-xs font-bold text-white">{t('inventory.lowCount', { n: low })}</span>}
    </button>
  );
}

export function InventoryPanel() {
  const { t } = useI18n();
  const inv = useInventory();
  const settings = useSettings();
  const cur = settings.data?.currency ?? 'EUR';
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const searching = query.trim() !== '';
  const tree = useMemo(() => buildTree(inv.data ?? [], settings.data?.enabled_processes ?? [], query, lowOnly), [inv.data, settings.data?.enabled_processes, query, lowOnly]);
  const isOpen = (key: string, low: number) => (key in toggled ? toggled[key] : defaultOpen(low, searching || lowOnly));
  const flip = (key: string, low: number) => setToggled((m) => ({ ...m, [key]: !isOpen(key, low) }));

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input className={input} placeholder={t('inventory.search')} aria-label={t('inventory.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" className={chip} data-on={lowOnly} aria-pressed={lowOnly} onClick={() => setLowOnly(!lowOnly)}>{t('inventory.lowOnly')}</button>
        </div>

        <div className="space-y-3">
          {tree.map((f) => {
            const fKey = f.id as SectionId;
            const fOpen = isOpen(fKey, f.low);
            return (
              <section key={fKey} className="rounded-[3px] bg-plate shadow-[inset_0_0_0_1px_var(--color-rule)]">
                <Header level={1} title={t(folderKey(fKey))} count={f.count} low={f.low} open={fOpen} onToggle={() => flip(fKey, f.low)} />
                {fOpen && (
                  <div className="space-y-2 p-2">
                    {f.subs.map((s) => {
                      const sKey = `${fKey}/${s.id}`;
                      const sOpen = isOpen(sKey, s.low);
                      return (
                        <div key={sKey}>
                          {fKey === 'UNSORTED' ? null : <Header level={2} title={t(subKey(s.id))} count={s.items.length} low={s.low} open={sOpen} onToggle={() => flip(sKey, s.low)} />}
                          {(fKey === 'UNSORTED' || sOpen) && (
                            <ul className="mt-2 space-y-2">
                              {s.items.map((i) => <ItemRow key={i.id} item={i} currency={cur} />)}
                              {!s.items.length && <li className="rounded-[3px] border border-dashed border-rule p-4 text-center text-sm text-mute">{t('inventory.emptySub')}</li>}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
          {!tree.length && <p className="rounded-[3px] border border-dashed border-rule p-8 text-center text-mute">{inv.data?.length ? t('inventory.noMatch') : t('inventory.empty')}</p>}
        </div>
      </div>

      <AddItemForm />
    </div>
  );
}
