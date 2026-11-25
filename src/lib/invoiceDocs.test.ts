import { describe, expect, it } from 'vitest';
import { externalInvoiceHtml, internalInvoiceHtml } from './invoiceDocs';
import { buildInternalInvoice } from '../domain/invoice';
import type { Invoice, InvoiceLine, Project, Settings } from './types';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const settings: Settings = {
  company_id: 'c', company_name: 'Reinkraft <Metal>', currency: 'EUR', unit_system: 'METRIC', hourly_labor_rate: 20, weld_consumable_markup_pct: 70,
  min_remnant_length_mm: 500, logo_data_url: PNG, company_address: 'Main St 1\nSkopje', company_tax_id: 'MK123',
  company_phone: '+389', company_bank_account: 'Bank 555', default_vat_pct: 18,
  payment_terms: null, tenant_theme: {}, enabled_processes: ['MIG'],
};
const project: Project = { id: 'p', project_type: 'MAIN', status: 'ACTIVE', title: 'Gate', client_name: 'Mile', quoted_price: null, advance_paid: 0, status_note: null, due_date: null, workshop_notes: null, cut_list: null };
const invoice: Invoice = {
  id: 'i', project_id: 'p', status: 'ISSUED', number: 'INV-2026-0001', issued_at: '2026-11-24', due_date: '2026-12-05',
  client_name: 'Mile <script>alert(1)</script>', client_address: null, vat_pct: 18, notes: null, advance_paid: 100, currency: 'EUR', language: 'en', created_at: '',
};
const lines: InvoiceLine[] = [
  { id: 'l1', invoice_id: 'i', position: 0, line_type: 'LABOR', description: 'Labour', qty: 5, unit: 'h', unit_price: 20, source_inventory_id: null, line_total: 100 },
];

describe('external invoice document', () => {
  it('carries the logo, company details, number, lines and totals', () => {
    const html = externalInvoiceHtml({ invoice, lines, project, settings });
    expect(html).toContain(`<img class="logo" src="${PNG}"`);
    expect(html).toContain('INV-2026-0001');
    expect(html).toContain('MK123');
    expect(html).toContain('Labour');
    expect(html).toContain('Bank 555');
  });

  it('escapes everything a person typed', () => {
    const html = externalInvoiceHtml({ invoice, lines, project, settings });
    expect(html).not.toContain('<script>');
    expect(html).toContain('Reinkraft &lt;Metal&gt;');
  });

  it('never embeds a logo that is not a small PNG or JPEG data URL', () => {
    const html = externalInvoiceHtml({ invoice, lines, project, settings: { ...settings, logo_data_url: 'javascript:alert(1)' } });
    expect(html).not.toContain('<img');
  });

  it('prints in the language stored on the invoice, with no internal cost wording', () => {
    const mk = externalInvoiceHtml({ invoice: { ...invoice, language: 'mk' }, lines, project, settings });
    expect(mk).toContain('Фактура');
    expect(mk).toContain('Остаток за наплата');
    expect(mk).not.toMatch(/margin|маржа|stock|залиха/i);
  });

  it('prints the payment terms under the totals when set, escaped, and leaves them out when not', () => {
    const withTerms = externalInvoiceHtml({ invoice, lines, project, settings: { ...settings, payment_terms: 'Net 15 days <i>strict</i>' } });
    expect(withTerms).toContain('Payment terms');
    expect(withTerms).toContain('Net 15 days &lt;i&gt;strict&lt;/i&gt;');
    expect(withTerms.indexOf('Payment terms')).toBeGreaterThan(withTerms.indexOf('Balance due'));
    expect(externalInvoiceHtml({ invoice, lines, project, settings })).not.toContain('Payment terms');
    const mk = externalInvoiceHtml({ invoice: { ...invoice, language: 'mk' }, lines, project, settings: { ...settings, payment_terms: '15 дена' } });
    expect(mk).toContain('Услови за плаќање');
  });

  it('shows no internal costs or markup percentages', () => {
    const html = externalInvoiceHtml({ invoice, lines, project, settings });
    expect(html).not.toMatch(/markup|70%|internal|cost/i);
  });

  it('prints a draft as a quote without a number, and an issued one as an invoice', () => {
    const quote = externalInvoiceHtml({ invoice: { ...invoice, number: null, status: 'DRAFT' }, lines, project, settings });
    expect(quote).toContain('<h1>Quote</h1>');
    expect(quote).not.toContain('Invoice no.');
    const issued = externalInvoiceHtml({ invoice, lines, project, settings });
    expect(issued).toContain('<h1>Invoice</h1>');
    expect(issued).toContain('INV-2026-0001');
    const mk = externalInvoiceHtml({ invoice: { ...invoice, number: null, status: 'DRAFT', language: 'mk' }, lines, project, settings });
    expect(mk).toContain('<h1>Понуда</h1>');
  });
});

describe('internal work sheet', () => {
  const logs = [
    { id: '1', project_id: 'p', inventory_id: null, log_category: 'LABOR', description: null, qty_delta: 2.5, unit_cost_at_time: 600, charged_amount: null, source_log_id: null, service_batch_id: null, created_at: '2026-11-20T09:00:00' },
    { id: '2', project_id: 'p', inventory_id: 'w', log_category: 'WELD', description: null, qty_delta: -48, unit_cost_at_time: 4.2, charged_amount: null, source_log_id: null, service_batch_id: null, created_at: '2026-11-20T09:00:00' },
    { id: '3', project_id: 'p', inventory_id: 't', log_category: 'MATERIAL', description: null, qty_delta: -2, unit_cost_at_time: 77.7, charged_amount: null, source_log_id: null, service_batch_id: null, created_at: '2026-11-20T09:00:00' },
  ] as const;
  const wire = { id: 'w', name: 'MIG wire', item_type: 'CONSUMABLE', material_grade: null, standard_length_mm: null, unit_label: 'M', qty_on_hand: 90, min_alert_qty: 100, last_buy_price: 4.2, prev_buy_price: null, is_remnant: false, remnant_length_mm: null, parent_id: null, weight_kg_per_m: null, surface_m2_per_m: null, coverage_m2_per_l: null, folder: null, subfolder: null, process_tags: [] as never[], manufacturer_sku: null, supplier_name: null, supplier_contact: null } as const;
  const tube = { ...wire, id: 't', name: 'Tube 40x40', item_type: 'PROFILE', unit_label: 'BAR', qty_on_hand: 8, min_alert_qty: 2 } as const;
  const items = [wire, tube];
  const internal = buildInternalInvoice([...logs], [...items]);
  const noted: Project = { ...project, workshop_notes: 'Grind <b>smooth</b>\nPaint RAL 7016', cut_list: '2 x 1200 mm\n\n4 x 800 <script>' };
  const render = (lang: 'en' | 'mk' = 'en', p: Project = noted) =>
    internalInvoiceHtml({ project: p, internal, settings, lang, logs: [...logs], items: [...items] });

  it('is marked as not for the client, carries the logo, and shows hours, materials and stock left', () => {
    const html = render();
    expect(html).toContain('Internal work sheet');
    expect(html).toContain('no prices');
    expect(html).toContain('<img class="logo"');
    expect(html).toContain('MIG wire');
    expect(html).toContain('Tube 40x40');
    expect(html).toContain('(low)');
    expect(html).toContain('Hours logged so far');
  });

  it('prints title, client, workshop notes and cut list, escaped', () => {
    const html = render();
    expect(html).toContain('Gate');
    expect(html).toContain('Mile');
    expect(html).toContain('Grind &lt;b&gt;smooth&lt;/b&gt;<br>Paint RAL 7016');
    expect(html).toContain('2 x 1200 mm');
    expect(html).toContain('4 x 800 &lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>smooth');
  });

  it('puts an empty checkbox only on consumables (weld and consumable categories), not on materials', () => {
    const html = render();
    const checklist = html.slice(html.indexOf('Consumables checklist'), html.indexOf('Hours logged so far'));
    expect(checklist).toContain('&#9744;');
    expect(checklist).toContain('MIG wire');
    expect(checklist).not.toContain('Tube 40x40');
  });

  it('says so when there are no notes, cut list or consumables', () => {
    const html = internalInvoiceHtml({ project, internal: buildInternalInvoice([], []), settings, lang: 'en' });
    expect(html).toContain('No workshop notes.');
    expect(html).toContain('No cut list.');
    expect(html).toContain('No consumables logged yet.');
  });

  it('has no prices, rates, costs or margin anywhere, in either language', () => {
    for (const lang of ['en', 'mk'] as const) {
      const html = render(lang);
      expect(html).not.toMatch(/EUR|€|MKD|\bден\b|cost|margin|\brates?\b|markup|трошок|маржа|цена|\b600\b|\b77[.,]7|201[.,]6/i);
    }
  });

  it('is in Macedonian when the app is', () => {
    const html = render('mk');
    expect(html).toContain('Интерна работна листа');
    expect(html).toContain('без цени');
    expect(html).toContain('Работилнички белешки');
    expect(html).toContain('Список за сечење');
    expect(html).toContain('Контролна листа за потрошен материјал');
    expect(html).toContain('Потребен материјал');
  });
});
