import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useNotes, useSettings } from '../../lib/api';
import { btn, btnDanger, btnPrimary, chip, input } from '../../ui';
import { useI18n } from '../../i18n';

/** Pinned warnings as an amber banner, so nobody misses them. */
export function PinnedWarnings({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const notes = useNotes(projectId);
  const pinned = (notes.data ?? []).filter((n) => n.is_pinned_warning);
  if (!pinned.length) return null;
  return (
    <div className="mb-3 rounded-[3px] bg-deck shadow-[inset_4px_0_0_var(--color-signal),inset_0_0_0_1px_var(--color-rule)]" role="note" aria-label={t('workbench.pinnedWarning')}>
      <ul className="space-y-1 py-3 pl-6 pr-4">
        {pinned.map((n) => (
          <li key={n.id} className="font-semibold text-signal">⚠ {n.note_text}</li>
        ))}
      </ul>
    </div>
  );
}

/** Add, pin or unpin and delete warnings (rows of project_notes). */
export function ProjectNotes({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const notes = useNotes(projectId);
  const settings = useSettings();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [pin, setPin] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['notes', projectId] });
    void qc.invalidateQueries({ queryKey: ['notes-pinned'] });
  };

  const add = async () => {
    if (!settings.data || !text.trim()) return;
    const { error: err } = await supabase.from('project_notes').insert({
      company_id: settings.data.company_id, project_id: projectId, note_text: text.trim(), is_pinned_warning: pin,
    });
    if (err) return setError(err.message);
    setText('');
    setError('');
    refresh();
  };
  const togglePin = async (id: string, value: boolean) => {
    await supabase.from('project_notes').update({ is_pinned_warning: !value }).eq('id', id);
    refresh();
  };
  const remove = async (id: string) => {
    await supabase.from('project_notes').delete().eq('id', id);
    refresh();
  };

  return (
    <div>
      <ul className="space-y-2">
        {(notes.data ?? []).map((n) => (
          <li key={n.id} className="flex items-center justify-between gap-2 rounded-[3px] bg-deck p-3 shadow-[inset_0_0_0_1px_var(--color-rule)]">
            <span className={n.is_pinned_warning ? 'font-semibold text-signal' : ''}>{n.note_text}</span>
            <span className="flex shrink-0 gap-2">
              <button className={btn} onClick={() => void togglePin(n.id, n.is_pinned_warning)} aria-pressed={n.is_pinned_warning}>{n.is_pinned_warning ? t('workbench.unpin') : t('workbench.pin')}</button>
              <button className={btnDanger} onClick={() => void remove(n.id)} aria-label={t('workbench.deleteNote')}>✕</button>
            </span>
          </li>
        ))}
        {!notes.data?.length && <li className="text-sm text-mute">{t('workbench.noNotes')}</li>}
      </ul>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input className={input} placeholder={t('workbench.addNotePlaceholder')} aria-label={t('workbench.newNote')} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
        <button className={chip} data-on={pin} aria-pressed={pin} onClick={() => setPin((v) => !v)}>{t('workbench.pinAsWarning')}</button>
        <button className={btnPrimary} onClick={() => void add()} disabled={!text.trim()}>{t('workbench.addNote')}</button>
      </div>
      {error && <p className="mt-2 text-sm text-crit" role="alert">{error}</p>}
    </div>
  );
}
