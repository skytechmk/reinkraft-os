import type { InventoryItem, LogRow } from '../lib/types';

export interface ConsumptionSummary {
  /** bar units consumed on raw profile items */
  bars: number;
  /** welding gas, in litres */
  gasLitres: number;
  /** welding wire, in kilograms */
  wireKg: number;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * What a project has consumed, for the Auto-Inventory Summary. Only deductions count (negative
 * quantity): offcuts returned to stock are credits, not consumption. An undone log is deleted by the
 * database, so it is not in `logs` at all.
 *  - bars: BAR units of raw profile items (RAW folder, or an old PROFILE item from before folders)
 *  - gasLitres: welding-folder items counted in litres (millilitres are divided by 1000)
 *  - wireKg: welding-folder items counted in kilograms
 */
export function summarizeConsumption(logs: LogRow[], items: InventoryItem[]): ConsumptionSummary {
  const byId = new Map(items.map((i) => [i.id, i]));
  let bars = 0, gas = 0, wire = 0;
  for (const l of logs) {
    if (l.log_category === 'LABOR' || l.qty_delta >= 0 || !l.inventory_id) continue;
    const it = byId.get(l.inventory_id);
    if (!it) continue;
    const used = -l.qty_delta;
    if (it.unit_label === 'BAR' && (it.folder === 'RAW' || (!it.folder && it.item_type === 'PROFILE'))) bars += used;
    else if (it.folder === 'WELDING' && it.unit_label === 'L') gas += used;
    else if (it.folder === 'WELDING' && it.unit_label === 'ML') gas += used / 1000;
    else if (it.folder === 'WELDING' && it.unit_label === 'KG') wire += used;
  }
  return { bars: round3(bars), gasLitres: round3(gas), wireKg: round3(wire) };
}
