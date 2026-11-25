import { describe, expect, it } from 'vitest';
import { daysUntil, dueLabel } from './dates';

const now = new Date('2026-11-24T15:30:00');

describe('due dates', () => {
  it('counts whole days regardless of the time of day', () => {
    expect(daysUntil('2026-11-30', now)).toBe(6);
    expect(daysUntil('2026-11-24', now)).toBe(0);
    expect(daysUntil('2026-11-20', now)).toBe(-4);
  });
  it('flags overdue and imminent work', () => {
    expect(dueLabel('2026-11-20', now)).toEqual({ key: 'due.overdue', n: 4, tone: 'crit' });
    expect(dueLabel('2026-11-24', now)).toEqual({ key: 'due.today', n: 0, tone: 'crit' });
    expect(dueLabel('2026-11-26', now)).toEqual({ key: 'due.in', n: 2, tone: 'signal' });
    expect(dueLabel('2026-12-10', now)?.tone).toBe('mute');
    expect(dueLabel(null, now)).toBeNull();
  });
});
