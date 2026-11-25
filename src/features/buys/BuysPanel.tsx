import { useMemo, useState } from 'react';
import { enqueue } from '../../lib/offlineQueue';
import { newOpId } from '../../lib/supabase';
import { useInventory, usePurchases, useSettings } from '../../lib/api';
import { Stepper } from '../../components/Stepper';
import { stepFor, fmtMoney, fmtQty } from '../../domain/units';
import { convertQty } from '../../domain/measure';
import { FOLDERS, findSubfolder, isItemVisible } from '../../domain/folders';
import { btnPrimary, card, chip, input, label } from '../../ui';
import { useI18n, type MessageKey } from '../../i18n';

export function BuysPanel() {
  const { t, unit: unitLabel, lang } = useI18n();
  const inv = useInventory();
  const purchases = usePurchases();
  const settings = useSettings();
  const [itemId, setItemId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);
  const [brand, setBrand] = useState('');
  const [msg, setMsg] = useState('');
  const [folder, setFolder] = useState<string>('ALL');
  const [query, setQuery] = useState('');

  const enabled = settings.data?.enabled_processes ?? [];
  const folderOf = (i: { folder: string | null; subfolder: string | null }) => (i.folder && findSubfolder(i.folder, i.subfolder) ? i.folder : 'UNSORTED');
  const visible = useMemo(() => (inv.data ?? []).filter((i) => isItemVisible(i, enabled)), [inv.data, enabled]);
  const folders = useMemo(() => {
    const present = new Set(visible.map(folderOf));
    return ['ALL', ...FOLDERS.map((f) => f.id).filter((id) => present.has(id)), ...(present.has('UNSORTED') ? ['UNSORTED'] : [])];
  }, [visible]);
  const q = query.trim().toLowerCase();
  const shown = visible.filter((i) => (folder === 'ALL' || folderOf(i) === folder) && (!q || i.name.toLowerCase().includes(q)));

  const item = inv.data?.find((i) => i.id === itemId) ?? null;
  const currency = settings.data?.currency ?? 'EUR';

  const record = () => {
    if (!item) return;
    void enqueue('record_purchase', {
      p_client_op_id: newOpId(),
      p_inventory_id: item.id,
      p_qty: qty,
      p_unit_price: price,
      p_brand_tag: brand.trim() || null,
    })
      .then(() => setMsg(t('buys.queued', { qty: fmtQty(qty, item.unit_label), name: item.name })))
      .catch(() => setMsg(t('buys.queueFailed')));
  };

  return (
    <div>
      <div className={card}>
        <p className={`${label} mb-2`}>{t('buys.item')}</p>
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t('buys.folderLabel')}>
          {folders.map((f) => (
            <button key={f} className={chip} data-on={f === folder} aria-pressed={f === folder} onClick={() => setFolder(f)}>{t(`buys.folder.${f}` as MessageKey)}</button>
          ))}
        </div>
        <input className={`${input} mb-3`} placeholder={t('buys.search')} aria-label={t('buys.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="mb-4 flex max-h-60 flex-wrap gap-2 overflow-y-auto">
          {shown.map((i) => (
            <button
              key={i.id}
              className={chip}
              data-on={i.id === itemId}
              onClick={() => {
                setItemId(i.id);
                setQty(stepFor(i.unit_label));
                setPrice(i.last_buy_price);
              }}
            >
              {i.name}
            </button>
          ))}
          {!shown.length && <p className="text-sm text-mute">{t('buys.noItems')}</p>}
        </div>

        {item && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-signal">{t('buys.selected', { name: item.name })}</p>
            <p className={label}>{t('buys.quantity')}</p>
            <Stepper value={qty} step={stepFor(item.unit_label)} min={stepFor(item.unit_label)} display={(v) => convertQty(v, item.unit_label)} onChange={setQty} />
            <p className={label}>{t('buys.unitPrice', { currency, unit: unitLabel(item.unit_label) })}</p>
            <Stepper value={price} step={0.5} onChange={setPrice} />
            <div className="flex flex-wrap gap-2">
              {[1, 5, 10, 25].map((p) => (
                <button key={p} className={chip} onClick={() => setPrice(p)}>{p}</button>
              ))}
            </div>
            <input className={input} placeholder={t('buys.brandOptional')} value={brand} onChange={(e) => setBrand(e.target.value)} />
            <p className="text-sm text-slate-300">
              {t('buys.total', { amount: fmtMoney(qty * price, currency) })}
            </p>
            <button className={`${btnPrimary} w-full`} onClick={record} disabled={price < 0 || qty <= 0}>
              {t('buys.record')}
            </button>
            {msg && <p className="text-sm text-slate-300">{msg}</p>}
          </div>
        )}
      </div>

      <p className={`${label} mb-2`}>{t('buys.recent')}</p>
      {(purchases.data ?? []).map((p) => {
        const name = inv.data?.find((i) => i.id === p.inventory_id)?.name ?? t('buys.itemFallback');
        return (
          <div key={p.id} className={card}>
            <div className="flex justify-between">
              <strong>{name}</strong>
              <span>{fmtMoney(p.total_paid, currency)}</span>
            </div>
            <p className="text-xs text-slate-400">
              {p.qty_bought} × {fmtMoney(p.unit_price_paid, currency)}
              {p.brand_tag ? ` · ${p.brand_tag}` : ''} · {new Date(p.purchased_at).toLocaleDateString(lang === 'mk' ? 'mk-MK' : undefined)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
