import { describe, expect, it } from 'vitest';
import { buildInternalInvoice, invoiceTotals, lineTotal, markupPrice, scaleFactor, seedExternalLines } from './invoice';
import type { InventoryItem, LogRow } from '../lib/types';

const item = (o: Partial<InventoryItem>): InventoryItem => ({
  id: 'i', name: 'x', item_type: 'PROFILE', material_grade: null, standard_length_mm: null, unit_label: 'BAR',
  qty_on_hand: 0, min_alert_qty: 0, last_buy_price: 0, prev_buy_price: null, is_remnant: false,
  remnant_length_mm: null, parent_id: null, weight_kg_per_m: null, surface_m2_per_m: null, coverage_m2_per_l: null, folder: null, subfolder: null, process_tags: [], manufacturer_sku: null, supplier_name: null, supplier_contact: null, ...o,
});
const log = (o: Partial<LogRow>): LogRow => ({
  id: Math.random().toString(36).slice(2), project_id: 'p', inventory_id: null, log_category: 'MATERIAL', description: null,
  qty_delta: -1, unit_cost_at_time: 0, charged_amount: null, source_log_id: null, service_batch_id: null,
  created_at: '2026-11-20T09:00:00', ...o,
});

const tube = item({ id: 'tube', name: 'Tube 40x40', standard_length_mm: 6000, qty_on_hand: 11, min_alert_qty: 4 });
const wire = item({ id: 'wire', name: 'MIG wire', item_type: 'CONSUMABLE', unit_label: 'M', qty_on_hand: 90, min_alert_qty: 100 });
const items = [tube, wire];
const map = new Map(items.map((i) => [i.id, i]));

const first = log({ id: 'L1', log_category: 'MATERIAL', inventory_id: 'tube', qty_delta: -1, unit_cost_at_time: 1850 });
const logs: LogRow[] = [
  log({ log_category: 'LABOR', qty_delta: 2.5, unit_cost_at_time: 600, created_at: '2026-11-19T10:00:00' }),
  log({ log_category: 'LABOR', qty_delta: 2.5, unit_cost_at_time: 600, created_at: '2026-11-20T10:00:00' }),
  first,
  log({ log_category: 'MATERIAL', inventory_id: 'tube', qty_delta: -2, unit_cost_at_time: 1850 }),
  log({ log_category: 'MATERIAL', inventory_id: 'tube', qty_delta: 1, unit_cost_at_time: -616.6667, source_log_id: 'L1' }),   // 2 m offcut back
  log({ log_category: 'WELD', inventory_id: 'wire', qty_delta: -48, unit_cost_at_time: 4.2 }),
];

describe('internal invoice', () => {
  it('shows exact hours in total and per day', () => {
    const inv = buildInternalInvoice(logs, items);
    expect(inv.hoursTotal).toBe(5);
    expect(inv.hoursByDay).toEqual([{ date: '2026-11-19', hours: 2.5 }, { date: '2026-11-20', hours: 2.5 }]);
    expect(inv.labourCost).toBe(3000);
  });

  it('lists materials used with the stock that is left, net of the returned offcut', () => {
    const inv = buildInternalInvoice(logs, items);
    const t = inv.materials.find((m) => m.itemId === 'tube')!;
    expect(t.used).toBe(3);
    expect(t.cost).toBe(4933.33);                  // 3 x 1850 - 616.6667
    expect(t.stockNow).toBe(11);
    expect(t.low).toBe(false);
    const w = inv.materials.find((m) => m.itemId === 'wire')!;
    expect(w.used).toBe(48);
    expect(w.low).toBe(true);                       // 90 m left, alert at 100
    expect(inv.totalCost).toBe(inv.labourCost + inv.materialsCost);
  });
});

describe('external invoice seed', () => {
  it('starts equal to the internal record: same hours, same quantities, priced at frozen cost', () => {
    const lines = seedExternalLines(logs, map, 'en');
    expect(lines.map((l) => [l.description, l.qty, l.unit, l.unit_price])).toEqual([
      ['Labour', 5, 'h', 600],
      ['MIG wire', 48, 'M', 4.2],
      ['Tube 40x40', 3, 'BAR', 1644.4444],
    ]);
    const internal = buildInternalInvoice(logs, items);
    const seedTotal = lines.reduce((s, l) => s + lineTotal(l), 0);
    expect(Math.abs(seedTotal - internal.totalCost)).toBeLessThan(0.05);   // equal up to per-line rounding
  });

  it('prices consumables for the client with the markup, and steel at cost', () => {
    const lines = seedExternalLines(logs, map, 'en', 70);
    expect(lines.find((l) => l.description === 'MIG wire')?.unit_price).toBe(7.14);          // 4.2 x 1.7, weld wire
    expect(lines.find((l) => l.description === 'Tube 40x40')?.unit_price).toBe(1644.4444);   // steel: no markup
    expect(lines.find((l) => l.description === 'Labour')?.unit_price).toBe(600);
  });

  it('words the labour line in Macedonian when asked', () => {
    const [labour] = seedExternalLines(logs, map, 'mk');
    expect(labour.description).toBe('Работни часови');
    expect(labour.unit).toBe('ч');
  });

  it('has no labour line when no hours were logged', () => {
    expect(seedExternalLines(logs.filter((l) => l.log_category !== 'LABOR'), map, 'en')[0].description).toBe('MIG wire');
  });
});

describe('totals and pricing tools', () => {
  it('adds VAT, subtracts the advance and never shows a negative balance', () => {
    const t = invoiceTotals([{ qty: 3, unit_price: 1644.4444 }], 18, 1000);
    expect(t.subtotal).toBe(4933.33);
    expect(t.vat).toBe(888);
    expect(t.total).toBe(5821.33);
    expect(t.balance).toBe(4821.33);
    expect(invoiceTotals([{ qty: 1, unit_price: 100 }], 0, 500).balance).toBe(0);
  });

  it('marks prices up and scales to a target subtotal', () => {
    expect(markupPrice(600, 10)).toBe(660);
    const lines = [{ qty: 2, unit_price: 100 }, { qty: 1, unit_price: 300 }];            // 500
    expect(scaleFactor(lines, 600)).toBeCloseTo(1.2);
    expect(scaleFactor([], 600)).toBeNull();
    expect(scaleFactor(lines, 0)).toBeNull();
  });
});

import { stepForUnit } from './invoice';
describe('stepForUnit', () => {
  it('uses the same tap sizes in both languages', () => {
    expect(stepForUnit('h')).toBe(0.5);
    expect(stepForUnit('ч')).toBe(0.5);
    expect(stepForUnit('M')).toBe(0.5);
    expect(stepForUnit('мл')).toBe(100);
    expect(stepForUnit('лим')).toBe(0.25);
    expect(stepForUnit('BAR')).toBe(1);
    expect(stepForUnit('шипка')).toBe(1);
  });
});
