import { useState } from 'react';
import { useProjects } from '../../lib/api';
import type { Project } from '../../lib/types';
import { dueLabel } from '../../domain/dates';
import { Plate } from '../../components/Plate';
import { btn } from '../../ui';
import { useI18n } from '../../i18n';

const BAR = { QUOTE: 'bg-slate-500', ACTIVE: 'bg-signal text-ink', FINISHED: 'bg-ok text-ink' } as const;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Month grid of due dates. Tap a project to open it. */
export function CalendarPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const { t, lang } = useI18n();
  const locale = lang === 'mk' ? 'mk-MK' : 'en-GB';
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 1 + i))); // 2024-01-01 is a Monday
  const projects = useProjects();
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });

  const first = new Date(month);
  const lead = (first.getDay() + 6) % 7;                         // Monday-first
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  while (cells.length % 7) cells.push(null);

  const byDay = new Map<string, Project[]>();
  for (const p of projects.data ?? []) if (p.due_date) byDay.set(p.due_date, [...(byDay.get(p.due_date) ?? []), p]);
  const todayKey = ymd(new Date());
  const monthKey = ymd(month).slice(0, 7);
  const upcoming = (projects.data ?? []).filter((p) => p.due_date && p.status !== 'FINISHED').sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string));

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Plate
        title={month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
        right={
          <span className="flex gap-2">
            <button className={`${btn} min-h-[36px]`} aria-label={t('calendar.prev')} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <button className={`${btn} min-h-[36px]`} onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setMonth(d); }}>{t('common.today')}</button>
            <button className={`${btn} min-h-[36px]`} aria-label={t('calendar.next')} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
          </span>
        }
        flush
      >
        <div className="grid grid-cols-7 border-b border-rule text-center text-sm text-mute">
          {weekdays.map((w) => <div key={w} className="py-2">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const key = d ? ymd(d) : '';
            const due = key ? (byDay.get(key) ?? []) : [];
            return (
              <div key={i} className={`min-h-[84px] border-b border-r border-rule p-1 sm:min-h-[104px] ${d ? '' : 'bg-deck/60'}`}>
                {d && (
                  <>
                    <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-[2px] px-1 text-sm ${key === todayKey ? 'bg-signal font-bold text-ink' : 'text-mute'}`}>{d.getDate()}</span>
                    <div className="mt-1 space-y-1">
                      {due.map((p) => (
                        <button key={p.id} onClick={() => onOpen(p.id)} title={p.title}
                          className={`block w-full truncate rounded-[2px] px-1 py-0.5 text-left text-xs font-semibold ${BAR[p.status]}`}>
                          {p.title}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {!(projects.data ?? []).some((p) => p.due_date?.startsWith(monthKey)) && <p className="p-4 text-sm text-mute">{t('calendar.nothingDue')}</p>}
      </Plate>

      <Plate title={t('calendar.comingUp')} flush>
        <ul>
          {upcoming.map((p) => {
            const due = dueLabel(p.due_date);
            return (
              <li key={p.id} className="border-b border-rule last:border-0">
                <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-raised" onClick={() => onOpen(p.id)}>
                  <span className="min-w-0"><span className="block truncate font-semibold">{p.title}</span><span className="text-sm text-mute">{p.due_date}</span></span>
                  {due && <span className={`shrink-0 text-sm ${due.tone === 'crit' ? 'text-crit' : due.tone === 'signal' ? 'text-signal' : 'text-mute'}`}>{t(due.key, { n: due.n })}</span>}
                </button>
              </li>
            );
          })}
          {!upcoming.length && <li className="p-4 text-sm text-mute">{t('calendar.noneOpen')}</li>}
        </ul>
      </Plate>
    </div>
  );
}
