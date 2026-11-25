import { useCallback, useEffect, useState } from 'react';
import { flush, outbox, type QueuedOp } from '../lib/offlineQueue';
import { useI18n, type MessageKey } from '../i18n';
import { btn, btnDanger, card } from '../ui';

const LABELS: Record<QueuedOp['rpc'], MessageKey> = {
  log_project_activity: 'shell.outbox.op.activity',
  log_weld: 'shell.outbox.op.weld',
  return_remnant: 'shell.outbox.op.remnant',
  undo_project_log: 'shell.outbox.op.undo',
  record_purchase: 'shell.outbox.op.purchase',
};

/** Shows queued and rejected writes. Rejected ops stay until the user retries or dismisses them. */
export function OutboxBanner() {
  const { t } = useI18n();
  const [ops, setOps] = useState<QueuedOp[]>([]);

  const refresh = useCallback(() => void outbox.all().then(setOps), []);

  useEffect(() => {
    refresh();
    window.addEventListener('outbox-changed', refresh);
    return () => window.removeEventListener('outbox-changed', refresh);
  }, [refresh]);

  const pending = ops.filter((o) => o.status === 'pending').length;
  const failed = ops.filter((o) => o.status === 'failed');
  if (!pending && !failed.length) return null;

  return (
    <section className={card} aria-live="polite">
      {pending > 0 && <p className="text-sm">{t('shell.outbox.waiting', { n: pending })}</p>}
      {failed.map((o) => (
        <div key={o.id} className="mt-2">
          <p className="text-sm text-crit">
            {t('shell.outbox.rejected', { label: t(LABELS[o.rpc]), error: o.error ?? '' })}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              className={btn}
              onClick={async () => {
                await outbox.put({ ...o, status: 'pending', error: undefined });
                void flush();
              }}
            >
              {t('shell.outbox.retry')}
            </button>
            <button
              className={btnDanger}
              onClick={async () => {
                await outbox.remove(o.id);
                window.dispatchEvent(new Event('outbox-changed'));
              }}
            >
              {t('shell.outbox.dismiss')}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
