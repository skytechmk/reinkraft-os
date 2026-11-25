import type { ProcessConfig } from '../domain/weld';

export type Unit = 'PCS' | 'BAR' | 'SHEET' | 'ML' | 'M' | 'BOX' | 'M2' | 'KG' | 'L';
export type ProcessCode = 'MIG' | 'MAG' | 'TIG_DC' | 'TIG_ACDC' | 'PULSE' | 'MMA' | 'PLASMA' | 'LASER';
export type FolderId = 'RAW' | 'HARDWARE' | 'ABRASIVES' | 'CHEMICAL' | 'WELDING';

export interface Settings {
  company_id: string;
  company_name: string;
  currency: 'EUR' | 'USD' | 'MKD';
  unit_system: 'METRIC' | 'IMPERIAL';
  hourly_labor_rate: number;
  weld_consumable_markup_pct: number;
  min_remnant_length_mm: number;
  logo_data_url: string | null;
  company_address: string | null;
  company_tax_id: string | null;
  company_phone: string | null;
  company_bank_account: string | null;
  default_vat_pct: number;
  payment_terms: string | null;
  /** white-label colours, applied as CSS variables. Keys: accent, ink, plate (hex). */
  tenant_theme: { accent?: string; ink?: string; plate?: string };
  enabled_processes: ProcessCode[];
  // billing rates and automatic consumption (migration 0006). Missing means OFF.
  weld_rate_enabled?: boolean;
  saw_rate_enabled?: boolean;
  saw_cut_rate?: number;
  auto_consumption_enabled?: boolean;
  process_config?: ProcessConfig;
}

export interface InventoryItem {
  id: string;
  name: string;
  item_type: 'PROFILE' | 'SHEET' | 'CONSUMABLE' | 'CHEMICAL' | 'CUSTOM';
  material_grade: string | null;
  standard_length_mm: number | null;
  unit_label: Unit;
  qty_on_hand: number;
  min_alert_qty: number;
  last_buy_price: number;
  prev_buy_price: number | null;
  is_remnant: boolean;
  remnant_length_mm: number | null;
  parent_id: string | null;
  weight_kg_per_m: number | null;
  surface_m2_per_m: number | null;
  coverage_m2_per_l: number | null;
  /** two-level folder: see domain/folders.ts. null for items created before folders existed. */
  folder: FolderId | null;
  subfolder: string | null;
  /** welding processes this item belongs to; empty means shared by all */
  process_tags: ProcessCode[];
  manufacturer_sku: string | null;
  supplier_name: string | null;
  supplier_contact: string | null;
}

export interface Project {
  id: string;
  project_type: 'MAIN' | 'SYSTEM_SERVICE';
  status: 'QUOTE' | 'ACTIVE' | 'FINISHED';
  title: string;
  client_name: string | null;
  quoted_price: number | null;
  advance_paid: number;
  status_note: string | null;
  due_date: string | null;
  workshop_notes: string | null;
  cut_list: string | null;
}

export interface LogRow {
  id: string;
  project_id: string;
  inventory_id: string | null;
  log_category: 'LABOR' | 'WELD' | 'MATERIAL' | 'CONSUMABLE' | 'HARDWARE' | 'ONE_OFF_EXPENSE' | 'WELD_LENGTH' | 'SAW_CUT';
  description: string | null;
  qty_delta: number;
  unit_cost_at_time: number;
  charged_amount: number | null;
  source_log_id: string | null;
  service_batch_id: string | null;
  /** the wire and gas rows of a weld point at the weld length row; they are undone with it */
  parent_log_id?: string | null;
  created_at: string;
}

export interface PurchaseRow {
  id: string;
  inventory_id: string;
  brand_tag: string | null;
  qty_bought: number;
  unit_price_paid: number;
  total_paid: number;
  purchased_at: string;
}

export interface NoteRow {
  id: string;
  project_id: string;
  note_text: string;
  is_pinned_warning: boolean;
}

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID';
export type InvoiceLang = 'en' | 'mk';

export interface Invoice {
  id: string;
  project_id: string;
  status: InvoiceStatus;
  number: string | null;
  issued_at: string | null;
  due_date: string | null;
  client_name: string | null;
  client_address: string | null;
  vat_pct: number;
  notes: string | null;
  advance_paid: number;
  currency: 'EUR' | 'USD' | 'MKD';
  language: InvoiceLang;
  created_at: string;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  position: number;
  line_type: 'LABOR' | 'MATERIAL' | 'CONSUMABLE' | 'WELD' | 'HARDWARE' | 'CUSTOM';
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  source_inventory_id: string | null;
  line_total: number;
}
