import { useQuery, useQueryClient } from '@tanstack/react-query';
import { newOpId, supabase } from '../../lib/supabase';
import type { Invoice, InvoiceLang, InvoiceLine, InvoiceStatus } from '../../lib/types';
import { lineTotal, type DraftLine } from '../../domain/invoice';
import type { MessageKey } from '../../i18n';

// Invoices are online-only: they are office work, and numbering must come from the server.
// None of these calls can change stock: invoices and invoice lines are separate tables.

function unwrap<T>(res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export function useInvoices() {
  return useQuery({
    queryKey: ['invoices'],
    queryFn: async () => unwrap<Invoice[]>(await supabase.from('invoices').select('*').order('created_at', { ascending: false })),
  });
}

export function useInvoiceLines(invoiceId: string | null) {
  return useQuery({
    queryKey: ['invoice-lines', invoiceId],
    enabled: !!invoiceId,
    queryFn: async () =>
      unwrap<InvoiceLine[]>(await supabase.from('invoice_lines').select('*').eq('invoice_id', invoiceId as string).order('position')),
  });
}

/** Subtotal (before VAT) of every invoice, for the list. */
export function useInvoiceSums() {
  return useQuery({
    queryKey: ['invoice-sums'],
    queryFn: async () => {
      const rows = unwrap<{ invoice_id: string; line_total: number }[]>(await supabase.from('invoice_lines').select('invoice_id,line_total'));
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.invoice_id, (m.get(r.invoice_id) ?? 0) + Number(r.line_total));
      return m;
    },
  });
}

const KNOWN: Record<string, MessageKey> = {
  INVOICE_LOCKED: 'invoices.err.locked',
  ALREADY_ISSUED: 'invoices.err.alreadyIssued',
  INVOICE_HAS_NO_LINES: 'invoices.err.noLines',
  BAD_STATUS_CHANGE: 'invoices.err.badStatus',
  PROJECT_NOT_FOUND: 'invoices.err.noProject',
};

/** Maps a server error to a translated message key, or null for an unknown one (show it as it is). */
export function friendlyError(message: string): MessageKey | null {
  const hit = Object.keys(KNOWN).find((k) => message.includes(k));
  return hit ? KNOWN[hit] : null;
}

export function useInvoiceActions() {
  const qc = useQueryClient();
  const refreshAll = (invoiceId?: string) => {
    void qc.invalidateQueries({ queryKey: ['invoices'] });
    void qc.invalidateQueries({ queryKey: ['invoice-sums'] });
    if (invoiceId) void qc.invalidateQueries({ queryKey: ['invoice-lines', invoiceId] });
  };

  return {
    async create(projectId: string, language: InvoiceLang): Promise<{ invoice: Invoice | null; error: string | null }> {
      const { data, error } = await supabase.rpc('create_external_invoice', { p_client_op_id: newOpId(), p_project_id: projectId, p_language: language });
      refreshAll();
      return { invoice: error ? null : (data as Invoice), error: error?.message ?? null };
    },

    async update(id: string, patch: Partial<Invoice>): Promise<string | null> {
      qc.setQueryData<Invoice[]>(['invoices'], (old) => (old ?? []).map((i) => (i.id === id ? { ...i, ...patch } : i)));
      const { error } = await supabase.from('invoices').update(patch).eq('id', id);
      if (error) refreshAll();
      return error?.message ?? null;
    },

    async updateLine(invoiceId: string, lineId: string, patch: Partial<Pick<InvoiceLine, 'description' | 'qty' | 'unit' | 'unit_price'>>): Promise<string | null> {
      qc.setQueryData<InvoiceLine[]>(['invoice-lines', invoiceId], (old) =>
        (old ?? []).map((l) => {
          if (l.id !== lineId) return l;
          const next = { ...l, ...patch };
          return { ...next, line_total: lineTotal(next) };
        }),
      );
      const { error } = await supabase.from('invoice_lines').update(patch).eq('id', lineId);
      refreshAll(invoiceId);
      return error?.message ?? null;
    },

    async addLine(invoiceId: string, companyId: string, line: DraftLine, position: number): Promise<string | null> {
      const { error } = await supabase.from('invoice_lines').insert({ ...line, company_id: companyId, invoice_id: invoiceId, position });
      refreshAll(invoiceId);
      return error?.message ?? null;
    },

    async removeLine(invoiceId: string, lineId: string): Promise<string | null> {
      qc.setQueryData<InvoiceLine[]>(['invoice-lines', invoiceId], (old) => (old ?? []).filter((l) => l.id !== lineId));
      const { error } = await supabase.from('invoice_lines').delete().eq('id', lineId);
      refreshAll(invoiceId);
      return error?.message ?? null;
    },

    /** Rebuilds the lines from the project records. Discards edits. */
    async reset(invoiceId: string): Promise<string | null> {
      const { error } = await supabase.rpc('fill_invoice_lines', { p_invoice_id: invoiceId });
      refreshAll(invoiceId);
      return error?.message ?? null;
    },

    async issue(invoiceId: string): Promise<string | null> {
      const { error } = await supabase.rpc('issue_invoice', { p_invoice_id: invoiceId });
      refreshAll(invoiceId);
      return error?.message ?? null;
    },

    async setStatus(invoiceId: string, status: InvoiceStatus): Promise<string | null> {
      const { error } = await supabase.rpc('set_invoice_status', { p_invoice_id: invoiceId, p_status: status });
      refreshAll(invoiceId);
      return error?.message ?? null;
    },

    async deleteDraft(invoiceId: string): Promise<string | null> {
      const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);
      refreshAll(invoiceId);
      return error?.message ?? null;
    },
  };
}
