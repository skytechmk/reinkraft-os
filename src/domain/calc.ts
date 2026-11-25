import type { InventoryItem, LogRow } from '../lib/types';

export interface Totals {
  labour: number;
  weld: number;
  material: number;
  consumables: number;
  hardware: number;
  /** weld length x the process rate, as logged (rates are frozen on each row) */
  weldLength: number;
  /** saw cuts x the cut rate */
  sawCuts: number;
  total: number;
  /** labour + material + hardware, plus weld consumables and other consumables with the company markup */
  suggestedPrice: number;
  /** net profile length used, in metres (returned remnants are subtracted) */
  metres: number;
  weightKg: number;
  paintM2: number;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

const costOf = (l: LogRow): number => Math.abs(l.qty_delta) * l.unit_cost_at_time;

/** A remnant piece inherits weight and surface from the bar it was cut from. */
function profileOf(item: InventoryItem, items: Map<string, InventoryItem>): InventoryItem {
  return item.is_remnant && item.parent_id ? (items.get(item.parent_id) ?? item) : item;
}

export function computeTotals(logs: LogRow[], items: Map<string, InventoryItem>, markupPct: number): Totals {
  let labour = 0, weld = 0, material = 0, consumables = 0, hardware = 0, weldLength = 0, sawCuts = 0;
  let metres = 0, weightKg = 0, paintM2 = 0;

  for (const l of logs) {
    // remnant credit rows carry a negative unit cost, so their cost is already negative
    const signed = costOf(l);
    switch (l.log_category) {
      case 'LABOR': labour += signed; break;
      case 'WELD': weld += signed; break;
      case 'MATERIAL': material += signed; break;
      case 'CONSUMABLE': consumables += signed; break;
      case 'WELD_LENGTH': weldLength += signed; break;
      case 'SAW_CUT': sawCuts += signed; break;
      default: hardware += signed;
    }

    const item = l.inventory_id ? items.get(l.inventory_id) : undefined;
    if (!item) continue;
    let m = 0;
    if (l.log_category === 'MATERIAL' && l.qty_delta < 0 && item.standard_length_mm) {
      m = (Math.abs(l.qty_delta) * item.standard_length_mm) / 1000;                 // bars used
    } else if (l.qty_delta > 0 && item.is_remnant && item.remnant_length_mm) {
      m = -(l.qty_delta * item.remnant_length_mm) / 1000;                            // remnant returned
    }
    if (m !== 0) {
      const p = profileOf(item, items);
      metres += m;
      weightKg += m * (p.weight_kg_per_m ?? 0);
      paintM2 += m * (p.surface_m2_per_m ?? 0);
    }
  }

  const total = labour + weldLength + sawCuts + weld + material + consumables + hardware;
  const suggestedPrice = labour + weldLength + sawCuts + material + hardware + (weld + consumables) * (1 + markupPct / 100);
  return {
    labour: round2(labour), weld: round2(weld), material: round2(material),
    consumables: round2(consumables), hardware: round2(hardware), weldLength: round2(weldLength), sawCuts: round2(sawCuts), total: round2(total),
    suggestedPrice: round2(suggestedPrice),
    metres: round2(metres), weightKg: round2(weightKg), paintM2: round2(paintM2),
  };
}

/** Litres of paint for a surface, from the first chemical that has a coverage figure. */
export function paintLitres(paintM2: number, items: InventoryItem[]): number | null {
  const paint = items.find((i) => i.item_type === 'CHEMICAL' && (i.coverage_m2_per_l ?? 0) > 0);
  if (!paint || paintM2 <= 0) return null;
  return round2(paintM2 / (paint.coverage_m2_per_l as number));
}
