import { describe, expect, it } from 'vitest';
import { computeTotals, paintLitres } from './calc';
import type { InventoryItem, LogRow } from '../lib/types';

const item = (o: Partial<InventoryItem>): InventoryItem => ({
  id: 'i', name: 'x', item_type: 'PROFILE', material_grade: null, standard_length_mm: null, unit_label: 'BAR',
  qty_on_hand: 0, min_alert_qty: 0, last_buy_price: 0, prev_buy_price: null, is_remnant: false,
  remnant_length_mm: null, parent_id: null, weight_kg_per_m: null, surface_m2_per_m: null, coverage_m2_per_l: null, folder: null, subfolder: null, process_tags: [], manufacturer_sku: null, supplier_name: null, supplier_contact: null, ...o,
});
const log = (o: Partial<LogRow>): LogRow => ({
  id: 'l', project_id: 'p', inventory_id: null, log_category: 'MATERIAL', description: null, qty_delta: -1,
  unit_cost_at_time: 0, charged_amount: null, source_log_id: null, service_batch_id: null, created_at: '2026-01-01', ...o,
});

const tube = item({ id: 'tube', standard_length_mm: 6000, weight_kg_per_m: 2.5, surface_m2_per_m: 0.16 });

describe('computeTotals', () => {
  it('splits costs by category and prices weld consumables with the markup', () => {
    const items = new Map([[tube.id, tube]]);
    const logs = [
      log({ log_category: 'LABOR', qty_delta: 5, unit_cost_at_time: 600 }),                  // 3000
      log({ log_category: 'WELD', inventory_id: 'w', qty_delta: -50, unit_cost_at_time: 4 }), // 200
      log({ log_category: 'MATERIAL', inventory_id: 'tube', qty_delta: -2, unit_cost_at_time: 1800 }), // 3600
    ];
    const t = computeTotals(logs, items, 70);
    expect(t.labour).toBe(3000);
    expect(t.weld).toBe(200);
    expect(t.material).toBe(3600);
    expect(t.total).toBe(6800);
    expect(t.suggestedPrice).toBe(3000 + 3600 + 200 * 1.7);
  });

  it('adds the markup to consumables as well as weld wire, but not to steel or hardware', () => {
    const t = computeTotals([
      log({ log_category: 'CONSUMABLE', inventory_id: 'd', qty_delta: -10, unit_cost_at_time: 10 }),    // 100
      log({ log_category: 'HARDWARE', inventory_id: 'h', qty_delta: -1, unit_cost_at_time: 50 }),       // 50
      log({ log_category: 'MATERIAL', inventory_id: 'm', qty_delta: -1, unit_cost_at_time: 200 }),      // 200
    ], new Map(), 70);
    expect(t.suggestedPrice).toBe(100 * 1.7 + 50 + 200);
  });

  it('computes weight and surface from bars used and subtracts a returned remnant', () => {
    const remnant = item({ id: 'rem', is_remnant: true, remnant_length_mm: 2000, parent_id: 'tube', standard_length_mm: null });
    const items = new Map([[tube.id, tube], [remnant.id, remnant]]);
    const logs = [
      log({ log_category: 'MATERIAL', inventory_id: 'tube', qty_delta: -2, unit_cost_at_time: 1800 }),
      log({ log_category: 'MATERIAL', inventory_id: 'rem', qty_delta: 1, unit_cost_at_time: -600, source_log_id: 'l' }),
    ];
    const t = computeTotals(logs, items, 70);
    expect(t.metres).toBe(10);                 // 12 m used, 2 m returned
    expect(t.weightKg).toBe(25);               // 10 m x 2.5 kg/m
    expect(t.paintM2).toBe(1.6);               // 10 m x 0.16 m2/m
    expect(t.material).toBe(3000);             // 3600 - 600 credit
  });

  it('returns zeros for an empty project', () => {
    const t = computeTotals([], new Map(), 70);
    expect(t.total).toBe(0);
    expect(t.suggestedPrice).toBe(0);
  });
});

describe('paintLitres', () => {
  it('divides the surface by the paint coverage', () => {
    const paint = item({ id: 'p', item_type: 'CHEMICAL', unit_label: 'ML', coverage_m2_per_l: 8 });
    expect(paintLitres(3.36, [paint])).toBe(0.42);
  });
  it('is null without a coverage figure or surface', () => {
    expect(paintLitres(3, [item({ item_type: 'CHEMICAL' })])).toBeNull();
    expect(paintLitres(0, [item({ item_type: 'CHEMICAL', coverage_m2_per_l: 8 })])).toBeNull();
  });
});
