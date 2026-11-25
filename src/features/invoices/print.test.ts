import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invoice, InvoiceLine, Project, Settings } from '../../lib/types';

const printed: string[] = [];
vi.mock('../../lib/printService', () => ({ printHtml: (_t: string, html: string) => printed.push(html), escapeHtml: (s: string) => s }));

let lines: InvoiceLine[] = [];
vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: lines, error: null }) }) }) }) },
}));

const { printProjectExternal } = await import('./print');

const project = { id: 'p1', title: 'Gate', client_name: 'Mile', advance_paid: 0, quoted_price: null, due_date: null } as unknown as Project;
const settings = { company_name: 'Reinkraft', currency: 'EUR', logo_data_url: null } as unknown as Settings;
const inv = (o: Partial<Invoice>): Invoice => ({
  id: 'i', project_id: 'p1', status: 'DRAFT', number: null, issued_at: null, due_date: null, client_name: 'Mile', client_address: null,
  vat_pct: 0, notes: null, advance_paid: 0, currency: 'EUR', language: 'en', created_at: '', ...o,
});
const line = { id: 'l', invoice_id: 'i', position: 0, line_type: 'LABOR', description: 'Labour', qty: 1, unit: 'h', unit_price: 10, source_inventory_id: null, line_total: 10 } as InvoiceLine;

describe('printing the external document of a project', () => {
  beforeEach(() => { printed.length = 0; lines = [line]; });

  it('prints the newest invoice that is not void, and creates nothing', async () => {
    const create = vi.fn();
    const invoices = [inv({ id: 'void', status: 'VOID' }), inv({ id: 'newest', status: 'ISSUED', number: 'INV-2026-0002' }), inv({ id: 'older' })];
    const r = await printProjectExternal({ project, settings, invoices, language: 'en', create });
    expect(r).toEqual({ status: 'printed' });
    expect(create).not.toHaveBeenCalled();
    expect(printed[0]).toContain('INV-2026-0002');
  });

  it('ignores invoices of other projects and creates a draft quote in the current language', async () => {
    const create = vi.fn(async () => ({ invoice: inv({ id: 'new', language: 'mk' }), error: null }));
    const r = await printProjectExternal({ project, settings, invoices: [inv({ project_id: 'other' })], language: 'mk', create });
    expect(create).toHaveBeenCalledWith('p1', 'mk');
    expect(r).toEqual({ status: 'printed' });
    expect(printed[0]).toContain('Понуда');                    // a draft prints as a quote
  });

  it('does not print an empty document: it hands back the invoice so the editor can open on it', async () => {
    lines = [];
    const create = vi.fn(async () => ({ invoice: inv({ id: 'empty' }), error: null }));
    const r = await printProjectExternal({ project, settings, invoices: [], language: 'en', create });
    expect(r).toEqual({ status: 'empty', invoiceId: 'empty' });
    expect(printed).toHaveLength(0);
  });

  it('reports a failure to create instead of printing', async () => {
    const create = vi.fn(async () => ({ invoice: null, error: 'PROJECT_NOT_FOUND' }));
    const r = await printProjectExternal({ project, settings, invoices: [], language: 'en', create });
    expect(r).toEqual({ status: 'error', message: 'PROJECT_NOT_FOUND' });
    expect(printed).toHaveLength(0);
  });
});
