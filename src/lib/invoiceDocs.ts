import { escapeHtml as e } from './printService';
import { isSafeLogoDataUrl } from './logo';
import { LOCALES, unitName, type Lang } from '../i18n/core';
import { translate, type MessageKey } from '../i18n';
import { invoiceTotals, lineTotal, type InternalInvoice } from '../domain/invoice';
import { convertQty } from '../domain/measure';
import type { InventoryItem, Invoice, InvoiceLine, LogRow, Project, Settings } from './types';

const money = (n: number, cur: string, lang: Lang) =>
  new Intl.NumberFormat(LOCALES[lang], { style: 'currency', currency: cur }).format(n);
const num = (n: number, lang: Lang) => new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: 3 }).format(n);
const day = (iso: string, lang: Lang) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(LOCALES[lang]);
const lines2br = (s: string) => e(s).replace(/\r?\n/g, '<br>');

/** Company block: logo (only a safe PNG/JPEG data URL), name, address, tax id, phone. */
function companyBlock(s: Settings, lang: Lang): string {
  const t = (k: MessageKey) => translate(lang, k);
  const parts = [
    s.company_address ? lines2br(s.company_address) : '',
    s.company_tax_id ? `${e(t('docs.taxId'))}: ${e(s.company_tax_id)}` : '',
    s.company_phone ? `${e(t('docs.phone'))}: ${e(s.company_phone)}` : '',
  ].filter(Boolean);
  return `<div>${isSafeLogoDataUrl(s.logo_data_url) ? `<img class="logo" src="${s.logo_data_url}" alt="">` : ''}
    <h1>${e(s.company_name)}</h1><div class="small">${parts.join('<br>')}</div></div>`;
}

interface ExternalArgs { invoice: Invoice; lines: InvoiceLine[]; project: Project; settings: Settings }

/**
 * The document for the client, with prices, in the language stored on it.
 * A draft is a quote; once issued (or paid) it is an invoice with its number.
 */
export function externalInvoiceHtml({ invoice, lines, project, settings }: ExternalArgs): string {
  const lang: Lang = invoice.language;
  const t = (k: MessageKey, p?: Record<string, string | number>) => translate(lang, k, p);
  const cur = invoice.currency;
  const tot = invoiceTotals(lines, invoice.vat_pct, invoice.advance_paid);
  const isQuote = invoice.status === 'DRAFT';
  const rows = [...lines].sort((a, b) => a.position - b.position).map((l) =>
    `<tr><td>${e(l.description)}</td><td class="r">${num(l.qty, lang)}</td><td>${e(l.unit)}</td>
     <td class="r">${money(l.unit_price, cur, lang)}</td><td class="r">${money(lineTotal(l), cur, lang)}</td></tr>`).join('');

  return `<div class="head">${companyBlock(settings, lang)}
      <div class="r"><h1>${e(t(isQuote ? 'docs.quote' : 'docs.invoice'))}</h1>
        ${invoice.number ? `<div>${e(t('docs.invoiceNo'))}: <strong>${e(invoice.number)}</strong></div>` : ''}
        <div>${e(t('docs.date'))}: ${day(invoice.issued_at ?? new Date().toISOString(), lang)}</div>
        ${invoice.due_date ? `<div>${e(t('docs.dueDate'))}: ${day(invoice.due_date, lang)}</div>` : ''}</div></div>
    <div><strong>${e(t('docs.billTo'))}</strong><br>${e(invoice.client_name ?? project.client_name ?? '')}
      ${invoice.client_address ? `<br>${lines2br(invoice.client_address)}` : ''}</div>
    <p class="small">${e(t('docs.project'))}: ${e(project.title)}</p>
    <table><thead><tr><th>${e(t('docs.description'))}</th><th class="r">${e(t('docs.qty'))}</th><th>${e(t('docs.unit'))}</th>
      <th class="r">${e(t('docs.unitPrice'))}</th><th class="r">${e(t('docs.amount'))}</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="totals"><tbody>
      <tr><td>${e(t('docs.subtotal'))}</td><td class="r">${money(tot.subtotal, cur, lang)}</td></tr>
      ${invoice.vat_pct > 0 ? `<tr><td>${e(t('docs.vat', { pct: invoice.vat_pct }))}</td><td class="r">${money(tot.vat, cur, lang)}</td></tr>` : ''}
      <tr class="grand"><td>${e(t('docs.total'))}</td><td class="r">${money(tot.total, cur, lang)}</td></tr>
      ${invoice.advance_paid > 0 ? `<tr><td>${e(t('docs.advancePaid'))}</td><td class="r">${money(invoice.advance_paid, cur, lang)}</td></tr>
      <tr class="grand"><td>${e(t('docs.balanceDue'))}</td><td class="r">${money(tot.balance, cur, lang)}</td></tr>` : ''}
    </tbody></table>
    ${settings.payment_terms?.trim() ? `<p class="small"><strong>${e(t('docs.paymentTerms'))}</strong><br>${lines2br(settings.payment_terms)}</p>` : ''}
    ${settings.company_bank_account ? `<p class="small"><strong>${e(t('docs.paymentDetails'))}</strong><br>${lines2br(settings.company_bank_account)}</p>` : ''}
    ${invoice.notes ? `<p class="small"><strong>${e(t('docs.notes'))}</strong><br>${lines2br(invoice.notes)}</p>` : ''}`;
}

interface InternalArgs {
  project: Project;
  internal: InternalInvoice;
  settings: Settings;
  lang: Lang;
  /** the project's logs and the inventory: the consumables checklist is built from them */
  logs?: LogRow[];
  items?: InventoryItem[];
}

/** Consumables (welding wire and gas, discs, paint) taken out of stock on this project, with the quantity. */
export function consumablesUsed(logs: LogRow[], items: InventoryItem[]): { name: string; qty: number; unit: string }[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = new Map<string, { name: string; qty: number; unit: string }>();
  for (const l of logs) {
    if ((l.log_category !== 'WELD' && l.log_category !== 'CONSUMABLE') || l.qty_delta >= 0 || !l.inventory_id) continue;
    const it = byId.get(l.inventory_id);
    if (!it) continue;
    const row = out.get(it.id) ?? { name: it.name, qty: 0, unit: it.unit_label };
    row.qty += -l.qty_delta;
    out.set(it.id, row);
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The workshop job sheet that helpers work from on the shop floor: title, client, workshop notes, cut
 * list, required materials with the stock left, a consumables checklist and the hours so far.
 * STRICTLY no prices, hourly rates, costs or margins. Quantities follow the chosen measuring system.
 */
export function internalInvoiceHtml({ project, internal, settings, lang, logs = [], items = [] }: InternalArgs): string {
  const t = (k: MessageKey, p?: Record<string, string | number>) => translate(lang, k, p);
  const qtyText = (n: number, unit: string) => {
    const s = convertQty(n, unit);
    return `${num(s.value, lang)} ${e(unitName(s.unit, lang))}`;
  };
  const hours = internal.hoursByDay.map((d) => `<tr><td>${day(d.date, lang)}</td><td class="r">${num(d.hours, lang)}</td></tr>`).join('');
  const mats = internal.materials.map((m) =>
    `<tr><td>${e(m.name)}</td><td class="r">${qtyText(m.used, m.unit)}</td>
     <td class="r">${qtyText(m.stockNow, m.unit)}${m.low ? ` (${e(t('docs.low'))})` : ''}</td></tr>`).join('');
  const cuts = (project.cut_list ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const checklist = consumablesUsed(logs, items).map((c) =>
    `<tr><td style="width:9mm;font-size:14pt;white-space:nowrap">&#9744;</td><td>${e(c.name)}</td><td class="r">${qtyText(c.qty, c.unit)}</td></tr>`).join('');
  const notes = (project.workshop_notes ?? '').trim();

  return `<div class="notice">${e(t('docs.internal.title'))}: ${e(t('docs.internal.notice'))}</div>
    <div class="head">${companyBlock(settings, lang)}
      <div class="r"><h1>${e(t('docs.internal.title'))}</h1><div>${e(t('docs.project'))}: <strong>${e(project.title)}</strong></div>
        <div>${e(t('docs.client'))}: ${e(project.client_name ?? '')}</div><div>${e(t('docs.date'))}: ${day(new Date().toISOString(), lang)}</div></div></div>

    <h2>${e(t('docs.workshopNotes'))}</h2>
    ${notes ? `<p>${lines2br(notes)}</p>` : `<p>${e(t('docs.noNotes'))}</p>`}

    <h2>${e(t('docs.cutList'))}</h2>
    ${cuts.length ? `<table><tbody>${cuts.map((c, i) => `<tr><td style="width:9mm;font-size:14pt;white-space:nowrap">${i + 1}.</td><td>${e(c)}</td></tr>`).join('')}</tbody></table>` : `<p>${e(t('docs.noCutList'))}</p>`}

    <h2>${e(t('docs.requiredMaterials'))}</h2>
    ${internal.materials.length
      ? `<table><thead><tr><th>${e(t('docs.item'))}</th><th class="r">${e(t('docs.used'))}</th><th class="r">${e(t('docs.stockLeft'))}</th></tr></thead><tbody>${mats}</tbody></table>`
      : `<p>${e(t('docs.noMaterials'))}</p>`}

    <h2>${e(t('docs.consumablesChecklist'))}</h2>
    ${checklist ? `<table><tbody>${checklist}</tbody></table>` : `<p>${e(t('docs.noConsumables'))}</p>`}

    <h2>${e(t('docs.hoursSoFar'))}</h2>
    ${internal.hoursByDay.length
      ? `<table><thead><tr><th>${e(t('docs.date'))}</th><th class="r">${e(t('docs.hours'))}</th></tr></thead><tbody>${hours}
         <tr class="grand"><td>${e(t('docs.totalHours'))}</td><td class="r">${num(internal.hoursTotal, lang)}</td></tr></tbody></table>`
      : `<p>${e(t('docs.noHours'))}</p>`}`;
}
