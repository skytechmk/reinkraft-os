import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { Settings, InventoryItem, Project, LogRow, PurchaseRow, NoteRow } from './types';

// Reads go straight to PostgREST; RLS limits every row to the caller's company.
// Writes go through the outbox (see offlineQueue.ts).

function unwrap<T>(res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => unwrap<Settings>(await supabase.from('company_settings').select('*').single()),
  });
}

export function useInventory() {
  return useQuery({
    queryKey: ['inventory'],
    queryFn: async () =>
      unwrap<InventoryItem[]>(await supabase.from('inventory').select('*').order('name')),
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () =>
      unwrap<Project[]>(
        await supabase
          .from('projects')
          .select('*')
          .neq('project_type', 'SYSTEM_SERVICE')
          .order('created_at', { ascending: false }),
      ),
  });
}

export function useSystemProjectId() {
  return useQuery({
    queryKey: ['system-project'],
    queryFn: async () => {
      const row = unwrap<{ id: string }>(
        await supabase.from('projects').select('id').eq('project_type', 'SYSTEM_SERVICE').single(),
      );
      return row.id;
    },
  });
}

export function useLogs(projectId: string | null) {
  return useQuery({
    queryKey: ['logs', projectId],
    enabled: !!projectId,
    queryFn: async () =>
      unwrap<LogRow[]>(
        await supabase
          .from('project_logs')
          .select('*')
          .eq('project_id', projectId as string)
          .order('created_at', { ascending: false }),
      ),
  });
}

/** Logs across all projects, for stats and exports (capped). */
export function useAllLogs() {
  return useQuery({
    queryKey: ['logs-all'],
    queryFn: async () =>
      unwrap<LogRow[]>(
        await supabase.from('project_logs').select('*').order('created_at', { ascending: false }).limit(2000),
      ),
  });
}

export function usePurchases() {
  return useQuery({
    queryKey: ['purchases'],
    queryFn: async () =>
      unwrap<PurchaseRow[]>(
        await supabase.from('purchases').select('*').order('purchased_at', { ascending: false }).limit(100),
      ),
  });
}

/** Refetches every query once the outbox has flushed. Optimistic edits stay on screen until then. */
export function useOutboxSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const refresh = () => void qc.invalidateQueries();
    window.addEventListener('outbox-flushed', refresh);
    return () => window.removeEventListener('outbox-flushed', refresh);
  }, [qc]);
}

export function useNotes(projectId: string | null) {
  return useQuery({
    queryKey: ['notes', projectId],
    enabled: !!projectId,
    queryFn: async () =>
      unwrap<NoteRow[]>(
        await supabase
          .from('project_notes')
          .select('*')
          .eq('project_id', projectId as string)
          .order('is_pinned_warning', { ascending: false }),
      ),
  });
}

/** All notes that are pinned warnings, across projects (for list badges). */
export function usePinnedWarnings() {
  return useQuery({
    queryKey: ['notes-pinned'],
    queryFn: async () =>
      unwrap<NoteRow[]>(await supabase.from('project_notes').select('*').eq('is_pinned_warning', true)),
  });
}
