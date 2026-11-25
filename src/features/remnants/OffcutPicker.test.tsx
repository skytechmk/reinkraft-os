import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const enqueue = vi.fn(async (..._a: unknown[]) => ({}));
vi.mock('../../lib/offlineQueue', () => ({ enqueue: (...a: unknown[]) => enqueue(...a) }));
vi.mock('../../lib/supabase', () => ({ newOpId: () => 'op-fixed' }));

const { OffcutPicker } = await import('./OffcutPicker');
const { offcutRange } = await import('./offcut');

describe('offcutRange', () => {
  it('runs from the minimum to the bar length minus 100 mm, starting at 1 m', () => {
    expect(offcutRange(6000, 500)).toEqual({ min: 500, max: 5900, start: 1000 });
  });
  it('clamps the starting length into the range', () => {
    expect(offcutRange(6000, 1500)?.start).toBe(1500);
    expect(offcutRange(900, 500)?.start).toBe(800);
  });
  it('is null when nothing fits', () => {
    expect(offcutRange(500, 500)).toBeNull();
  });
});

describe('OffcutPicker', () => {
  beforeEach(() => enqueue.mockClear());

  it('queues a return_remnant with the chosen length and reports it', () => {
    const onReturned = vi.fn();
    render(<OffcutPicker logId="log1" standardLengthMm={6000} minRemnantMm={500} onReturned={onReturned} onCancel={() => {}} />);
    fireEvent.click(screen.getByLabelText('Longer offcut'));
    fireEvent.click(screen.getByRole('button', { name: /RETURN 1\.1 m/ }));
    expect(enqueue).toHaveBeenCalledWith('return_remnant', { p_client_op_id: 'op-fixed', p_log_id: 'log1', p_length_mm: 1100 });
    expect(onReturned).toHaveBeenCalledWith('log1');
  });

  it('explains when no length is possible and queues nothing', () => {
    render(<OffcutPicker logId="log1" standardLengthMm={500} minRemnantMm={500} onReturned={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
