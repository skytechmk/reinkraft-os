import { useEffect, useRef, useState } from 'react';
import { friendlyError, useInvoiceActions, useInvoices } from './api';
import { InvoiceEditor } from './InvoiceEditor';
import { useI18n } from '../../i18n';
import type { InventoryItem, InvoiceLang, Project, Settings } from '../../lib/types';
import { btn, btnPrimary, chip } from '../../ui';

interface Props {
  project: Project;
  settings: Settings;
  items: InventoryItem[];
  /** open on this document (for example one that was just created empty) */
  initialInvoiceId?: string;
  onClose: () => void;
}

/** Edit the client's quote or invoice for one project. Nothing here touches inventory or the internal records. */
export function ExternalInvoiceDialog({ project, settings, items, initialInvoiceId, onClose }: Props) {
  const { t, lang } = useI18n();
  const invoices = useInvoices();
  const act = useInvoiceActions();
  const mine = (invoices.data ?? []).filter((i) => i.project_id === project.id);   // newest first
  const [activeId, setActiveId] = useState<string | null>(initialInvoiceId ?? null);
  const [newLang, setNewLang] = useState<InvoiceLang>(lang);
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const active = mine.find((i) => i.id === activeId) ?? mine.find((i) => i.status !== 'VOID') ?? mine[0] ?? null;

  // modal behaviour: focus moves in, Esc closes, the page behind does not scroll, focus returns on close
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [onClose]);

  const create = async () => {
    const r = await act.create(project.id, newLang);
    if (r.error) { const k = friendlyError(r.error); return setError(k ? t(k) : r.error); }
    setError('');
    if (r.invoice) setActiveId(r.invoice.id);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t('invoices.dialog.title')} className="mx-auto min-h-full max-w-3xl bg-ink sm:min-h-0 sm:rounded-[3px] sm:shadow-[inset_0_0_0_1px_var(--color-rule)]">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-rule bg-deck px-4 py-2">
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-extrabold">{t('invoices.dialog.title')}</h2>
            <p className="truncate text-sm text-mute">{project.title}</p>
          </div>
          <button ref={closeRef} className={btn} onClick={onClose}>{t('common.close')}</button>
        </div>

        <div className="p-4">
          <p className="mb-3 text-sm text-mute">{t('invoices.dialog.hint')}</p>

          {mine.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-sm text-mute">{t('invoices.dialog.documents')}</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('invoices.dialog.documents')}>
                {mine.map((i) => (
                  <button key={i.id} className={chip} data-on={active?.id === i.id} aria-pressed={active?.id === i.id} onClick={() => setActiveId(i.id)}>
                    {i.number ?? t('invoices.draftLabel')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {active ? (
            <>
              <InvoiceEditor key={active.id} invoice={active} project={project} settings={settings} items={items} onDeleted={() => setActiveId(null)} />
              <button className={`${btn} mt-1 w-full`} onClick={() => void create()}>{t('invoices.dialog.another')}</button>
            </>
          ) : (
            <div className="rounded-[3px] border border-dashed border-rule p-6">
              <p className="mb-3 font-semibold">{t('invoices.dialog.none')}</p>
              <p className="mb-1 text-sm text-mute">{t('invoices.new.language')}</p>
              <div className="mb-3 grid max-w-sm grid-cols-2 gap-2" role="group" aria-label={t('invoices.new.language')}>
                {(['en', 'mk'] as const).map((l) => (
                  <button key={l} className={chip} data-on={newLang === l} aria-pressed={newLang === l} onClick={() => setNewLang(l)}>{l === 'en' ? 'English' : 'Македонски'}</button>
                ))}
              </div>
              <button className={`${btnPrimary} max-w-sm w-full`} onClick={() => void create()}>{t('invoices.new.create')}</button>
              <p className="mt-3 text-sm text-mute">{t('invoices.new.hint')}</p>
            </div>
          )}
          {active && active.status === 'DRAFT' && (mine.length > 0) && initialInvoiceId === active.id && (
            <p className="mt-3 text-sm text-signal">{t('invoices.dialog.emptyNote')}</p>
          )}
          {error && <p className="mt-3 text-sm text-crit" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  );
}
