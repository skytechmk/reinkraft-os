import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { InventoryItem } from '../../lib/types';
import { Gauge } from '../../components/Gauge';
import { Stepper } from '../../components/Stepper';
import { isLow } from '../../domain/folders';
import { fmtMoney, fmtNum, fmtQty, stepFor } from '../../domain/units';
import { convertQty, fmtAreaPerM, fmtCoverage, fmtLengthMm, fmtWeightPerM } from '../../domain/measure';
import { unitName } from '../../i18n/core';
import { input, label } from '../../ui';
import { useI18n } from '../../i18n';

type SupplierField = 'manufacturer_sku' | 'supplier_name' | 'supplier_contact';
const FIELDS: Array<{ id: SupplierField; key: 'inventory.supplier.sku' | 'inventory.supplier.name' | 'inventory.supplier.contact' }> = [
  { id: 'manufacturer_sku', key: 'inventory.supplier.sku' },
  { id: 'supplier_name', key: 'inventory.supplier.name' },
  { id: 'supplier_contact', key: 'inventory.supplier.contact' },
];

export function ItemRow({ item: i, currency }: { item: InventoryItem; currency: string }) {
  const { t, unit: unitLabel } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [alert, setAlert] = useState(i.min_alert_qty);
  const [sup, setSup] = useState<Record<SupplierField, string>>({
    manufacturer_sku: i.manufacturer_sku ?? '', supplier_name: i.supplier_name ?? '', supplier_contact: i.supplier_contact ?? '',
  });
  const [err, setErr] = useState('');

  const low = isLow(i);
  const max = Math.max(i.qty_on_hand, i.min_alert_qty * 3, 1);
  const trend = i.prev_buy_price && i.prev_buy_price !== i.last_buy_price ? (i.last_buy_price > i.prev_buy_price ? 'up' : 'down') : null;
  const shown = convertQty(i.qty_on_hand, i.unit_label);

  const patch = async (p: Partial<InventoryItem>) => {
    const { error } = await supabase.from('inventory').update(p).eq('id', i.id);
    if (error) setErr(t('inventory.saveFailed', { error: error.message }));
    else setErr('');
    void qc.invalidateQueries({ queryKey: ['inventory'] });
  };
  const saveSupplier = (f: SupplierField) => {
    const v = sup[f].trim();
    if (v === (i[f] ?? '')) return;
    void patch({ [f]: v || null } as Partial<InventoryItem>);
  };

  return (
    <li className="rounded-[3px] bg-plate p-4 shadow-[inset_0_0_0_1px_var(--color-rule)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{i.name}</p>
          <p className="text-sm text-mute">
            {i.is_remnant && i.remnant_length_mm ? t('inventory.offcutLength', { len: fmtLengthMm(i.remnant_length_mm) }) : unitLabel(i.unit_label)}
            {i.material_grade ? `, ${i.material_grade}` : ''}
            {!i.is_remnant && i.standard_length_mm ? `, ${t('inventory.barLength', { n: fmtLengthMm(i.standard_length_mm) })}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`num text-4xl ${low ? 'text-crit' : ''}`}>{fmtNum(shown.value)}<span className="ml-1 font-sans text-sm font-medium text-mute">{unitName(shown.unit)}</span></p>
          {low && <span className="rounded-[2px] bg-crit px-1.5 text-xs font-bold text-white">{t('inventory.lowStock')}</span>}
        </div>
      </div>
      <div className="mt-3"><Gauge value={i.qty_on_hand} max={max} marker={i.is_remnant ? undefined : i.min_alert_qty} tone={low ? 'crit' : 'ok'} label={t('inventory.stockLevel', { name: i.name })} /></div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-mute">
          {!i.is_remnant && <span>{t('inventory.alertAt', { qty: fmtQty(i.min_alert_qty, i.unit_label) })}</span>}
          <span>
            {t('inventory.lastPrice', { price: fmtMoney(i.last_buy_price, currency) + (i.unit_label === 'M' || i.unit_label === 'ML' ? ` / ${unitLabel(i.unit_label)}` : '') })}
            {trend && <span className={trend === 'up' ? 'text-crit' : 'text-ok'}> {trend === 'up' ? '▲' : '▼'} {t('inventory.was', { price: fmtMoney(i.prev_buy_price as number, currency) })}</span>}
          </span>
          {i.weight_kg_per_m && <span>{fmtWeightPerM(i.weight_kg_per_m)}</span>}
          {i.surface_m2_per_m && <span>{fmtAreaPerM(i.surface_m2_per_m)}</span>}
          {i.coverage_m2_per_l && <span>{t('inventory.covers', { n: fmtCoverage(i.coverage_m2_per_l) })}</span>}
        </p>
        {!i.is_remnant && (
          <button
            type="button" className="min-h-[48px] shrink-0 rounded-[3px] px-3 text-sm font-semibold text-signal shadow-[inset_0_0_0_1px_var(--color-rule)]"
            aria-expanded={open} aria-label={open ? t('inventory.closeEdit', { name: i.name }) : t('inventory.editItem', { name: i.name })} onClick={() => setOpen(!open)}
          >
            {open ? '▲' : '✎'}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-rule pt-3">
          <div>
            <p className={`${label} mb-1`}>{t('inventory.warnAt')}</p>
            <Stepper
              value={alert} step={stepFor(i.unit_label)} display={(v) => convertQty(v, i.unit_label)}
              onChange={(v) => { setAlert(v); void patch({ min_alert_qty: v }); }}
            />
          </div>
          {FIELDS.map((f) => (
            <div key={f.id}>
              <label className={label} htmlFor={`${f.id}-${i.id}`}>{t(f.key)}</label>
              <input
                id={`${f.id}-${i.id}`} className={`${input} mt-1`} value={sup[f.id]}
                onChange={(e) => setSup({ ...sup, [f.id]: e.target.value })} onBlur={() => saveSupplier(f.id)}
              />
            </div>
          ))}
          {err && <p className="text-sm text-crit" role="alert">{err}</p>}
        </div>
      )}
    </li>
  );
}
