import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../i18n';
import { enqueue } from '../../lib/offlineQueue';
import { newOpId } from '../../lib/supabase';
import { optimisticLog } from '../../lib/optimistic';
import { useSettings } from '../../lib/api';
import type { InventoryItem, ProcessCode } from '../../lib/types';
import { categoryFor } from '../../domain/categories';
import { PROCESSES, isItemVisible } from '../../domain/folders';
import { stepFor, fmtQty } from '../../domain/units';
import { convertQty } from '../../domain/measure';
import { btn, btnPrimary, chip, label } from '../../ui';
import { QtyStepper } from './QtyStepper';

interface Props {
  /** the hidden service project */
  projectId: string;
  batchId: string;
  items: InventoryItem[];
  onClose: () => void;
}

/** Quick Service: a modal for walk-in repairs. Labour chips and a consumable picker, logged to the service project. */
export function QuickServiceModal({ projectId, batchId, items, onClose }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const settings = useSettings();
  const enabled: readonly ProcessCode[] = settings.data?.enabled_processes ?? PROCESSES;
  const [itemId, setItemId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // modal behaviour: focus moves in, Esc closes, the page behind does not scroll, focus returns on close
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  const pickable = items.filter((i) => i.qty_on_hand > 0 && isItemVisible(i, enabled));
  const item = pickable.find((i) => i.id === itemId) ?? null;
  const stepOf = (i: InventoryItem) => Math.min(stepFor(i.unit_label), i.qty_on_hand);

  const send = (it: InventoryItem | null, amount: number, text: string) => {
    const opId = newOpId();
    const category = it ? categoryFor(it) : 'LABOR';
    optimisticLog(qc, { opId, projectId, category, qty: amount, description: it?.name ?? 'Labour', unitCost: it ? it.last_buy_price : (settings.data?.hourly_labor_rate ?? 0), itemId: it?.id ?? null });
    void enqueue('log_project_activity', {
      p_client_op_id: opId, p_project_id: projectId, p_category: category, p_qty: amount,
      p_description: it?.name ?? 'Labour', p_inventory_id: it?.id ?? null, p_service_batch_id: batchId,
      p_charged_amount: null, p_payment_status: null,
    });
    setMsg(t('workbench.quick.logged', { text }));
  };

  const labour: { hours: number; key: 'workbench.quick.min10' | 'workbench.quick.min30' | 'workbench.quick.hour1' }[] = [
    { hours: 0.167, key: 'workbench.quick.min10' }, { hours: 0.5, key: 'workbench.quick.min30' }, { hours: 1, key: 'workbench.quick.hour1' },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t('workbench.quick.title')} className="mx-auto min-h-full max-w-xl bg-ink sm:min-h-0 sm:rounded-[3px] sm:shadow-[inset_0_0_0_1px_var(--color-rule)]">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-rule bg-deck px-4 py-2">
          <h2 className="font-display text-xl font-extrabold">{t('workbench.quick.title')}</h2>
          <button ref={closeRef} className={btn} onClick={onClose}>{t('common.close')}</button>
        </div>
        <div className="p-4">
          <p className="mb-4 text-sm text-mute">{t('workbench.quick.hint')}</p>

          <p className={`${label} mb-2`}>{t('workbench.quick.labour')}</p>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {labour.map((l) => (
              <button key={l.key} className={`${chip} min-h-[56px] text-base`} onClick={() => send(null, l.hours, t('workbench.quick.labourText', { what: t(l.key).replace('+', '') }))}>{t(l.key)}</button>
            ))}
          </div>

          <p className={`${label} mb-2`}>{t('workbench.quick.material')}</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {pickable.map((i) => (
              <button key={i.id} className={chip} data-on={i.id === itemId} aria-pressed={i.id === itemId}
                onClick={() => { setItemId(i.id); setQty(stepOf(i)); }}>
                {i.name} ({fmtQty(i.qty_on_hand, i.unit_label)})
              </button>
            ))}
            {!pickable.length && <p className="text-sm text-mute">{t('workbench.quick.noMaterial')}</p>}
          </div>

          {item && (
            <div className="space-y-3">
              <QtyStepper value={Math.min(qty, item.qty_on_hand)} step={stepOf(item)} min={stepOf(item)} max={item.qty_on_hand} display={(v) => convertQty(v, item.unit_label)} onChange={setQty}
                lessLabel={t('workbench.quick.less')} moreLabel={t('workbench.quick.more')} />
              <button className={`${btnPrimary} min-h-[56px] w-full`} onClick={() => { send(item, Math.min(qty, item.qty_on_hand), `${fmtQty(qty, item.unit_label)} ${item.name}`); setQty(stepOf(item)); }}>
                {t('workbench.quick.submit', { qty: fmtQty(qty, item.unit_label) })}
              </button>
            </div>
          )}
          {msg && <p className="mt-3 text-sm text-ok" role="status">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
