import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { isTemp, optimisticLog, optimisticUndo } from './optimistic';
import type { InventoryItem, LogRow } from './types';

const inv = (qty: number): InventoryItem[] => [{
  id: 'i1', name: 'Tube', item_type: 'PROFILE', material_grade: null, standard_length_mm: 6000, unit_label: 'BAR',
  qty_on_hand: qty, min_alert_qty: 1, last_buy_price: 10, prev_buy_price: null, is_remnant: false,
  remnant_length_mm: null, parent_id: null, weight_kg_per_m: null, surface_m2_per_m: null, coverage_m2_per_l: null,
  folder: null, subfolder: null, process_tags: [], manufacturer_sku: null, supplier_name: null, supplier_contact: null,
}];

describe('optimistic updates', () => {
  it('adds a temporary log row and lowers stock', () => {
    const qc = new QueryClient();
    qc.setQueryData(['inventory'], inv(5));
    qc.setQueryData(['logs', 'p1'], []);
    optimisticLog(qc, { opId: 'a', projectId: 'p1', category: 'MATERIAL', qty: 2, description: 'Tube', unitCost: 10, itemId: 'i1' });
    const logs = qc.getQueryData<LogRow[]>(['logs', 'p1'])!;
    expect(logs).toHaveLength(1);
    expect(isTemp(logs[0])).toBe(true);
    expect(logs[0].qty_delta).toBe(-2);
    expect(qc.getQueryData<InventoryItem[]>(['inventory'])![0].qty_on_hand).toBe(3);
  });

  it('records labour as positive hours and leaves stock alone', () => {
    const qc = new QueryClient();
    qc.setQueryData(['inventory'], inv(5));
    optimisticLog(qc, { opId: 'b', projectId: 'p1', category: 'LABOR', qty: 0.5, description: 'Labour', unitCost: 600, itemId: null });
    expect(qc.getQueryData<LogRow[]>(['logs', 'p1'])![0].qty_delta).toBe(0.5);
    expect(qc.getQueryData<InventoryItem[]>(['inventory'])![0].qty_on_hand).toBe(5);
  });

  it('undo removes the row and gives the stock back', () => {
    const qc = new QueryClient();
    qc.setQueryData(['inventory'], inv(3));
    const row: LogRow = { id: 'real', project_id: 'p1', inventory_id: 'i1', log_category: 'MATERIAL', description: null,
      qty_delta: -2, unit_cost_at_time: 10, charged_amount: null, source_log_id: null, service_batch_id: null, created_at: '' };
    qc.setQueryData(['logs', 'p1'], [row]);
    optimisticUndo(qc, row);
    expect(qc.getQueryData<LogRow[]>(['logs', 'p1'])).toHaveLength(0);
    expect(qc.getQueryData<InventoryItem[]>(['inventory'])![0].qty_on_hand).toBe(5);
  });
});
