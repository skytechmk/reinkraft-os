import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Project } from '../../lib/types';

const update = vi.fn(async (..._a: unknown[]): Promise<string | null> => null);
vi.mock('./useProjectUpdate', () => ({ useProjectUpdate: () => (...a: unknown[]) => update(...a) }));
vi.mock('../../lib/api', () => ({
  useNotes: () => ({ data: [{ id: 'n1', project_id: 'p', note_text: 'Hot work permit', is_pinned_warning: true }, { id: 'n2', project_id: 'p', note_text: 'Plain note', is_pinned_warning: false }] }),
  useSettings: () => ({ data: { company_id: 'c' } }),
}));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

const { WorkshopNotes } = await import('./WorkshopNotes');
const project = { id: 'p', title: 'Gate', due_date: null, workshop_notes: 'old note', cut_list: null } as unknown as Project;

describe('WorkshopNotes', () => {
  beforeEach(() => update.mockClear());

  it('saves the notes on blur and says so', async () => {
    render(<WorkshopNotes project={project} />);
    const box = screen.getByLabelText('Workshop notes') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Bring the jig' } });
    expect(update).not.toHaveBeenCalled();
    fireEvent.blur(box);
    expect(update).toHaveBeenCalledWith('p', { workshop_notes: 'Bring the jig' });
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
  });

  it('saves the cut list on blur, and an empty list as null', async () => {
    render(<WorkshopNotes project={{ ...project, cut_list: '4 x 1400 mm' }} />);
    const box = screen.getByLabelText('Cut list') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: '4 x 1400 mm\n2 x 800 mm' } });
    fireEvent.blur(box);
    expect(update).toHaveBeenCalledWith('p', { cut_list: '4 x 1400 mm\n2 x 800 mm' });
    fireEvent.change(box, { target: { value: '  ' } });
    fireEvent.blur(box);
    expect(update).toHaveBeenLastCalledWith('p', { cut_list: null });
  });

  it('does not save when nothing changed', () => {
    render(<WorkshopNotes project={project} />);
    const box = screen.getByLabelText('Workshop notes');
    fireEvent.focus(box);
    fireEvent.blur(box);
    expect(update).not.toHaveBeenCalled();
  });

  it('shows an error line on failure and keeps the typed text', async () => {
    update.mockResolvedValueOnce('network down');
    render(<WorkshopNotes project={project} />);
    const box = screen.getByLabelText('Workshop notes') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'typed' } });
    fireEvent.blur(box);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('network down'));
    expect(box.value).toBe('typed');
  });

  it('keeps unsaved typing when the project refetches meanwhile, then follows the server again', () => {
    const { rerender } = render(<WorkshopNotes project={project} />);
    const box = screen.getByLabelText('Workshop notes') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'half typed' } });
    rerender(<WorkshopNotes project={{ ...project, workshop_notes: 'from server' }} />);
    expect(box.value).toBe('half typed');
  });

  it('follows the server when nothing is being edited', () => {
    const { rerender } = render(<WorkshopNotes project={project} />);
    rerender(<WorkshopNotes project={{ ...project, workshop_notes: 'from server' }} />);
    expect((screen.getByLabelText('Workshop notes') as HTMLTextAreaElement).value).toBe('from server');
  });

  it('saves the deadline through the project update', () => {
    render(<WorkshopNotes project={project} />);
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2026-12-01' } });
    expect(update).toHaveBeenCalledWith('p', { due_date: '2026-12-01' });
  });

  it('shows pinned warnings as a banner and keeps the editor collapsed until opened', () => {
    render(<WorkshopNotes project={project} />);
    expect(screen.getByRole('note').textContent).toContain('Hot work permit');
    const toggle = screen.getByRole('button', { name: /Warnings \(2\)/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Plain note')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText('Plain note')).toBeTruthy();
  });
});
