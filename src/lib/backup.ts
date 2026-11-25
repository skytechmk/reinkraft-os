// Full JSON backup of the company's data. Download only; there is no restore.
// RLS returns only the caller's company, so plain selects are enough.
import { supabase } from './supabase';

export const BACKUP_TABLES = [
  'company_settings', 'inventory', 'projects', 'project_logs', 'project_notes', 'purchases', 'invoices', 'invoice_lines',
] as const;

export interface Backup {
  app: 'reinkraft-os';
  version: 1;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

const PAGE = 1000;

async function readAll(table: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data ?? []) as unknown[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

export async function buildBackup(): Promise<Backup> {
  const tables: Record<string, unknown[]> = {};
  for (const name of BACKUP_TABLES) tables[name] = await readAll(name);
  return { app: 'reinkraft-os', version: 1, exportedAt: new Date().toISOString(), tables };
}

export async function downloadBackup(): Promise<void> {
  const backup = await buildBackup();
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `reinkraft-backup-${backup.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
