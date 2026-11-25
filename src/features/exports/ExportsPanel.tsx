import { useMemo } from 'react';
import { useAllLogs, useInventory, useProjects, usePurchases, useSettings } from '../../lib/api';
import { downloadCsv } from '../../lib/csv';
import { fmtMoney } from '../../domain/units';
import { Plate } from '../../components/Plate';
import { Gauge } from '../../components/Gauge';
import { btn } from '../../ui';
import { useI18n, type MessageKey } from '../../i18n';

const CATEGORIES = ['LABOR', 'WELD', 'MATERIAL', 'CONSUMABLE', 'HARDWARE', 'ONE_OFF_EXPENSE'];

export function ExportsPanel() {
  const { t } = useI18n();
  const catName = (c: string) => (CATEGORIES.includes(c) ? t(`exports.cat.${c}` as MessageKey) : c);
  const logs = useAllLogs();
  const inv = useInventory();
  const projects = useProjects();
  const purchases = usePurchases();
  const settings = useSettings();
  const cur = settings.data?.currency ?? 'EUR';
  const stamp = new Date().toISOString().slice(0, 10);

  const itemName = useMemo(() => new Map((inv.data ?? []).map((i) => [i.id, i.name])), [inv.data]);
  const projectName = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p.title])), [projects.data]);
  const cost = (l: { qty_delta: number; unit_cost_at_time: number }) => Math.abs(l.qty_delta) * l.unit_cost_at_time;

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs.data ?? []) m.set(l.log_category, (m.get(l.log_category) ?? 0) + cost(l));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [logs.data]);
  const topItems = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs.data ?? []) if (l.inventory_id && l.qty_delta < 0) m.set(l.inventory_id, (m.get(l.inventory_id) ?? 0) + cost(l));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [logs.data]);
  const maxCat = Math.max(1, ...byCategory.map(([, v]) => v));
  const maxItem = Math.max(1, ...topItems.map(([, v]) => v));
  const total = byCategory.reduce((s, [, v]) => s + v, 0);

  const exportLogs = () =>
    downloadCsv(`${t('exports.file.activity')}-${stamp}.csv`, [
      [t('exports.col.date'), t('exports.col.project'), t('exports.col.category'), t('exports.col.item'), t('exports.col.quantity'), t('exports.col.unitCost', { cur }), t('exports.col.lineCost', { cur })],
      ...(logs.data ?? []).map((l) => [l.created_at.slice(0, 10), projectName.get(l.project_id) ?? t('exports.quickService'), catName(l.log_category), (l.inventory_id && itemName.get(l.inventory_id)) || l.description || '', l.qty_delta, l.unit_cost_at_time, Number((Math.sign(l.unit_cost_at_time || 1) * cost(l)).toFixed(2))]),
    ]);
  const exportPurchases = () =>
    downloadCsv(`${t('exports.file.purchases')}-${stamp}.csv`, [
      [t('exports.col.date'), t('exports.col.item'), t('exports.col.brand'), t('exports.col.quantity'), t('exports.col.unitPrice', { cur }), t('exports.col.total', { cur })],
      ...(purchases.data ?? []).map((p) => [p.purchased_at.slice(0, 10), itemName.get(p.inventory_id) ?? '', p.brand_tag, p.qty_bought, p.unit_price_paid, p.total_paid]),
    ]);
  const exportStock = () =>
    downloadCsv(`${t('exports.file.stock')}-${stamp}.csv`, [
      [t('exports.col.item'), t('exports.col.type'), t('exports.col.inStock'), t('exports.col.unit'), t('exports.col.alertAt'), t('exports.col.lastPrice', { cur }), t('exports.col.kgPerM'), t('exports.col.m2PerM')],
      ...(inv.data ?? []).map((i) => [i.name, i.item_type, i.qty_on_hand, i.unit_label, i.min_alert_qty, i.last_buy_price, i.weight_kg_per_m, i.surface_m2_per_m]),
    ]);

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <Plate title={t('exports.whereMoney')} right={<span className="num text-xl">{fmtMoney(total, cur)}</span>}>
        <ul className="space-y-4">
          {byCategory.map(([c, v]) => (
            <li key={c}>
              <div className="flex justify-between text-sm"><span>{catName(c)}</span><span className="tabular-nums">{fmtMoney(v, cur)}</span></div>
              <div className="mt-1.5"><Gauge value={Math.max(0, v)} max={maxCat} tone="signal" label={catName(c)} /></div>
            </li>
          ))}
          {!byCategory.length && <li className="text-sm text-mute">{t('exports.noActivity')}</li>}
        </ul>
      </Plate>

      <Plate title={t('exports.topItems')}>
        <ul className="space-y-4">
          {topItems.map(([id, v]) => (
            <li key={id}>
              <div className="flex justify-between gap-3 text-sm"><span className="truncate">{itemName.get(id) ?? t('exports.itemFallback')}</span><span className="shrink-0 tabular-nums">{fmtMoney(v, cur)}</span></div>
              <div className="mt-1.5"><Gauge value={v} max={maxItem} tone="ok" label={itemName.get(id) ?? t('exports.itemFallback')} /></div>
            </li>
          ))}
          {!topItems.length && <li className="text-sm text-mute">{t('exports.nothingConsumed')}</li>}
        </ul>
      </Plate>

      <Plate title={t('exports.forAccountant')} className="lg:col-span-2">
        <div className="grid gap-2 sm:grid-cols-3">
          <button className={btn} onClick={exportLogs} disabled={!logs.data?.length}>{t('exports.btn.activity')}</button>
          <button className={btn} onClick={exportPurchases} disabled={!purchases.data?.length}>{t('exports.btn.purchases')}</button>
          <button className={btn} onClick={exportStock} disabled={!inv.data?.length}>{t('exports.btn.stock')}</button>
        </div>
        <p className="mt-3 text-sm text-mute">{t('exports.note')}</p>
      </Plate>
    </div>
  );
}
