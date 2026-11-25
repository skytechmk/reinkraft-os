import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Project } from '../../lib/types';

/** Saves project fields (status, price, advance, due date, note). Shows the change at once, rolls back on error. */
export function useProjectUpdate() {
  const qc = useQueryClient();
  return async (id: string, patch: Partial<Project>): Promise<string | null> => {
    qc.setQueryData<Project[]>(['projects'], (old) => (old ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const { error } = await supabase.from('projects').update(patch).eq('id', id);
    if (error) {
      void qc.invalidateQueries({ queryKey: ['projects'] });
      return error.message;
    }
    return null;
  };
}
