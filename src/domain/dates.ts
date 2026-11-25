export type Tone = 'crit' | 'signal' | 'mute';
export type DueKey = 'due.overdue' | 'due.today' | 'due.in';

/** Whole days from today to a YYYY-MM-DD date (negative when past). */
export function daysUntil(date: string, now: Date = new Date()): number {
  const target = new Date(`${date}T00:00:00`);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Due-date status as a message key plus days. Render with t(label.key, { n: label.n }). */
export function dueLabel(date: string | null, now: Date = new Date()): { key: DueKey; n: number; tone: Tone } | null {
  if (!date) return null;
  const d = daysUntil(date, now);
  if (d < 0) return { key: 'due.overdue', n: -d, tone: 'crit' };
  if (d === 0) return { key: 'due.today', n: 0, tone: 'crit' };
  if (d <= 3) return { key: 'due.in', n: d, tone: 'signal' };
  return { key: 'due.in', n: d, tone: 'mute' };
}
