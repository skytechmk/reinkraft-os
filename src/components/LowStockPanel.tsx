import type { InventoryItem, ProcessCode } from '../lib/types';
import { isItemVisible, isLow } from '../domain/folders';
import { fmtQty } from '../domain/units';
import { useI18n } from '../i18n';
import { Gauge } from './Gauge';

interface Props {
  items: InventoryItem[];
  /** settings.enabled_processes: items of a switched-off welding process are not listed */
  enabledProcesses: readonly ProcessCode[];
}

/** Pinned alert panel: only the visible items that are at or below their alert level. */
export function LowStockPanel({ items, enabledProcesses }: Props) {
  const { t } = useI18n();
  const low = items.filter((i) => isLow(i) && isItemVisible(i, enabledProcesses));

  return (
    <section aria-label={t('shell.lowStock.title')} className="shrink-0 rounded-[3px] bg-plate shadow-[inset_0_0_0_1px_var(--color-rule)]">
      <header className="flex min-h-[44px] items-center justify-between gap-3 rounded-t-[3px] border-b border-rule bg-deck px-4">
        <h2 className="font-display text-lg font-extrabold tracking-wide">{t('shell.lowStock.title')}</h2>
        <span className={`num text-lg ${low.length ? 'text-crit' : 'text-ok'}`}>{low.length}</span>
      </header>
      {low.length ? (
        <ul className="max-h-[32dvh] space-y-3 overflow-y-auto p-4">
          {low.map((i) => (
            <li key={i.id}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{i.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="rounded-[2px] bg-crit px-1.5 text-xs font-bold text-white">{t('shell.lowStock.alarm')}</span>
                  <span className="font-semibold text-crit">{fmtQty(i.qty_on_hand, i.unit_label)}</span>
                </span>
              </div>
              <div className="mt-1.5">
                <Gauge value={i.qty_on_hand} max={Math.max(i.qty_on_hand, i.min_alert_qty * 3, 1)} marker={i.min_alert_qty} tone="crit" label={t('shell.lowStock.stockOf', { name: i.name })} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-sm font-semibold text-ok">{t('shell.lowStock.empty')}</p>
      )}
    </section>
  );
}
