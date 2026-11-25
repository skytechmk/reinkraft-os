import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { usePinnedWarnings, useSettings } from '../../lib/api';
import type { Project } from '../../lib/types';
import { dueLabel } from '../../domain/dates';
import { fmtMoney } from '../../domain/units';
import { Gauge } from '../../components/Gauge';
import { btnPrimary, chip, input, label } from '../../ui';
import { useI18n } from '../../i18n';

interface Props {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const TONE = { crit: 'text-crit', signal: 'text-signal', mute: 'text-mute' } as const;

/** The form that creates a project. Used under "+ NEW PROJECT" and on the first-project card. */
export function NewProjectForm({ onCreated, idPrefix = 'p' }: { onCreated?: (id: string | null) => void; idPrefix?: string }) {
  const { t } = useI18n();
  const settings = useSettings();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [client, setClient] = useState('');
  const [msg, setMsg] = useState('');

  const create = async () => {
    if (!settings.data || !title.trim()) return;
    const { data, error } = await supabase.from('projects').insert({
      company_id: settings.data.company_id, project_type: 'MAIN', status: 'ACTIVE', title: title.trim(), client_name: client.trim() || null,
    }).select('id').single();
    if (error) return setMsg(error.message);
    setTitle('');
    setClient('');
    setMsg(t('workspace.projectCreated'));
    void qc.invalidateQueries({ queryKey: ['projects'] });
    const row = (Array.isArray(data) ? data[0] : data) as { id: string } | null | undefined;
    onCreated?.(row?.id ?? null);
  };

  return (
    <div className="space-y-3">
      <label className={label} htmlFor={`${idPrefix}title`}>{t('workspace.titleLabel')}</label>
      <input id={`${idPrefix}title`} className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className={label} htmlFor={`${idPrefix}client`}>{t('common.client')}</label>
      <input id={`${idPrefix}client`} className={input} value={client} onChange={(e) => setClient(e.target.value)} />
      <button className={`${btnPrimary} w-full`} onClick={create} disabled={!title.trim()}>{t('workspace.createProject')}</button>
      {msg && <p className="text-sm text-mute" role="status">{msg}</p>}
    </div>
  );
}

/** Left column: search, ACTIVE / FINISHED tabs, a scrolling list and "+ NEW PROJECT". */
export function ProjectList({ projects, selectedId, onSelect }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'ACTIVE' | 'FINISHED'>('ACTIVE');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const settings = useSettings();
  const warnings = usePinnedWarnings();
  const cur = settings.data?.currency ?? 'EUR';
  const warned = new Set((warnings.data ?? []).map((w) => w.project_id));

  const isFinished = (p: Project) => p.status === 'FINISHED';
  const shown = projects.filter(
    (p) => (tab === 'FINISHED' ? isFinished(p) : !isFinished(p)) && `${p.title} ${p.client_name ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-[3px] bg-plate shadow-[inset_0_0_0_1px_var(--color-rule)]">
      <header className="flex min-h-[44px] shrink-0 items-center justify-between gap-3 rounded-t-[3px] border-b border-rule bg-deck px-4">
        <h2 className="font-display text-lg font-extrabold tracking-wide">{t('workspace.projects')}</h2>
        <span className="num text-lg">{shown.length}</span>
      </header>
      <div className="shrink-0 space-y-3 p-4 pb-3">
        <input className={input} placeholder={t('workspace.searchProjectsPlaceholder')} aria-label={t('workspace.searchProjects')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <button className={chip} data-on={tab === 'ACTIVE'} aria-pressed={tab === 'ACTIVE'} onClick={() => setTab('ACTIVE')}>{t('workspace.tabActive', { n: projects.filter((p) => !isFinished(p)).length })}</button>
          <button className={chip} data-on={tab === 'FINISHED'} aria-pressed={tab === 'FINISHED'} onClick={() => setTab('FINISHED')}>{t('workspace.tabFinished', { n: projects.filter(isFinished).length })}</button>
        </div>
        <button className={`${btnPrimary} w-full`} aria-expanded={adding} onClick={() => setAdding((v) => !v)}>{t('workspace.newProjectButton')}</button>
        {adding && (
          <div className="rounded-[3px] bg-deck p-3 shadow-[inset_0_0_0_1px_var(--color-rule)]">
            <NewProjectForm idPrefix="list-" onCreated={() => setAdding(false)} />
          </div>
        )}
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
        {shown.map((p) => {
          const due = dueLabel(p.due_date);
          const price = p.quoted_price ?? 0;
          const on = p.id === selectedId;
          return (
            <li key={p.id}>
              <button
                onClick={() => onSelect(p.id)}
                aria-current={on ? 'true' : undefined}
                className={`flex min-h-[48px] w-full overflow-hidden rounded-[3px] text-left transition-colors hover:bg-rule ${on ? 'bg-raised' : 'bg-deck'} shadow-[inset_0_0_0_1px_var(--color-rule)]`}
              >
                <span className={`w-1 shrink-0 ${on ? 'bg-signal' : 'bg-transparent'}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 px-3 py-2">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate font-bold ${on ? 'text-signal' : ''}`}>{p.title}</span>
                    {warned.has(p.id) && <span className="shrink-0 text-signal" title={t('workspace.pinnedWarningTitle')} aria-label={t('workspace.hasPinnedWarning')}>⚠</span>}
                  </span>
                  <span className="block truncate text-sm text-mute">{p.client_name ?? t('workspace.noClient')}{p.status_note ? ` · ${p.status_note}` : ''}</span>
                  {due && <span className={`block text-sm ${TONE[due.tone]}`}>{t(due.key, { n: due.n })}</span>}
                  {price > 0 && (
                    <span className="mt-2 block">
                      <Gauge value={p.advance_paid} max={price} tone="signal" label={t('workspace.advancePaid')} />
                      <span className="mt-1 block text-xs text-mute">{t('workspace.paidOf', { paid: fmtMoney(p.advance_paid, cur), total: fmtMoney(price, cur) })}</span>
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        {!shown.length && <li className="text-sm text-mute">{tab === 'FINISHED' ? t('workspace.noFinished') : t('workspace.noOpen')}</li>}
      </ul>
    </section>
  );
}
