import { describe, expect, it } from 'vitest';
import { buildTree, defaultOpen, matchesQuery } from './grouping';
import type { InventoryItem } from '../../lib/types';

const mk = (o: Partial<InventoryItem>): InventoryItem => ({
  id: o.name ?? 'x', name: 'Item', item_type: 'CUSTOM', material_grade: null, standard_length_mm: null, unit_label: 'PCS', qty_on_hand: 10,
  min_alert_qty: 1, last_buy_price: 1, prev_buy_price: null, is_remnant: false, remnant_length_mm: null, parent_id: null, weight_kg_per_m: null,
  surface_m2_per_m: null, coverage_m2_per_l: null, folder: null, subfolder: null, process_tags: [], manufacturer_sku: null, supplier_name: null, supplier_contact: null, ...o,
});

const items = [
  mk({ name: 'Tube 40', folder: 'RAW', subfolder: 'PROFILES', qty_on_hand: 0 }),
  mk({ name: 'Offcut', folder: 'RAW', subfolder: 'REMNANTS', is_remnant: true, remnant_length_mm: 900, qty_on_hand: 0 }),
  mk({ name: 'TIG cup', folder: 'WELDING', subfolder: 'TIG', process_tags: ['TIG_DC'] }),
  mk({ name: 'MIG wire', folder: 'WELDING', subfolder: 'MIG_MAG', process_tags: ['MIG', 'MAG'] }),
  mk({ name: 'Old thing' }),
];

describe('buildTree', () => {
  it('hides welding subfolders and items of switched-off processes', () => {
    const tree = buildTree(items, ['MIG'], '');
    const welding = tree.find((f) => f.id === 'WELDING')!;
    expect(welding.subs.map((s) => s.id)).toEqual(['MIG_MAG']);
    expect(welding.count).toBe(1);
  });

  it('counts PULSE as MIG/MAG', () => {
    const welding = buildTree(items, ['PULSE'], '').find((f) => f.id === 'WELDING')!;
    expect(welding.subs.map((s) => s.id)).toEqual(['MIG_MAG']);
  });

  it('counts low items, and never counts remnants as low', () => {
    const raw = buildTree(items, [], '').find((f) => f.id === 'RAW')!;
    expect(raw.low).toBe(1);
    expect(raw.subs.find((s) => s.id === 'REMNANTS')!.low).toBe(0);
  });

  it('puts items without a folder in Unsorted, last', () => {
    const tree = buildTree(items, [], '');
    expect(tree[tree.length - 1].id).toBe('UNSORTED');
    expect(tree[tree.length - 1].count).toBe(1);
  });

  it('lists empty visible subfolders normally but drops them while searching', () => {
    expect(buildTree(items, [], '').find((f) => f.id === 'HARDWARE')!.subs).toHaveLength(4);
    const found = buildTree(items, [], 'tube');
    expect(found.map((f) => f.id)).toEqual(['RAW']);
    expect(found[0].subs.map((s) => s.id)).toEqual(['PROFILES']);
  });

  it('can show low stock only', () => {
    const tree = buildTree(items, ['MIG'], '', true);
    expect(tree.flatMap((f) => f.subs.flatMap((s) => s.items.map((i) => i.name)))).toEqual(['Tube 40']);
  });
});

describe('helpers', () => {
  it('matches name, grade and supplier case-insensitively', () => {
    expect(matchesQuery(mk({ name: 'Flat bar', supplier_name: 'Acme' }), 'acme')).toBe(true);
    expect(matchesQuery(mk({ name: 'Flat bar' }), 'zzz')).toBe(false);
  });
  it('opens sections only when low or searching', () => {
    expect(defaultOpen(0, false)).toBe(false);
    expect(defaultOpen(2, false)).toBe(true);
    expect(defaultOpen(0, true)).toBe(true);
  });
});
