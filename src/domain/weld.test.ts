import { describe, expect, it } from 'vitest';
import { canSupplyWeld, STARTING_PRESETS, weldConsumption } from './weld';
import type { InventoryItem } from '../lib/types';

const item = (o: Partial<InventoryItem>): InventoryItem => ({
  id: 'x', name: 'x', item_type: 'CONSUMABLE', material_grade: null, standard_length_mm: null, unit_label: 'KG', qty_on_hand: 10,
  min_alert_qty: 0, last_buy_price: 1, prev_buy_price: null, is_remnant: false, remnant_length_mm: null, parent_id: null,
  weight_kg_per_m: null, surface_m2_per_m: null, coverage_m2_per_l: null, folder: 'WELDING', subfolder: 'MIG_MAG',
  process_tags: [], manufacturer_sku: null, supplier_name: null, supplier_contact: null, ...o,
});
const wire = item({ id: 'wire', unit_label: 'KG', qty_on_hand: 10 });
const gas = item({ id: 'gas', unit_label: 'L', qty_on_hand: 40 });
const items = new Map([wire, gas].map((i) => [i.id, i]));
const preset = { wire_item_id: 'wire', wire_g_per_m: 20, gas_item_id: 'gas', gas_l_per_m: 8 };

describe('weldConsumption (mirrors the database function)', () => {
  it('turns centimetres of weld into kilograms of wire and litres of gas', () => {
    expect(weldConsumption(preset, 150, items)).toEqual({ wire: { itemId: 'wire', qty: 0.03 }, gas: { itemId: 'gas', qty: 12 } });
    expect(weldConsumption(preset, 10, items)).toEqual({ wire: { itemId: 'wire', qty: 0.002 }, gas: { itemId: 'gas', qty: 0.8 } });
  });

  it('expresses gas in millilitres when the gas item is counted in ML', () => {
    const ml = new Map([...items, ['gas', item({ id: 'gas', unit_label: 'ML' })]]);
    expect(weldConsumption(preset, 150, ml).gas).toEqual({ itemId: 'gas', qty: 12000 });
  });

  it('leaves a part out instead of guessing: wrong unit, missing item, no figure', () => {
    const metres = new Map([...items, ['wire', item({ id: 'wire', unit_label: 'M' })]]);
    expect(weldConsumption(preset, 150, metres).wire).toBeUndefined();
    expect(weldConsumption({ ...preset, gas_item_id: 'nope' }, 150, items).gas).toBeUndefined();
    expect(weldConsumption({ ...preset, wire_g_per_m: 0 }, 150, items).wire).toBeUndefined();
    expect(weldConsumption(undefined, 150, items)).toEqual({});
    expect(weldConsumption(preset, 0, items)).toEqual({});
  });

  it('checks stock for the whole weld, all or nothing', () => {
    expect(canSupplyWeld(weldConsumption(preset, 150, items), items)).toBe(true);
    expect(canSupplyWeld(weldConsumption(preset, 10000, items), items)).toBe(false);   // gas runs out first
  });

  it('PULSE starts lower than MIG/MAG and processes without filler have no preset', () => {
    expect(STARTING_PRESETS.PULSE!.wire_g_per_m).toBeLessThan(STARTING_PRESETS.MIG!.wire_g_per_m);
    expect(STARTING_PRESETS.PULSE!.gas_l_per_m).toBeLessThan(STARTING_PRESETS.MIG!.gas_l_per_m);
    expect(STARTING_PRESETS.PLASMA).toBeUndefined();
    expect(STARTING_PRESETS.LASER).toBeUndefined();
  });
});
