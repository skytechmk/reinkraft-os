// In-memory stand-in for the Supabase client. Used only for local visual preview
// (VITE_DEMO=1). It mirrors the SQL RPC rules closely enough to exercise the UI;
// the real rules live in supabase/migrations and are tested in supabase/tests.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from '@supabase/supabase-js';
import { seedExternalLines, lineTotal } from '../domain/invoice';
import { canSupplyWeld, weldConsumption } from '../domain/weld';
import type { InventoryItem, InvoiceLang, LogRow } from './types';

type Row = Record<string, any>;
type Result = { data: any; error: { message: string; code?: string } | null };

const COMPANY = 'demo-company';
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
const dateOnly = (offset: number) => day(offset).slice(0, 10);
const uid = () => crypto.randomUUID();
const ok = (data: any): Result => ({ data, error: null });
const fail = (message: string, code = 'P0001'): Result => ({ data: null, error: { message, code } });

/** A small generated PNG so the logo, preview and printouts can be checked without uploading anything. */
function makeDemoLogo(): string | null {
  try {
    const c = document.createElement('canvas');
    c.width = 240; c.height = 90;
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#F59E0B'; g.fillRect(0, 0, 240, 90);
    g.fillStyle = '#0F1115'; g.font = '900 54px Arial Narrow, Arial, sans-serif'; g.textBaseline = 'middle';
    g.fillText('REINKRAFT', 14, 48);
    return c.toDataURL('image/png');
  } catch { return null; }
}

function makeTables(): Record<string, Row[]> {
  const item = (name: string, o: Row): Row => ({
    id: uid(), company_id: COMPANY, name, item_type: 'PROFILE', material_grade: null, standard_length_mm: null,
    unit_label: 'PCS', qty_on_hand: 0, min_alert_qty: 0, last_buy_price: 0, prev_buy_price: null,
    is_remnant: false, remnant_length_mm: null, parent_id: null, weight_kg_per_m: null,
    surface_m2_per_m: null, coverage_m2_per_l: null, folder: null, subfolder: null, process_tags: [],
    manufacturer_sku: null, supplier_name: null, supplier_contact: null, created_at: day(-40), ...o,
  });
  const raw = { folder: 'RAW', subfolder: 'PROFILES' };
  const tube6 = item('Square tube 40x40x2 (6 m)', { ...raw, unit_label: 'BAR', standard_length_mm: 6000, qty_on_hand: 14, min_alert_qty: 4, last_buy_price: 1850, prev_buy_price: 1790, weight_kg_per_m: 2.31, surface_m2_per_m: 0.16, material_grade: 'S235', supplier_name: 'Makstil', manufacturer_sku: 'SQ40-2' });
  const tube3 = item('Square tube 40x40x2 (3 m)', { ...raw, unit_label: 'BAR', standard_length_mm: 3000, qty_on_hand: 6, min_alert_qty: 3, last_buy_price: 925, weight_kg_per_m: 2.31, surface_m2_per_m: 0.16, material_grade: 'S235' });
  const flat = item('Flat bar 40x5 (6 m)', { ...raw, unit_label: 'BAR', standard_length_mm: 6000, qty_on_hand: 8, min_alert_qty: 3, last_buy_price: 1100, weight_kg_per_m: 1.57, surface_m2_per_m: 0.09 });
  const weldingMig = { folder: 'WELDING', subfolder: 'MIG_MAG', item_type: 'CONSUMABLE', process_tags: ['MIG', 'MAG'] };
  const wire = item('MIG wire 0.8 mm', { ...weldingMig, unit_label: 'KG', qty_on_hand: 12, min_alert_qty: 4, last_buy_price: 450, supplier_name: 'Lincoln' });
  const gas = item('Shielding gas CO2', { ...weldingMig, unit_label: 'L', qty_on_hand: 40, min_alert_qty: 10, last_buy_price: 12 });
  const argon = item('Pure argon (TIG)', { folder: 'WELDING', subfolder: 'TIG', item_type: 'CONSUMABLE', process_tags: ['TIG_DC', 'TIG_ACDC'], unit_label: 'L', qty_on_hand: 30, min_alert_qty: 8, last_buy_price: 15 });
  const electrodes = item('Rutile electrodes 6013', { folder: 'WELDING', subfolder: 'MMA', item_type: 'CONSUMABLE', process_tags: ['MMA'], unit_label: 'BOX', qty_on_hand: 3, min_alert_qty: 1, last_buy_price: 900 });
  const cut = item('Cutting disc 115 mm', { folder: 'ABRASIVES', subfolder: 'DISCS', item_type: 'CONSUMABLE', unit_label: 'PCS', qty_on_hand: 22, min_alert_qty: 10, last_buy_price: 95 });
  const flap = item('Flap disc', { folder: 'ABRASIVES', subfolder: 'FLAP', item_type: 'CONSUMABLE', unit_label: 'PCS', qty_on_hand: 4, min_alert_qty: 5, last_buy_price: 140 });
  const paint = item('Primer, grey', { folder: 'CHEMICAL', subfolder: 'PAINTS', item_type: 'CHEMICAL', unit_label: 'L', qty_on_hand: 12, min_alert_qty: 2, last_buy_price: 600, coverage_m2_per_l: 8 });
  const lock = item('Padlock hasp', { folder: 'HARDWARE', subfolder: 'GATES', item_type: 'CUSTOM', unit_label: 'PCS', qty_on_hand: 9, min_alert_qty: 4, last_buy_price: 320 });
  const remnant = item('Square tube 40x40x2 (6 m) remnant 2000mm', { folder: 'RAW', subfolder: 'REMNANTS', unit_label: 'PCS', is_remnant: true, remnant_length_mm: 2000, parent_id: tube6.id, qty_on_hand: 1, last_buy_price: 616.67 });

  const project = (title: string, o: Row): Row => ({
    id: uid(), company_id: COMPANY, project_type: 'MAIN', status: 'ACTIVE', title, client_name: null,
    quoted_price: null, advance_paid: 0, status_note: null, due_date: null, workshop_notes: null, cut_list: null, created_at: day(-20), ...o,
  });
  const sys = project('Quick Service (system)', { project_type: 'SYSTEM_SERVICE', client_name: 'INTERNAL' });
  const gate = project('Stainless gate, Mile', { client_name: 'Mile', quoted_price: 36000, advance_paid: 30000, status_note: 'In production', due_date: dateOnly(6), workshop_notes: 'Frame 2.2 x 1.4 m. Hinges welded on site. Paint RAL 7016 after grinding.', cut_list: '4 x 1400 mm\n2 x 2200 mm\n6 x 600 mm' });
  const fence = project('Fence, client B', { status: 'QUOTE', client_name: 'Client B', quoted_price: 52000, status_note: 'Waiting for material', due_date: dateOnly(14) });
  const stationery = project('Hinges and stationery', { client_name: 'Walk-in', status_note: 'Needs cutting', due_date: dateOnly(2) });
  const balcony = project('Balcony railing', { status: 'FINISHED', client_name: 'Ana', quoted_price: 22000, advance_paid: 22000, due_date: dateOnly(-9) });

  const logs: Row[] = [];
  const log = (p: Row, it: Row | null, category: string, qty: number, ago: number, extra: Row = {}) =>
    logs.push({
      id: uid(), company_id: COMPANY, project_id: p.id, inventory_id: it?.id ?? null, log_category: category,
      description: it?.name ?? 'Working hours', qty_delta: category === 'LABOR' ? qty : -qty,
      unit_cost_at_time: category === 'LABOR' ? 600 : it!.last_buy_price, charged_amount: null,
      source_log_id: null, service_batch_id: null, client_op_id: uid(), created_at: day(-ago) , ...extra,
    });
  for (let i = 0; i < 10; i++) log(gate, null, 'LABOR', 0.5, 5 - i * 0.4);
  log(gate, tube6, 'MATERIAL', 1, 5); log(gate, tube6, 'MATERIAL', 1, 4.5); log(gate, tube6, 'MATERIAL', 1, 4);
  log(gate, tube3, 'MATERIAL', 1, 3.5);
  for (let i = 0; i < 4; i++) log(gate, wire, 'WELD', 0.2, 4 - i * 0.5);
  for (let i = 0; i < 3; i++) log(gate, gas, 'WELD', 5.2, 4 - i * 0.5);
  log(gate, cut, 'CONSUMABLE', 2, 3); log(gate, flap, 'CONSUMABLE', 1, 2);
  const first = logs.find((l) => l.project_id === gate.id && l.inventory_id === tube6.id)!;
  logs.push({
    id: uid(), company_id: COMPANY, project_id: gate.id, inventory_id: remnant.id, log_category: 'MATERIAL',
    description: remnant.name, qty_delta: 1, unit_cost_at_time: -616.67, charged_amount: null,
    source_log_id: first.id, service_batch_id: null, client_op_id: uid(), created_at: day(-4.9),
  });
  for (let i = 0; i < 8; i++) log(balcony, null, 'LABOR', 1, 14 + i);
  log(balcony, flat, 'MATERIAL', 3, 12); log(balcony, wire, 'WELD', 0.5, 12); log(balcony, paint, 'CONSUMABLE', 1.5, 10);
  log(stationery, null, 'LABOR', 1, 1); log(stationery, lock, 'HARDWARE', 2, 1);

  const purchase = (it: Row, qty: number, price: number, ago: number, brand: string) => ({
    id: uid(), company_id: COMPANY, inventory_id: it.id, brand_tag: brand, qty_bought: qty,
    unit_price_paid: price, total_paid: qty * price, purchased_at: day(-ago), client_op_id: uid(),
  });

  return {
    company_settings: [{ company_id: COMPANY, company_name: 'REINKRAFT', currency: 'MKD', unit_system: 'METRIC', hourly_labor_rate: 600, weld_consumable_markup_pct: 70, min_remnant_length_mm: 500, enabled_processes: ['MIG', 'MAG', 'TIG_DC', 'TIG_ACDC', 'MMA', 'PLASMA'], payment_terms: 'Payment within 14 days of the invoice date.', tenant_theme: {}, weld_rate_enabled: true, saw_rate_enabled: true, saw_cut_rate: 50, auto_consumption_enabled: true, process_config: { MIG: { rate_per_cm: 0.5, wire_item_id: wire.id, wire_g_per_m: 20, gas_item_id: gas.id, gas_l_per_m: 8 }, MAG: { rate_per_cm: 0.5, wire_item_id: wire.id, wire_g_per_m: 20, gas_item_id: gas.id, gas_l_per_m: 8 }, TIG_DC: { rate_per_cm: 0.8, gas_item_id: argon.id, gas_l_per_m: 6 }, MMA: { rate_per_cm: 0.6 } }, logo_data_url: makeDemoLogo(), company_address: 'ул. Заварувачка 12\n1000 Скопје', company_tax_id: 'MK4030000000000', company_phone: '+389 70 000 000', company_bank_account: 'Комерцијална банка\n300000000000000', default_vat_pct: 18 }],
    inventory: [tube6, tube3, flat, wire, gas, argon, electrodes, cut, flap, paint, lock, remnant],
    projects: [sys, gate, fence, stationery, balcony],
    project_logs: logs,
    project_notes: [
      { id: uid(), company_id: COMPANY, project_id: gate.id, note_text: 'Client wants 304 stainless. Do not use 316 rods.', is_pinned_warning: true, remind_at: null, reminder_status: 'NONE' },
      { id: uid(), company_id: COMPANY, project_id: gate.id, note_text: 'Delivery Friday morning, call before.', is_pinned_warning: false, remind_at: null, reminder_status: 'NONE' },
      { id: uid(), company_id: COMPANY, project_id: stationery.id, note_text: 'Cut list is on the bench.', is_pinned_warning: false, remind_at: null, reminder_status: 'NONE' },
    ],
    invoices: [],
    invoice_lines: [],
    purchases: [purchase(tube6, 10, 1850, 12, 'Makstil'), purchase(wire, 10, 450, 9, 'Lincoln'), purchase(cut, 20, 95, 6, 'Bosch'), purchase(flap, 5, 140, 3, 'Klingspor')],
  };
}

const DEFAULTS: Record<string, () => Row> = {
  inventory: () => ({ qty_on_hand: 0, min_alert_qty: 0, last_buy_price: 0, prev_buy_price: null, is_remnant: false, remnant_length_mm: null, parent_id: null, weight_kg_per_m: null, surface_m2_per_m: null, coverage_m2_per_l: null, material_grade: null, standard_length_mm: null, folder: null, subfolder: null, process_tags: [], manufacturer_sku: null, supplier_name: null, supplier_contact: null }),
  projects: () => ({ status: 'ACTIVE', client_name: null, quoted_price: null, advance_paid: 0, status_note: null, due_date: null, workshop_notes: null, cut_list: null }),
  project_notes: () => ({ is_pinned_warning: false, remind_at: null, reminder_status: 'NONE' }),
  invoices: () => ({ status: 'DRAFT', number: null, issued_at: null, due_date: null, client_name: null, client_address: null, vat_pct: 0, notes: null, advance_paid: 0, language: 'en' }),
  invoice_lines: () => ({ position: 0, source_inventory_id: null }),
};

const latency = <T,>(v: T): Promise<T> => new Promise((r) => setTimeout(() => r(v), 60));

export function createDemoClient(): SupabaseClient {
  const tables = makeTables();
  const settings = () => tables.company_settings[0];
  const counters = new Map<string, number>();

  class Query {
    private filters: ((r: Row) => boolean)[] = [];
    private ord?: { col: string; asc: boolean };
    private max?: number;
    private window?: [number, number];
    private mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    private payload: any;
    private one = false;
    private returning = false;
    constructor(private table: string) {}
    select(_cols?: string) { if (this.mode !== 'select') this.returning = true; return this; }
    eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
    neq(c: string, v: any) { this.filters.push((r) => r[c] !== v); return this; }
    order_(c: string, asc: boolean) { this.ord = { col: c, asc }; return this; }
    limit(n: number) { this.max = n; return this; }
    range(from: number, to: number) { this.window = [from, to]; return this; }
    single() { this.one = true; return this; }
    insert(rows: Row | Row[]) { this.mode = 'insert'; this.payload = rows; return this; }
    update(o: Row) { this.mode = 'update'; this.payload = o; return this; }
    delete() { this.mode = 'delete'; return this; }
    then<T>(res: (r: Result) => T, rej?: (e: unknown) => T) { return latency(this.run()).then(res, rej); }
    private match(r: Row) { return this.filters.every((f) => f(r)); }
    /** Same locking rules as the database triggers in migration 0003. */
    private guard(t: Row[]): Result | null {
      const status = (invoiceId: string) => tables.invoices.find((i) => i.id === invoiceId)?.status;
      if (this.table === 'invoice_lines') {
        const ids = this.mode === 'insert'
          ? (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r: Row) => r.invoice_id)
          : t.filter((r) => this.match(r)).map((r) => r.invoice_id);
        if (this.mode !== 'select' && ids.some((id: string) => status(id) !== undefined && status(id) !== 'DRAFT')) return fail('INVOICE_LOCKED');
      }
      if (this.table === 'invoices' && (this.mode === 'update' || this.mode === 'delete')) {
        for (const r of t.filter((x) => this.match(x))) {
          if (this.mode === 'delete' && r.status !== 'DRAFT') return fail('INVOICE_LOCKED');
          if (this.mode === 'update') {
            const keys = Object.keys(this.payload);
            if (keys.some((k) => ['status', 'number', 'issued_at'].includes(k))) return fail('USE_INVOICE_RPC');
            if (r.status !== 'DRAFT' && keys.length) return fail('INVOICE_LOCKED');
          }
        }
      }
      return null;
    }
    private run(): Result {
      const t = tables[this.table];
      if (!t) return fail(`unknown table ${this.table}`, '42P01');
      const blocked = this.guard(t);
      if (blocked) return blocked;
      if (this.mode === 'insert') {
        const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
        const made = arr.map((r) => {
          const row: Row = { id: uid(), created_at: new Date().toISOString(), ...(DEFAULTS[this.table]?.() ?? {}), ...r };
          if (this.table === 'invoice_lines') row.line_total = lineTotal(row as { qty: number; unit_price: number });
          return row;
        });
        t.push(...made);
        return ok(this.returning ? made : null);
      }
      if (this.mode === 'update') {
        const hit = t.filter((r) => this.match(r));
        hit.forEach((r) => {
          Object.assign(r, this.payload);
          if (this.table === 'invoice_lines') r.line_total = lineTotal(r as { qty: number; unit_price: number });
        });
        return ok(this.returning ? hit : null);
      }
      if (this.mode === 'delete') {
        tables[this.table] = t.filter((r) => !this.match(r));
        return ok(null);
      }
      let rows = t.filter((r) => this.match(r));
      const o = this.ord ?? { col: 'created_at', asc: true };
      rows = [...rows].sort((a, b) => (String(a[o.col] ?? '') < String(b[o.col] ?? '') ? -1 : 1) * (o.asc ? 1 : -1));
      if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1);
      if (this.max) rows = rows.slice(0, this.max);
      if (this.one) return rows.length === 1 ? ok({ ...rows[0] }) : fail('Row not found', 'PGRST116');
      return ok(rows.map((r) => ({ ...r })));
    }
  }
  // supabase-js uses order(col, {ascending}); keep the real signature
  (Query.prototype as any).order = function (this: Query, c: string, o?: { ascending?: boolean }) {
    return this.order_(c, o?.ascending ?? true);
  };

  const rpc = (name: string, a: Row): Result => {
    const logs = tables.project_logs;
    const inv = (id: string) => tables.inventory.find((i) => i.id === id);
    if (name === 'log_project_activity') {
      const dup = logs.find((l) => l.client_op_id === a.p_client_op_id);
      if (dup) return ok(dup);
      if (!(a.p_qty > 0)) return fail('QTY_MUST_BE_POSITIVE');
      if (!tables.projects.some((p) => p.id === a.p_project_id)) return fail('PROJECT_NOT_FOUND');
      if (a.p_category === 'SAW_CUT' && !settings().saw_rate_enabled) return fail('SAW_RATE_OFF');
      let cost: number, delta: number, invId: string | null = a.p_inventory_id ?? null;
      if (a.p_category === 'LABOR') { cost = settings().hourly_labor_rate; delta = a.p_qty; invId = null; }
      else if (a.p_category === 'SAW_CUT') { cost = settings().saw_cut_rate; delta = a.p_qty; invId = null; }
      else {
        const it = invId ? inv(invId) : undefined;
        if (!it) return fail('INVENTORY_NOT_FOUND');
        if (it.qty_on_hand < a.p_qty) return fail('INSUFFICIENT_STOCK');
        it.qty_on_hand -= a.p_qty; cost = it.last_buy_price; delta = -a.p_qty;
      }
      const row = { id: uid(), company_id: COMPANY, project_id: a.p_project_id, inventory_id: invId, log_category: a.p_category, description: a.p_description ?? null, qty_delta: delta, unit_cost_at_time: cost, charged_amount: a.p_charged_amount ?? null, source_log_id: null, service_batch_id: a.p_service_batch_id ?? null, client_op_id: a.p_client_op_id, created_at: new Date().toISOString() };
      logs.push(row);
      return ok(row);
    }
    if (name === 'log_weld') {
      const dup = logs.find((l) => l.client_op_id === a.p_client_op_id);
      if (dup) return ok(dup);
      if (!(a.p_length_cm > 0)) return fail('QTY_MUST_BE_POSITIVE');
      if (!['MIG', 'MAG', 'TIG_DC', 'TIG_ACDC', 'PULSE', 'MMA', 'PLASMA', 'LASER'].includes(a.p_process)) return fail('BAD_PROCESS');
      if (!tables.projects.some((p) => p.id === a.p_project_id)) return fail('PROJECT_NOT_FOUND');
      if (!settings().weld_rate_enabled) return fail('WELD_RATE_OFF');
      const cfg = (settings().process_config ?? {})[a.p_process] ?? {};
      const items = new Map<string, InventoryItem>(tables.inventory.map((i) => [i.id, i as unknown as InventoryItem]));
      const use = settings().auto_consumption_enabled ? weldConsumption(cfg, a.p_length_cm, items) : {};
      if (!canSupplyWeld(use, items)) return fail('INSUFFICIENT_STOCK');
      const now = new Date().toISOString();
      const parent = { id: uid(), company_id: COMPANY, project_id: a.p_project_id, inventory_id: null, log_category: 'WELD_LENGTH', description: a.p_process, qty_delta: a.p_length_cm, unit_cost_at_time: cfg.rate_per_cm ?? 0, charged_amount: null, source_log_id: null, service_batch_id: null, client_op_id: a.p_client_op_id, created_at: now };
      logs.push(parent);
      for (const part of [use.wire, use.gas]) {
        if (!part) continue;
        const it = inv(part.itemId)!;
        it.qty_on_hand -= part.qty;
        logs.push({ id: uid(), company_id: COMPANY, project_id: a.p_project_id, inventory_id: it.id, log_category: 'WELD', description: it.name, qty_delta: -part.qty, unit_cost_at_time: it.last_buy_price, charged_amount: null, source_log_id: null, service_batch_id: null, parent_log_id: parent.id, client_op_id: uid(), created_at: now });
      }
      return ok(parent);
    }
    if (name === 'undo_project_log') {
      const l = logs.find((x) => x.id === a.p_log_id);
      if (!l) return fail('LOG_NOT_FOUND');
      if (l.parent_log_id) return fail('UNDO_PARENT_INSTEAD');
      if (logs.some((x) => x.source_log_id === l.id)) return fail('UNDO_REMNANT_FIRST');
      for (const c of logs.filter((x) => x.parent_log_id === l.id)) { if (c.inventory_id) inv(c.inventory_id)!.qty_on_hand -= c.qty_delta; }
      tables.project_logs = tables.project_logs.filter((x) => x.parent_log_id !== l.id);
      if (l.inventory_id) {
        const it = inv(l.inventory_id)!;
        if (it.qty_on_hand - l.qty_delta < 0) return fail('new row violates check constraint', '23514');
        it.qty_on_hand -= l.qty_delta;
      }
      tables.project_logs = logs.filter((x) => x.id !== l.id);
      return ok(null);
    }
    if (name === 'return_remnant') {
      const dup = logs.find((l) => l.client_op_id === a.p_client_op_id);
      if (dup) return ok(dup);
      const src = logs.find((l) => l.id === a.p_log_id);
      if (!src || !src.inventory_id || src.qty_delta >= 0 || src.log_category !== 'MATERIAL') return fail('NOT_A_BAR_DEDUCTION');
      const bar = inv(src.inventory_id)!;
      if (!bar.standard_length_mm) return fail('NOT_A_BAR');
      if (!(a.p_length_mm > 0)) return fail('BAD_REMNANT_LENGTH');
      if (a.p_length_mm < settings().min_remnant_length_mm) return fail('REMNANT_BELOW_MIN');
      if (a.p_length_mm >= bar.standard_length_mm) return fail('REMNANT_TOO_LONG');
      if (logs.some((l) => l.source_log_id === src.id)) return fail('duplicate key value violates unique constraint', '23505');
      const credit = (src.unit_cost_at_time * a.p_length_mm) / bar.standard_length_mm;
      let rem = tables.inventory.find((i) => i.parent_id === bar.id && i.is_remnant && i.remnant_length_mm === a.p_length_mm);
      if (!rem) {
        rem = { ...bar, id: uid(), name: `${bar.name} remnant ${a.p_length_mm}mm`, standard_length_mm: null, unit_label: 'PCS', folder: 'RAW', subfolder: 'REMNANTS', qty_on_hand: 0, min_alert_qty: 0, is_remnant: true, remnant_length_mm: a.p_length_mm, parent_id: bar.id, last_buy_price: (bar.last_buy_price * a.p_length_mm) / bar.standard_length_mm };
        tables.inventory.push(rem);
      }
      rem.qty_on_hand += 1;
      const row = { id: uid(), company_id: COMPANY, project_id: src.project_id, inventory_id: rem.id, log_category: 'MATERIAL', description: `Remnant returned ${a.p_length_mm}mm`, qty_delta: 1, unit_cost_at_time: -credit, charged_amount: null, source_log_id: src.id, service_batch_id: src.service_batch_id, client_op_id: a.p_client_op_id, created_at: new Date().toISOString() };
      logs.push(row);
      return ok(row);
    }
    if (name === 'record_purchase') {
      const dup = tables.purchases.find((p) => p.client_op_id === a.p_client_op_id);
      if (dup) return ok(dup);
      const it = inv(a.p_inventory_id);
      if (!it) return fail('INVENTORY_NOT_FOUND');
      if (!(a.p_qty > 0) || a.p_unit_price < 0) return fail('BAD_AMOUNT');
      it.qty_on_hand += a.p_qty; it.prev_buy_price = it.last_buy_price; it.last_buy_price = a.p_unit_price;
      const row = { id: uid(), company_id: COMPANY, inventory_id: it.id, brand_tag: a.p_brand_tag ?? null, qty_bought: a.p_qty, unit_price_paid: a.p_unit_price, total_paid: a.p_qty * a.p_unit_price, purchased_at: new Date().toISOString(), client_op_id: a.p_client_op_id };
      tables.purchases.push(row);
      return ok(row);
    }
    const itemMap = () => new Map<string, InventoryItem>(tables.inventory.map((i) => [i.id, i as unknown as InventoryItem]));
    const fillLines = (inv: Row) => {
      tables.invoice_lines = tables.invoice_lines.filter((l) => l.invoice_id !== inv.id);
      const logsOf = tables.project_logs.filter((l) => l.project_id === inv.project_id) as unknown as LogRow[];
      seedExternalLines(logsOf, itemMap(), inv.language as InvoiceLang, Number(settings().weld_consumable_markup_pct)).forEach((l, i) => {
        tables.invoice_lines.push({ id: uid(), company_id: COMPANY, invoice_id: inv.id, position: i, ...l, line_total: lineTotal(l) });
      });
    };
    if (name === 'create_external_invoice') {
      const dup = tables.invoices.find((i) => i.client_op_id === a.p_client_op_id);
      if (dup) return ok(dup);
      const proj = tables.projects.find((p) => p.id === a.p_project_id);
      if (!proj) return fail('PROJECT_NOT_FOUND');
      const inv = { id: uid(), company_id: COMPANY, project_id: proj.id, status: 'DRAFT', number: null, issued_at: null, due_date: proj.due_date, client_name: proj.client_name, client_address: null, vat_pct: settings().default_vat_pct, notes: null, advance_paid: proj.advance_paid, currency: settings().currency, language: a.p_language === 'mk' ? 'mk' : 'en', client_op_id: a.p_client_op_id, created_at: new Date().toISOString() };
      tables.invoices.unshift(inv);
      fillLines(inv);
      return ok(inv);
    }
    if (name === 'fill_invoice_lines') {
      const inv = tables.invoices.find((i) => i.id === a.p_invoice_id);
      if (!inv) return fail('INVOICE_NOT_FOUND');
      if (inv.status !== 'DRAFT') return fail('INVOICE_LOCKED');
      fillLines(inv);
      return ok(null);
    }
    if (name === 'issue_invoice') {
      const inv = tables.invoices.find((i) => i.id === a.p_invoice_id);
      if (!inv) return fail('INVOICE_NOT_FOUND');
      if (inv.status !== 'DRAFT') return fail('ALREADY_ISSUED');
      if (!tables.invoice_lines.some((l) => l.invoice_id === inv.id)) return fail('INVOICE_HAS_NO_LINES');
      const year = new Date().getFullYear();
      const n = (counters.get(String(year)) ?? 0) + 1;
      counters.set(String(year), n);
      Object.assign(inv, { status: 'ISSUED', number: `INV-${year}-${String(n).padStart(4, '0')}`, issued_at: new Date().toISOString().slice(0, 10) });
      return ok(inv);
    }
    if (name === 'set_invoice_status') {
      const inv = tables.invoices.find((i) => i.id === a.p_invoice_id);
      if (!inv) return fail('INVOICE_NOT_FOUND');
      const okMove = (inv.status === 'ISSUED' && ['PAID', 'VOID'].includes(a.p_status)) || (inv.status === 'PAID' && a.p_status === 'ISSUED');
      if (!okMove) return fail('BAD_STATUS_CHANGE');
      inv.status = a.p_status;
      return ok(inv);
    }
    return fail(`unknown rpc ${name}`, '42883');
  };

  // ---- auth: starts signed in so the preview opens on the workspace
  const session: any = { access_token: 'demo', user: { id: 'demo-user', email: 'demo@reinkraft.mk' } };
  let current: any = session;
  const listeners = new Set<(e: string, s: any) => void>();
  const emit = (e: string) => listeners.forEach((fn) => fn(e, current));

  const client = {
    from: (t: string) => new Query(t),
    rpc: (name: string, args: Row) => latency(rpc(name, args)),
    auth: {
      getSession: async () => ({ data: { session: current }, error: null }),
      onAuthStateChange: (fn: (e: string, s: any) => void) => {
        listeners.add(fn);
        return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } };
      },
      signInWithPassword: async () => { current = session; emit('SIGNED_IN'); return { data: { session }, error: null }; },
      signOut: async () => { current = null; emit('SIGNED_OUT'); return { error: null }; },
    },
  };
  return client as unknown as SupabaseClient;
}
