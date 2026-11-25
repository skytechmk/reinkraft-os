import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LowStockPanel } from './LowStockPanel';
import type { InventoryItem } from '../lib/types';

const item = (o: Partial<InventoryItem>): InventoryItem => ({
  id: 'x', name: 'x', item_type: 'CONSUMABLE', material_grade: null, standard_length_mm: null, unit_label: 'PCS', qty_on_hand: 10, min_alert_qty: 1,
  last_buy_price: 1, prev_buy_price: null, is_remnant: false, remnant_length_mm: null, parent_id: null, weight_kg_per_m: null, surface_m2_per_m: null,
  coverage_m2_per_l: null, folder: 'ABRASIVES', subfolder: 'DISCS', process_tags: [], manufacturer_sku: null, supplier_name: null, supplier_contact: null, ...o,
});
const show = (items: InventoryItem[], enabled: ('MIG' | 'TIG_DC')[] = ['MIG']) =>
  render(<LowStockPanel items={items} enabledProcesses={enabled} />);

describe('low stock panel', () => {
  it('lists only items at or below their alert level, with an ALARM badge', () => {
    show([
      item({ id: 'a', name: 'Cutting disc', qty_on_hand: 2, min_alert_qty: 5 }),
      item({ id: 'b', name: 'Flap disc', qty_on_hand: 50, min_alert_qty: 5 }),
    ]);
    expect(screen.getByText('Cutting disc')).toBeTruthy();
    expect(screen.queryByText('Flap disc')).toBeNull();
    expect(screen.getByText('ALARM')).toBeTruthy();
  });

  it('skips remnants and items of a welding process that is switched off', () => {
    show([
      item({ id: 'r', name: 'Offcut', is_remnant: true, qty_on_hand: 0 }),
      item({ id: 'w', name: 'TIG rod', folder: 'WELDING', subfolder: 'TIG', process_tags: ['TIG_DC'], qty_on_hand: 0, min_alert_qty: 2 }),
    ], ['MIG']);
    expect(screen.queryByText('Offcut')).toBeNull();
    expect(screen.queryByText('TIG rod')).toBeNull();
    expect(screen.getByText('All stocked')).toBeTruthy();
  });
});
