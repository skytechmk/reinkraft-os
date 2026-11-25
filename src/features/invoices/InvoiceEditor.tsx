import { useEffect, useMemo, useState } from 'react';
import { useInvoiceActions, useInvoiceLines, friendlyError } from './api';
import { printExternalInvoice } from './print';
import { categoryFor } from '../../domain/categories';
import { invoiceTotals, lineTotal, markupPrice, round4, scaleFactor, stepForUnit, type DraftLine } from '../../domain/invoice';
import { fmtMoney, fmtNum, stepFor } from '../../domain/units';
import { translate, unitName, useI18n, type MessageKey } from '../../i18n';
import type { InventoryItem, Invoice, InvoiceLang, InvoiceLine, InvoiceStatus, Project, Settings } from '../../lib/types';
import { Plate } from '../../components/Plate';
import { Stepper } from '../../components/Stepper';
import { btn, btnDanger, btnPrimary, chip, input, label } from '../../ui';

const VAT_PRESETS = [0, 18] as const;

const STATUS_KEY: Record<InvoiceStatus, MessageKey> = {
  DRAFT: 'invoices.status.DRAFT', ISSUED: 'invoices.status.ISSUED', PAID: 'invoices.status.PAID', VOID: 'invoices.status.VOID',
};
const STATUS_TONE: Record<InvoiceStatus, string> = { DRAFT: 'bg-raised', ISSUED: 'bg-signal text-ink', PAID: 'bg-ok text-ink', VOID: 'bg-crit' };

interface Props {
  invoice: Invoice;
  project: Project | undefined;
  settings: Settings;
  items: InventoryItem[];
  onDeleted: () => void;
}

/** Edit the client's invoice. Nothing here can change inventory or the internal records. */
export function InvoiceEditor({ invoice, project, settings, items, onDeleted }: Props) {
  const { t, lang } = useI18n();
  const linesQ = useInvoiceLines(invoice.id);
  const act = useInvoiceActions();
  const [error, setError] = useState('');
  // 0 % and 18 % are presets; any other rate shows the custom stepper
  const [customVat, setCustomVat] = useState(!(VAT_PRESETS as readonly number[]).includes(invoice.vat_pct));
  const locked = invoice.status !== 'DRAFT';
  const lines = useMemo(() => linesQ.data ?? [], [linesQ.data]);
  const tot = invoiceTotals(lines, invoice.vat_pct, invoice.advance_paid);
  const cur = invoice.currency;

  const show = (msg: string | null) => {
    if (!msg) return setError('');
    const key = friendlyError(msg);
    setError(key ? t(key) : msg);
  };
  const run = async (p: Promise<string | null>) => show(await p);
  const confirm = (key: MessageKey) => window.confirm(t(key));

  const nextPosition = () => (lines.length ? Math.max(...lines.map((l) => l.position)) + 1 : 0);
  const add = (line: DraftLine) => run(act.addLine(invoice.id, settings.company_id, line, nextPosition()));
  const docLang: InvoiceLang = invoice.language;
  const doc = (k: MessageKey) => translate(docLang, k);

  const addHours = () => add({ line_type: 'LABOR', description: doc('invoices.lines.hoursName'), qty: 1, unit: docLang === 'mk' ? 'ч' : 'h', unit_price: settings.hourly_labor_rate, source_inventory_id: null });
  const addCustom = () => add({ line_type: 'CUSTOM', description: doc('invoices.lines.customName'), qty: 1, unit: docLang === 'mk' ? 'ком' : 'pcs', unit_price: 0, source_inventory_id: null });
  const addItem = (id: string) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    const type = categoryFor(it);
    void add({ line_type: type, description: it.name, qty: stepFor(it.unit_label), unit: unitName(it.unit_label, docLang), unit_price: it.last_buy_price, source_inventory_id: it.id });
  };

  const repriceAll = (price: (p: number) => number) =>
    run(Promise.all(lines.map((l) => act.updateLine(invoice.id, l.id, { unit_price: round4(price(l.unit_price)) }))).then((r) => r.find(Boolean) ?? null));
  const matchProject = () => {
    const f = scaleFactor(lines, project?.quoted_price ?? 0);
    if (f) void repriceAll((p) => p * f);
  };

  const printIt = () => project && printExternalInvoice({ invoice, lines, project, settings });

  return (
    <div>
      <p className="mb-3 rounded-[3px] bg-deck p-3 text-sm text-mute shadow-[inset_0_0_0_1px_var(--color-rule)]">{t('invoices.editor.safe')}</p>

      <Plate
        title={invoice.number ?? t('invoices.draftLabel')}
        right={<span className={`rounded-[2px] px-2 py-0.5 text-sm font-bold ${STATUS_TONE[invoice.status]}`}>{t(STATUS_KEY[invoice.status])}</span>}
      >
        {locked && <p className="mb-3 text-sm text-signal">{t('invoices.editor.locked', { status: t(STATUS_KEY[invoice.status]) })}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          <TextField key={`c-${invoice.id}`} label={t('invoices.field.client')} value={invoice.client_name ?? ''} disabled={locked} onCommit={(v) => run(act.update(invoice.id, { client_name: v || null }))} />
          <TextField key={`d-${invoice.id}`} label={t('invoices.field.address')} value={invoice.client_address ?? ''} disabled={locked} onCommit={(v) => run(act.update(invoice.id, { client_address: v || null }))} />
          <div>
            <label className={label} htmlFor="inv-due">{t('invoices.field.dueDate')}</label>
            <input id="inv-due" type="date" className={`${input} mt-1`} value={invoice.due_date ?? ''} disabled={locked} onChange={(e) => void run(act.update(invoice.id, { due_date: e.target.value || null }))} />
          </div>
          <TextField key={`n-${invoice.id}`} label={t('invoices.field.notes')} value={invoice.notes ?? ''} disabled={locked} onCommit={(v) => run(act.update(invoice.id, { notes: v || null }))} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className={label}>{t('invoices.field.vat')}</p>
            <div className="mt-1 grid grid-cols-3 gap-2" role="group" aria-label={t('invoices.field.vat')}>
              {VAT_PRESETS.map((v) => (
                <button key={v} className={chip} data-on={!customVat && invoice.vat_pct === v} aria-pressed={!customVat && invoice.vat_pct === v} disabled={locked}
                  onClick={() => { setCustomVat(false); void run(act.update(invoice.id, { vat_pct: v })); }}>{v}%</button>
              ))}
              <button className={chip} data-on={customVat} aria-pressed={customVat} disabled={locked} onClick={() => setCustomVat(true)}>{t('invoices.vat.custom')}</button>
            </div>
            {customVat && (
              <div className="mt-2" role="group" aria-label={t('invoices.vat.customLabel')}>
                <Stepper value={invoice.vat_pct} step={1} min={0} max={100} unit="%" disabled={locked} onChange={(v) => void run(act.update(invoice.id, { vat_pct: v }))} />
              </div>
            )}
          </div>
          <div>
            <p className={label}>{t('invoices.field.language')}</p>
            <div className="mt-1 grid grid-cols-2 gap-2" role="group" aria-label={t('invoices.field.language')}>
              {(['en', 'mk'] as const).map((l) => (
                <button key={l} className={chip} data-on={invoice.language === l} aria-pressed={invoice.language === l} disabled={locked} onClick={() => void run(act.update(invoice.id, { language: l }))}>{l === 'en' ? 'English' : 'Македонски'}</button>
              ))}
            </div>
          </div>
        </div>
        <p className={`${label} mb-1 mt-4`}>{t('invoices.field.advance')}</p>
        <Stepper value={invoice.advance_paid} step={cur === 'MKD' ? 500 : 50} disabled={locked} onChange={(v) => void run(act.update(invoice.id, { advance_paid: v }))} unit={cur} />
      </Plate>

      <Plate title={t('invoices.lines.title')} flush>
        <ul>
          {lines.map((l) => (
            <LineRow key={l.id} line={l} locked={locked} currency={cur}
              onPatch={(patch) => run(act.updateLine(invoice.id, l.id, patch))}
              onRemove={() => run(act.removeLine(invoice.id, l.id))} />
          ))}
          {!lines.length && <li className="p-4 text-sm text-mute">{t('invoices.lines.empty')}</li>}
        </ul>
        {!locked && (
          <div className="grid gap-2 border-t border-rule p-4 sm:grid-cols-[auto_auto_1fr]">
            <button className={btn} onClick={() => void addHours()}>{t('invoices.lines.addHours')}</button>
            <button className={btn} onClick={() => void addCustom()}>{t('invoices.lines.addCustom')}</button>
            <select className={input} aria-label={t('invoices.lines.addFromInventory')} value="" onChange={(e) => e.target.value && addItem(e.target.value)}>
              <option value="">{t('invoices.lines.addFromInventory')}</option>
              {items.filter((i) => !i.is_remnant).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        )}
      </Plate>

      {!locked && (
        <Plate title={t('invoices.tools.title')}>
          <p className="mb-2 text-sm text-mute">{t('invoices.tools.markup')}</p>
          <div className="mb-4 grid grid-cols-4 gap-2">
            {[5, 10, 20, 30].map((p) => (
              <button key={p} className={btn} disabled={!lines.length} onClick={() => void repriceAll((x) => markupPrice(x, p))}>+{p}%</button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button className={btn} disabled={!project?.quoted_price || !lines.length} onClick={matchProject}>
              {t('invoices.tools.match', { price: fmtMoney(project?.quoted_price ?? 0, cur) })}
            </button>
            <button className={btn} onClick={() => confirm('invoices.tools.resetConfirm') && void run(act.reset(invoice.id))}>{t('invoices.tools.reset')}</button>
          </div>
        </Plate>
      )}

      <Plate title={t('invoices.totals.title')}>
        <Row name={t('invoices.totals.subtotal')} value={fmtMoney(tot.subtotal, cur)} />
        {invoice.vat_pct > 0 && <Row name={t('invoices.totals.vat', { pct: invoice.vat_pct })} value={fmtMoney(tot.vat, cur)} />}
        <Row name={t('invoices.totals.total')} value={fmtMoney(tot.total, cur)} strong />
        {invoice.advance_paid > 0 && <Row name={t('invoices.totals.advance')} value={fmtMoney(invoice.advance_paid, cur)} />}
        <Row name={t('invoices.totals.balance')} value={fmtMoney(tot.balance, cur)} strong />
        {error && <p className="mt-3 text-sm text-crit" role="alert">{error}</p>}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button className={btn} onClick={printIt} disabled={!project || !lines.length}>{t('invoices.actions.print')}</button>
          {invoice.status === 'DRAFT' && <button className={btnPrimary} disabled={!lines.length} onClick={() => confirm('invoices.actions.issueConfirm') && void run(act.issue(invoice.id))}>{t('invoices.actions.issue')}</button>}
          {invoice.status === 'ISSUED' && <button className={btnPrimary} onClick={() => void run(act.setStatus(invoice.id, 'PAID'))}>{t('invoices.actions.markPaid')}</button>}
          {invoice.status === 'PAID' && <button className={btn} onClick={() => void run(act.setStatus(invoice.id, 'ISSUED'))}>{t('invoices.actions.markUnpaid')}</button>}
          {invoice.status === 'ISSUED' && <button className={btnDanger} onClick={() => confirm('invoices.actions.voidConfirm') && void run(act.setStatus(invoice.id, 'VOID'))}>{t('invoices.actions.void')}</button>}
          {invoice.status === 'DRAFT' && (
            <button className={btnDanger} onClick={async () => { if (confirm('invoices.actions.deleteConfirm')) { const e = await act.deleteDraft(invoice.id); if (e) show(e); else onDeleted(); } }}>
              {t('invoices.actions.delete')}
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-mute">{t('invoices.actions.printHint', { lang: lang === 'mk' ? 'МК' : 'EN' })}</p>
      </Plate>
    </div>
  );
}

function Row({ name, value, strong }: { name: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 border-b border-rule py-2 last:border-0 ${strong ? 'text-lg font-bold' : 'text-bone/80'}`}>
      <span>{name}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

/** Text field that saves when you leave it, so one edit is one request. */
function TextField({ label: text, value, disabled, onCommit }: { label: string; value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const id = `tf-${text}`;
  return (
    <div>
      <label className={label} htmlFor={id}>{text}</label>
      <input id={id} className={`${input} mt-1`} value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v.trim())} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </div>
  );
}

function PriceInput({ value, disabled, onCommit, ariaLabel }: { value: number; disabled: boolean; onCommit: (v: number) => void; ariaLabel: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(n) && n >= 0) { if (n !== value) onCommit(round4(n)); } else setText(String(value));
  };
  return <input inputMode="decimal" aria-label={ariaLabel} className={`${input} w-32 text-right`} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />;
}

function LineRow({ line, locked, currency, onPatch, onRemove }: { line: InvoiceLine; locked: boolean; currency: string; onPatch: (p: Partial<Pick<InvoiceLine, 'description' | 'qty' | 'unit' | 'unit_price'>>) => void; onRemove: () => void }) {
  const { t } = useI18n();
  const step = stepForUnit(line.unit);
  return (
    <li className="border-b border-rule p-3 last:border-0">
      <div className="flex gap-2">
        <TextField key={line.id} label={t('invoices.lines.description')} value={line.description} disabled={locked} onCommit={(v) => v && onPatch({ description: v })} />
        {!locked && <button className={`${btnDanger} mt-7 shrink-0`} onClick={onRemove} aria-label={t('invoices.lines.remove')}>✕</button>}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2" role="group" aria-label={t('invoices.lines.qty')}>
          <button className={`${btn} min-w-[48px] text-xl`} disabled={locked} onClick={() => onPatch({ qty: Math.max(0, Math.round((line.qty - step) * 1000) / 1000) })} aria-label={t('invoices.lines.less')}>−</button>
          <output className="num min-w-[84px] text-center text-3xl">{fmtNum(line.qty)}<span className="ml-1 font-sans text-sm font-medium text-mute">{line.unit}</span></output>
          <button className={`${btn} min-w-[48px] text-xl`} disabled={locked} onClick={() => onPatch({ qty: Math.round((line.qty + step) * 1000) / 1000 })} aria-label={t('invoices.lines.more')}>+</button>
        </div>
        <div className="flex items-center gap-2">
          <PriceInput value={line.unit_price} disabled={locked} onCommit={(v) => onPatch({ unit_price: v })} ariaLabel={t('invoices.lines.price')} />
          <span className="num min-w-[110px] text-right text-2xl">{fmtMoney(lineTotal(line), currency)}</span>
        </div>
      </div>
    </li>
  );
}
