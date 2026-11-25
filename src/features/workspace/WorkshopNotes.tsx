import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../lib/types';
import { dueLabel } from '../../domain/dates';
import { Plate } from '../../components/Plate';
import { input, label } from '../../ui';
import { useProjectUpdate } from './useProjectUpdate';
import { PinnedWarnings, ProjectNotes } from './ProjectNotes';
import { useNotes } from '../../lib/api';
import { useI18n } from '../../i18n';

const TONE = { crit: 'text-crit', signal: 'text-signal', mute: 'text-mute' } as const;

/** Deadline, workshop notes, cut list and warnings of one project, all editable in place. */
export function WorkshopNotes({ project }: { project: Project }) {
  const { t } = useI18n();
  const update = useProjectUpdate();
  const notes = useNotes(project.id);
  const [warnOpen, setWarnOpen] = useState(false);
  const [dueError, setDueError] = useState('');
  const due = dueLabel(project.due_date);
  const warnCount = (notes.data ?? []).length;

  return (
    <Plate title={t('workbench.notesTitle')}>
      <PinnedWarnings projectId={project.id} />
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div>
          <label className={label} htmlFor="wn-due">{t('workbench.deadline')}</label>
          <input id="wn-due" type="date" className={`${input} mt-1`} value={project.due_date ?? ''}
            onChange={async (e) => setDueError((await update(project.id, { due_date: e.target.value || null })) ?? '')} />
          {due && <p className={`mt-1 text-sm ${TONE[due.tone]}`}>{t(due.key, { n: due.n })}</p>}
          {dueError && <p className="mt-1 text-sm text-crit" role="alert">{t('workbench.saveFailed', { error: dueError })}</p>}
        </div>
        <NoteField key={`${project.id}-n`} id="wn-notes" project={project} field="workshop_notes" title={t('workbench.workshopNotes')} placeholder={t('workbench.workshopNotesPlaceholder')} rows={4} />
      </div>
      <div className="mt-4">
        <NoteField key={`${project.id}-c`} id="wn-cut" project={project} field="cut_list" title={t('workbench.cutList')} placeholder={t('workbench.cutListPlaceholder')} rows={4} mono />
      </div>

      <div className="mt-4 border-t border-rule pt-2">
        <button type="button" className="flex min-h-[48px] w-full items-center justify-between text-left font-semibold" aria-expanded={warnOpen} aria-controls="wn-warnings" onClick={() => setWarnOpen((v) => !v)}>
          <span>{t('workbench.warningsCount', { n: warnCount })}</span>
          <span className="text-mute">{warnOpen ? '▴' : '▾'}</span>
        </button>
        {warnOpen && <div id="wn-warnings" className="pt-2"><ProjectNotes projectId={project.id} /></div>}
      </div>
    </Plate>
  );
}

type Field = 'workshop_notes' | 'cut_list';

/** A textarea saved on blur. Text typed while a refetch lands is never overwritten. */
function NoteField({ id, project, field, title, placeholder, rows, mono }: { id: string; project: Project; field: Field; title: string; placeholder: string; rows: number; mono?: boolean }) {
  const { t } = useI18n();
  const update = useProjectUpdate();
  const server = project[field] ?? '';
  const [value, setValue] = useState(server);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const dirty = useRef(false);          // the user has typed something that is not saved yet
  const latest = useRef(value);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // follow the server (another device, a refetch) only while nothing of ours is waiting to be saved
  useEffect(() => {
    if (!dirty.current) { setValue(server); latest.current = server; }
  }, [server]);

  const onChange = (v: string) => { dirty.current = true; latest.current = v; setValue(v); setState('idle'); };
  const onBlur = async () => {
    if (!dirty.current) return;
    const sent = latest.current;
    if (sent === server) { dirty.current = false; return; }
    setState('saving');
    const err = await update(project.id, { [field]: sent.trim() ? sent : null });
    if (err) { setError(err); setState('error'); return; }       // stays dirty: the text is kept and can be retried
    dirty.current = latest.current !== sent;                       // typing resumed while saving
    setState('saved');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2500);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className={label} htmlFor={id}>{title}</label>
        <span className="min-h-[1.25rem] text-sm" aria-live="polite">
          {state === 'saving' && <span className="text-mute">{t('workbench.saving')}</span>}
          {state === 'saved' && <span className="text-ok">{t('workbench.saved')}</span>}
        </span>
      </div>
      <textarea id={id} rows={rows} className={`${input} mt-1 py-2 ${mono ? 'font-mono' : ''}`} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} onBlur={() => void onBlur()} />
      {state === 'error' && <p className="mt-1 text-sm text-crit" role="alert">{t('workbench.saveFailed', { error })}</p>}
    </div>
  );
}
