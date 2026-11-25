import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { outbox } from '../lib/offlineQueue';

/** Shows connection state and how many changes are waiting to sync. */
export function SyncPill() {
  const { t } = useI18n();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);

  const refresh = useCallback(() => void outbox.all().then((ops) => setPending(ops.filter((o) => o.status === 'pending').length)), []);

  useEffect(() => {
    refresh();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('outbox-changed', refresh);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('outbox-changed', refresh);
    };
  }, [refresh]);

  return (
    <span className="inline-flex min-h-[32px] items-center gap-2 rounded-[3px] bg-deck px-3 text-sm shadow-[inset_0_0_0_1px_var(--color-rule)]" role="status">
      <span className={`h-2 w-2 rounded-full ${online ? 'bg-ok' : 'bg-signal'}`} aria-hidden="true" />
      {online ? t('shell.sync.online') : t('shell.sync.offline')}
      {pending > 0 && <span className="text-signal">{t('shell.sync.queued', { n: pending })}</span>}
    </span>
  );
}
