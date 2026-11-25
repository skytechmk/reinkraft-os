import { useState } from 'react';
import type { Project } from '../../lib/types';
import { chip, label } from '../../ui';
import { useProjectUpdate } from './useProjectUpdate';
import { useI18n, type MessageKey } from '../../i18n';

const STATUSES: Project['status'][] = ['QUOTE', 'ACTIVE', 'FINISHED'];
const NOTES: { value: string; key: MessageKey }[] = [
  { value: 'In production', key: 'workbench.noteInProduction' },
  { value: 'Waiting for material', key: 'workbench.noteWaitingMaterial' },
  { value: 'Needs cutting', key: 'workbench.noteNeedsCutting' },
  { value: 'Ready for pickup', key: 'workbench.noteReadyPickup' },
];
const STATUS_KEY: Record<Project['status'], MessageKey> = { QUOTE: 'workbench.statusQuote', ACTIVE: 'workbench.statusActive', FINISHED: 'workbench.statusFinished' };

/** Project title, status and the one-tap status note. The due date lives in the workshop notes box. */
export function ProjectHeader({ project }: { project: Project }) {
  const { t } = useI18n();
  const update = useProjectUpdate();
  const [error, setError] = useState('');
  const save = async (patch: Partial<Project>) => setError((await update(project.id, patch)) ?? '');

  return (
    <section className="mb-3 rounded-[3px] bg-plate p-4 shadow-[inset_0_0_0_1px_var(--color-rule)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-4xl font-black leading-none text-signal sm:text-5xl">{project.title}</h2>
          <p className="mt-2 text-mute">{project.client_name ?? t('workbench.noClient')}</p>
        </div>
        <div className="grid grid-cols-3 gap-1" role="group" aria-label={t('workbench.projectStatus')}>
          {STATUSES.map((s) => (
            <button key={s} className={chip} data-on={project.status === s} aria-pressed={project.status === s} onClick={() => void save({ status: s })}>
              {t(STATUS_KEY[s])}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className={label}>{t('workbench.whereNow')}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {NOTES.map((n) => (
            <button key={n.value} className={chip} data-on={project.status_note === n.value} aria-pressed={project.status_note === n.value} onClick={() => void save({ status_note: project.status_note === n.value ? null : n.value })}>
              {t(n.key)}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-crit" role="alert">{error}</p>}
    </section>
  );
}
