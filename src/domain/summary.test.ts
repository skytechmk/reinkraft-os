import { describe, expect, it } from 'vitest';
import { summarizeConsumption } from './summary';
import type { InventoryItem, LogRow } from '../lib/types';

const item = (o: Partial<InventoryItem>): InventoryItem => ({
  id: 'x', name: 'x', item_type: 'CONSUMABLE', material_grade: null, standard_length_mm: null, unit_label: 'PCS', qty_on_hand: 10, min_alert_qty: 1,
  last_buy_price: 1, prev_buy_price: null, is_remnant: false, remnant_length_mm: null, parent_id: null, weight_kg_per_m: null, surface_m2_per_m: null,
  coverage_m2_per_l: null, folder: null, subfolder: null, process_tags: [], manufacturer_sku: null, supplier_name: null, supplier_contact: null, ...o,
});
const log = (o: Partial<LogRow>): LogRow => ({
  id: 'l', project_id: 'p', inventory_id: null, log_category: 'MATERIAL', description: null, qty_delta: -1, unit_cost_at_time: 1,
  charged_amount: null, source_log_id: null, service_batch_id: null, created_at: '2026-11-20T09:00:00', ...o,
});

const bar = item({ id: 'bar', unit_label: 'BAR', folder: 'RAW', subfolder: 'PROFILES', item_type: 'PROFILE', standard_length_mm: 6000 });
const sheet = item({ id: 'sheet', unit_label: 'SHEET', folder: 'RAW', subfolder: 'SHEETS', item_type: 'SHEET' });
const co2 = item({ id: 'co2', unit_label: 'L', folder: 'WELDING', subfolder: 'MIG_MAG' });
const ml = item({ id: 'ml', unit_label: 'ML', folder: 'WELDING', subfolder: 'MIG_MAG' });
const wire = item({ id: 'wire', unit_label: 'KG', folder: 'WELDING', subfolder: 'MIG_MAG' });
const items = [bar, sheet, co2, ml, wire];

describe('summarizeConsumption', () => {
  it('is zero for an empty project', () => {
    expect(summarizeConsumption([], items)).toEqual({ bars: 0, gasLitres: 0, wireKg: 0 });
  });

  it('adds up bars, gas litres and wire kilograms', () => {
    const logs = [
      log({ inventory_id: 'bar', qty_delta: -2 }), log({ inventory_id: 'bar', qty_delta: -1 }),
      log({ inventory_id: 'co2', log_category: 'WELD', qty_delta: -12.5 }),
      log({ inventory_id: 'wire', log_category: 'WELD', qty_delta: -1.5 }),
    ];
    expect(summarizeConsumption(logs, items)).toEqual({ bars: 3, gasLitres: 12.5, wireKg: 1.5 });
  });

  it('divides millilitres by 1000 and ignores sheets and labour', () => {
    const logs = [
      log({ inventory_id: 'ml', log_category: 'WELD', qty_delta: -500 }),
      log({ inventory_id: 'sheet', qty_delta: -3 }),
      log({ log_category: 'LABOR', qty_delta: 4 }),
    ];
    expect(summarizeConsumption(logs, items)).toEqual({ bars: 0, gasLitres: 0.5, wireKg: 0 });
  });

  it('does not count an offcut credit as consumption, and nets nothing off the bars used', () => {
    const logs = [
      log({ id: 'a', inventory_id: 'bar', qty_delta: -1 }),
      log({ id: 'credit', inventory_id: 'bar', qty_delta: 1, source_log_id: 'a', unit_cost_at_time: -3 }),
    ];
    expect(summarizeConsumption(logs, items).bars).toBe(1);
  });

  it('skips logs of items that no longer exist', () => {
    expect(summarizeConsumption([log({ inventory_id: 'gone', qty_delta: -9 })], items).bars).toBe(0);
  });
});
