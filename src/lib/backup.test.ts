import { beforeEach, describe, expect, it, vi } from 'vitest';

const data: Record<string, unknown[]> = {};
const requested: string[] = [];
const ranges: Array<[string, number, number]> = [];
let failTable: string | null = null;

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        range: async (from: number, to: number) => {
          requested.push(table);
          ranges.push([table, from, to]);
          if (table === failTable) return { data: null, error: { message: 'boom' } };
          return { data: (data[table] ?? []).slice(from, to + 1), error: null };
        },
      }),
    }),
  },
}));

const { BACKUP_TABLES, buildBackup, downloadBackup } = await import('./backup');
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

beforeEach(() => {
  for (const k of Object.keys(data)) delete data[k];
  requested.length = 0;
  ranges.length = 0;
  failTable = null;
});

describe('buildBackup', () => {
  it('requests every table and returns the documented shape', async () => {
    const b = await buildBackup();
    expect(b.app).toBe('reinkraft-os');
    expect(b.version).toBe(1);
    expect(new Date(b.exportedAt).toISOString()).toBe(b.exportedAt);
    expect(Object.keys(b.tables).sort()).toEqual([...BACKUP_TABLES].sort());
    for (const t of ['company_settings', 'inventory', 'projects', 'project_logs', 'project_notes', 'purchases', 'invoices', 'invoice_lines']) {
      expect(requested).toContain(t);
    }
  });

  it('pages through more than 1000 rows', async () => {
    data.project_logs = rows(2500);
    data.inventory = rows(1000);
    const b = await buildBackup();
    expect(b.tables.project_logs).toHaveLength(2500);
    expect(ranges.filter((r) => r[0] === 'project_logs').map((r) => [r[1], r[2]])).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(b.tables.inventory).toHaveLength(1000);
    expect(ranges.filter((r) => r[0] === 'inventory')).toHaveLength(2);
  });

  it('fails with the table name when a read fails', async () => {
    failTable = 'purchases';
    await expect(buildBackup()).rejects.toThrow('purchases: boom');
  });
});

describe('downloadBackup', () => {
  it('saves a dated .json file', async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => { blob = b as Blob; return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    let name = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { name = this.download; });
    data.inventory = rows(2);
    await downloadBackup();
    expect(click).toHaveBeenCalled();
    expect(name).toMatch(/^reinkraft-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const parsed = JSON.parse(await blob!.text());
    expect(parsed.tables.inventory).toHaveLength(2);
    click.mockRestore();
  });
});
