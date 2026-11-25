import type { InventoryItem, InvoiceLang, InvoiceLine, LogRow } from '../lib/types';

export const round2 = (v: number): number => Math.round(v * 100) / 100;
export const round4 = (v: number): number => Math.round(v * 10000) / 10000;

export interface DraftLine {
  line_type: InvoiceLine['line_type'];
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  source_inventory_id: string | null;
}

export const lineTotal = (l: { qty: number; unit_price: number }): number => round2(l.qty * l.unit_price);

export interface InvoiceTotals {
  subtotal: number;
  vat: number;
  total: number;
  advance: number;
  /** what the client still owes; never below zero */
  balance: number;
}

export function invoiceTotals(lines: { qty: number; unit_price: number }[], vatPct: number, advance: number): InvoiceTotals {
  const subtotal = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const vat = round2((subtotal * vatPct) / 100);
  const total = round2(subtotal + vat);
  return { subtotal, vat, total, advance, balance: Math.max(0, round2(total - advance)) };
}

/** Raise every unit price by pct percent (4 decimal places, like the stored prices). */
export const markupPrice = (price: number, pct: number): number => round4(price * (1 + pct / 100));

/** Factor that makes the subtotal equal target; null when there is nothing to scale. */
export function scaleFactor(lines: { qty: number; unit_price: number }[], target: number): number | null {
  const sum = lines.reduce((s, l) => s + lineTotal(l), 0);
  return sum > 0 && target > 0 ? target / sum : null;
}

// ---------------------------------------------------------------- aggregation of real usage

interface UsedItem {
  itemId: string;
  name: string;
  unit: string;
  lineType: InvoiceLine['line_type'];
  qty: number;
  /** frozen cost of what was used, minus the credit for offcuts returned to stock */
  amount: number;
}

/** Quantity and cost used per inventory item. Mirrors fill_invoice_lines in migration 0003. */
function usedItems(logs: LogRow[], items: Map<string, InventoryItem>): UsedItem[] {
  const byId = new Map(logs.map((l) => [l.id, l]));
  const out = new Map<string, UsedItem>();
  for (const l of logs) {
    if (l.log_category === 'LABOR' || l.qty_delta >= 0 || !l.inventory_id) continue;
    const it = items.get(l.inventory_id);
    if (!it) continue;
    const cur = out.get(it.id) ?? { itemId: it.id, name: it.name, unit: it.unit_label, lineType: 'HARDWARE' as InvoiceLine['line_type'], qty: 0, amount: 0 };
    cur.qty += -l.qty_delta;
    cur.amount += Math.abs(l.qty_delta) * l.unit_cost_at_time;
    const cat = l.log_category;       // weld length and saw cuts have no item, so only item categories reach here
    cur.lineType = cat === 'ONE_OFF_EXPENSE' || cat === 'WELD_LENGTH' || cat === 'SAW_CUT' ? 'HARDWARE' : cat;
    out.set(it.id, cur);
  }
  for (const c of logs) {
    if (!c.source_log_id) continue;                                   // offcut credit
    const src = byId.get(c.source_log_id);
    const row = src?.inventory_id ? out.get(src.inventory_id) : undefined;
    if (row) row.amount -= Math.abs(c.qty_delta) * Math.abs(c.unit_cost_at_time);
  }
  return [...out.values()].filter((u) => u.qty > 0).sort((a, b) => a.name.localeCompare(b.name));
}

const MK_UNITS: Record<string, string> = { PCS: 'ком', BAR: 'шипка', SHEET: 'лим', M: 'м', ML: 'мл', BOX: 'кутија', M2: 'м²', KG: 'кг', L: 'л' };

/**
 * The lines a new external quote starts with: the exact hours and each item used, priced for the
 * CLIENT. Labour is at the rate, steel and hardware at cost, and consumables (wire, gas, discs) carry
 * the company markup, so an unedited quote never shows what the shop paid for them. The database
 * function does the same; this copy feeds the preview, the demo backend and the tests.
 */
export function seedExternalLines(logs: LogRow[], items: Map<string, InventoryItem>, lang: InvoiceLang, markupPct = 0): DraftLine[] {
  const lines: DraftLine[] = [];
  const labour = logs.filter((l) => l.log_category === 'LABOR');
  const hours = labour.reduce((s, l) => s + l.qty_delta, 0);
  if (hours > 0) {
    const cost = labour.reduce((s, l) => s + Math.abs(l.qty_delta) * l.unit_cost_at_time, 0);
    lines.push({ line_type: 'LABOR', description: lang === 'mk' ? 'Работни часови' : 'Labour', qty: hours, unit: lang === 'mk' ? 'ч' : 'h', unit_price: round4(cost / hours), source_inventory_id: null });
  }
  const rated = (category: 'WELD_LENGTH' | 'SAW_CUT') => {
    const rows = logs.filter((l) => l.log_category === category);
    const qty = rows.reduce((sum, l) => sum + l.qty_delta, 0);
    const cost = rows.reduce((sum, l) => sum + l.qty_delta * l.unit_cost_at_time, 0);
    return qty > 0 ? { qty, price: round4(cost / qty) } : null;
  };
  const weldCm = rated('WELD_LENGTH');
  if (weldCm) lines.push({ line_type: 'LABOR', description: lang === 'mk' ? 'Заварување' : 'Welding', qty: weldCm.qty, unit: lang === 'mk' ? 'см' : 'cm', unit_price: weldCm.price, source_inventory_id: null });
  const saw = rated('SAW_CUT');
  if (saw) lines.push({ line_type: 'LABOR', description: lang === 'mk' ? 'Сечења со пила' : 'Saw cuts', qty: saw.qty, unit: lang === 'mk' ? 'ком' : 'pcs', unit_price: saw.price, source_inventory_id: null });
  for (const u of usedItems(logs, items)) {
    lines.push({
      line_type: u.lineType, description: u.name, qty: u.qty,
      unit: lang === 'mk' ? (MK_UNITS[u.unit] ?? u.unit) : u.unit,
      unit_price: round4((Math.max(u.amount, 0) * (u.lineType === 'WELD' || u.lineType === 'CONSUMABLE' ? 1 + markupPct / 100 : 1)) / u.qty), source_inventory_id: u.itemId,
    });
  }
  return lines;
}

// ---------------------------------------------------------------- internal invoice

export interface InternalMaterial {
  itemId: string;
  name: string;
  unit: string;
  used: number;
  cost: number;
  stockNow: number;
  minAlert: number;
  low: boolean;
}

export interface InternalInvoice {
  hoursTotal: number;
  /** exact hours per calendar day, oldest first */
  hoursByDay: { date: string; hours: number }[];
  labourCost: number;
  /** total weld length in centimetres and number of saw cuts (counts only, no prices) */
  weldLengthCm: number;
  sawCuts: number;
  materials: InternalMaterial[];
  materialsCost: number;
  totalCost: number;
}

const localDay = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Everything the welder needs to know for himself: real hours, real materials, what is left in stock. */
export function buildInternalInvoice(logs: LogRow[], items: InventoryItem[]): InternalInvoice {
  const map = new Map(items.map((i) => [i.id, i]));
  const labour = logs.filter((l) => l.log_category === 'LABOR');
  const days = new Map<string, number>();
  for (const l of labour) days.set(localDay(l.created_at), (days.get(localDay(l.created_at)) ?? 0) + l.qty_delta);
  const hoursByDay = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, hours]) => ({ date, hours: round2(hours) }));
  const hoursTotal = round2(labour.reduce((s, l) => s + l.qty_delta, 0));
  const labourCost = round2(labour.reduce((s, l) => s + Math.abs(l.qty_delta) * l.unit_cost_at_time, 0));

  const materials: InternalMaterial[] = usedItems(logs, map).map((u) => {
    const it = map.get(u.itemId) as InventoryItem;
    return { itemId: u.itemId, name: u.name, unit: u.unit, used: round2(u.qty), cost: round2(u.amount), stockNow: it.qty_on_hand, minAlert: it.min_alert_qty, low: it.qty_on_hand <= it.min_alert_qty };
  });
  const materialsCost = round2(materials.reduce((s, m) => s + m.cost, 0));
  const weldLengthCm = round2(logs.filter((l) => l.log_category === 'WELD_LENGTH').reduce((n, l) => n + l.qty_delta, 0));
  const sawCuts = logs.filter((l) => l.log_category === 'SAW_CUT').reduce((n, l) => n + l.qty_delta, 0);
  return { hoursTotal, hoursByDay, labourCost, weldLengthCm, sawCuts, materials, materialsCost, totalCost: round2(labourCost + materialsCost) };
}

/** Tap size for a quantity on an invoice line, from its unit text (English or Macedonian). */
export function stepForUnit(unit: string): number {
  switch (unit.trim().toLowerCase()) {
    case 'h': case 'ч': case 'm': case 'м': return 0.5;
    case 'ml': case 'мл': return 100;
    case 'sheet': case 'лим': return 0.25;
    default: return 1;
  }
}
