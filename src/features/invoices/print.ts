import { printHtml } from '../../lib/printService';
import { externalInvoiceHtml, internalInvoiceHtml } from '../../lib/invoiceDocs';
import { buildInternalInvoice } from '../../domain/invoice';
import { getLang, translate } from '../../i18n';
import { supabase } from '../../lib/supabase';
import type { InventoryItem, Invoice, InvoiceLang, InvoiceLine, LogRow, Project, Settings } from '../../lib/types';

export interface InternalSheetArgs {
  project: Project;
  logs: LogRow[];
  items: InventoryItem[];
  settings: Settings;
}

/** Prints the internal workshop job sheet (notes, cut list, materials, consumables checklist, hours; no prices) in the language the app is showing. */
export function printInternalSheet({ project, logs, items, settings }: InternalSheetArgs): void {
  const lang = getLang();
  const html = internalInvoiceHtml({ project, internal: buildInternalInvoice(logs, items), settings, lang, logs, items });
  printHtml(`${translate(lang, 'docs.internal.title')} ${project.title}`, html);
}

export interface ExternalInvoiceArgs {
  invoice: Invoice;
  lines: InvoiceLine[];
  project: Project;
  settings: Settings;
}

/** Prints the client document in the language stored on it. Use the browser's "Save as PDF" to keep a file. */
export function printExternalInvoice(args: ExternalInvoiceArgs): void {
  const { invoice } = args;
  const word = translate(invoice.language, invoice.status === 'DRAFT' ? 'docs.quote' : 'docs.invoice');
  printHtml(`${word} ${invoice.number ?? ''}`.trim(), externalInvoiceHtml(args));
}

export type ProjectPrintResult =
  | { status: 'printed' }
  | { status: 'empty'; invoiceId: string }
  | { status: 'error'; message: string };

interface ProjectExternalArgs {
  project: Project;
  settings: Settings;
  invoices: Invoice[];
  language: InvoiceLang;
  create: (projectId: string, language: InvoiceLang) => Promise<{ invoice: Invoice | null; error: string | null }>;
}

/**
 * Prints the project's newest quote or invoice that is not voided. If there is none, a draft quote is
 * created from the project's records first. A document with no lines is not printed: the caller opens
 * the editor on it instead.
 */
export async function printProjectExternal({ project, settings, invoices, language, create }: ProjectExternalArgs): Promise<ProjectPrintResult> {
  let invoice = invoices.filter((i) => i.project_id === project.id && i.status !== 'VOID')[0] ?? null;   // list is newest first
  if (!invoice) {
    const made = await create(project.id, language);
    if (made.error || !made.invoice) return { status: 'error', message: made.error ?? 'UNKNOWN' };
    invoice = made.invoice;
  }
  const { data, error } = await supabase.from('invoice_lines').select('*').eq('invoice_id', invoice.id).order('position');
  if (error) return { status: 'error', message: error.message };
  const lines = data as InvoiceLine[];
  if (!lines.length) return { status: 'empty', invoiceId: invoice.id };
  printExternalInvoice({ invoice, lines, project, settings });
  return { status: 'printed' };
}
