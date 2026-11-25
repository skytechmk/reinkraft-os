import { useRef, useState } from 'react';
import { friendlyError, useInvoiceActions, useInvoices } from '../invoices/api';
import { printInternalSheet, printProjectExternal } from '../invoices/print';
import { ExternalInvoiceDialog } from '../invoices/ExternalInvoiceDialog';
import { useI18n } from '../../i18n';
import type { InventoryItem, Invoice, InvoiceLang, LogRow, Project, Settings } from '../../lib/types';
import { btn, btnPrimary } from '../../ui';

interface Props {
  project: Project;
  settings: Settings;
  items: InventoryItem[];
  logs: LogRow[];
}

/** The two print buttons at the bottom of the right column: gray PRINT INTERNAL, orange EXPORT CLIENT QUOTE. */
export function ProjectPrintBar({ project, settings, items, logs }: Props) {
  const { t, lang } = useI18n();
  const invoices = useInvoices();
  const act = useInvoiceActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ invoiceId?: string } | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  // the invoice a tap just created: the list refetches a moment later, so a quick second tap must not create another
  const justCreated = useRef<Invoice | null>(null);
  const create = async (projectId: string, language: InvoiceLang) => {
    const r = await act.create(projectId, language);
    if (r.invoice) justCreated.current = r.invoice;
    return r;
  };
  const ready = invoices.isSuccess && !invoices.isFetching;

  const printExternal = async () => {
    setError('');
    if (!navigator.onLine) return setError(t('workspace.printNeedsOnline'));
    setBusy(true);
    const known = invoices.data ?? [];
    const withNew = justCreated.current && !known.some((i) => i.id === justCreated.current?.id) ? [justCreated.current, ...known] : known;
    const r = await printProjectExternal({ project, settings, invoices: withNew, language: lang, create });
    setBusy(false);
    if (r.status === 'empty') setDialog({ invoiceId: r.invoiceId });
    if (r.status === 'error') {
      const key = friendlyError(r.message);
      setError(t('workspace.printError', { error: key ? t(key) : r.message }));
    }
  };

  return (
    <>
      <section className="mb-3 space-y-3" aria-label={t('workspace.printTitle')}>
        <div>
          <button className={`${btn} min-h-[56px] w-full text-base`} onClick={() => printInternalSheet({ project, logs, items, settings })}>
            {t('workspace.printInternalLabel')}
          </button>
          <p className="mt-1 text-sm text-mute">{t('workspace.printInternalNote')}</p>
        </div>
        <div>
          <button className={`${btnPrimary} min-h-[56px] w-full text-base`} disabled={busy || !ready} onClick={() => void printExternal()}>
            {busy ? t('workspace.printBusy') : t('workspace.exportQuoteLabel')}
          </button>
          <p className="mt-1 text-sm text-mute">{t('workspace.exportQuoteNote')}</p>
          <button ref={editButton} className="mt-1 min-h-[48px] text-sm font-semibold text-signal underline underline-offset-4" aria-haspopup="dialog" onClick={() => setDialog({})}>
            {t('workspace.editExternal')}
          </button>
        </div>
        {error && <p className="text-sm text-crit" role="alert">{error}</p>}
      </section>
      {dialog && <ExternalInvoiceDialog project={project} settings={settings} items={items} initialInvoiceId={dialog.invoiceId} onClose={() => { setDialog(null); window.setTimeout(() => editButton.current?.focus(), 0); }} />}
    </>
  );
}
