// Weld length: billing rate per process and automatic wire and gas consumption.
// The database function log_weld is the source of truth; this mirrors it exactly so the screen can show
// the effect of a tap at once (optimistic update) and the settings can preview what a preset means.
import type { InventoryItem, ProcessCode } from '../lib/types';

/** One process's settings. Every key is optional: a missing item or number simply means "not set". */
export interface ProcessPreset {
  /** price per centimetre of weld (per inch is only a display choice) */
  rate_per_cm?: number;
  /** filler wire item, must be counted in KG */
  wire_item_id?: string;
  wire_g_per_m?: number;
  /** shielding gas item, must be counted in L or ML */
  gas_item_id?: string;
  gas_l_per_m?: number;
}
export type ProcessConfig = Partial<Record<ProcessCode, ProcessPreset>>;

/**
 * Starting values for the consumption presets. They are NOT measurements: every machine, wire, joint and
 * shop differs, so the owner adjusts them. PULSE uses less wire and gas than plain MIG/MAG for the same weld
 * (the blueprint's "reduced consumption preset"). Processes without filler or gas have no preset.
 */
export const STARTING_PRESETS: Partial<Record<ProcessCode, { wire_g_per_m: number; gas_l_per_m: number }>> = {
  MIG: { wire_g_per_m: 20, gas_l_per_m: 8 },
  MAG: { wire_g_per_m: 20, gas_l_per_m: 8 },
  PULSE: { wire_g_per_m: 14, gas_l_per_m: 5 },
  TIG_DC: { wire_g_per_m: 12, gas_l_per_m: 6 },
  TIG_ACDC: { wire_g_per_m: 12, gas_l_per_m: 6 },
  MMA: { wire_g_per_m: 40, gas_l_per_m: 0 },
};

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

export interface WeldUse {
  /** kilograms of wire, in the wire item's own unit (KG) */
  wire?: { itemId: string; qty: number };
  /** gas in the gas item's own unit (L, or ML converted from the litre preset) */
  gas?: { itemId: string; qty: number };
}

/**
 * What a weld of `lengthCm` takes from stock for this preset. A part is left out when its item is missing
 * from the inventory, has the wrong unit, or the preset has no figure for it, exactly like log_weld.
 */
export function weldConsumption(preset: ProcessPreset | undefined, lengthCm: number, items: ReadonlyMap<string, InventoryItem>): WeldUse {
  const out: WeldUse = {};
  if (!preset || !(lengthCm > 0)) return out;
  const metres = lengthCm / 100;

  const wire = preset.wire_item_id ? items.get(preset.wire_item_id) : undefined;
  const wirePerM = (preset.wire_g_per_m ?? 0) / 1000;
  if (wire && wire.unit_label === 'KG' && wirePerM > 0) {
    const qty = round3(metres * wirePerM);
    if (qty > 0) out.wire = { itemId: wire.id, qty };
  }

  const gas = preset.gas_item_id ? items.get(preset.gas_item_id) : undefined;
  const gasPerM = preset.gas_l_per_m ?? 0;
  if (gas && (gas.unit_label === 'L' || gas.unit_label === 'ML') && gasPerM > 0) {
    const qty = round3(metres * gasPerM * (gas.unit_label === 'ML' ? 1000 : 1));
    if (qty > 0) out.gas = { itemId: gas.id, qty };
  }
  return out;
}

/** True when stock covers the whole weld (the database refuses it otherwise, writing nothing). */
export function canSupplyWeld(use: WeldUse, items: ReadonlyMap<string, InventoryItem>): boolean {
  return [use.wire, use.gas].every((part) => !part || (items.get(part.itemId)?.qty_on_hand ?? 0) >= part.qty);
}
