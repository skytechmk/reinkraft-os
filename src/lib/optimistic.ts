import type { QueryClient } from '@tanstack/react-query';
import type { InventoryItem, LogRow } from './types';
import type { WeldUse } from '../domain/weld';

// Instant on-screen feedback for taps. The real rows replace these once the outbox
// has flushed (see useOutboxSync); if the server rejects a write the refetch removes them.

export const isTemp = (l: LogRow): boolean => l.id.startsWith('tmp-');

function patchLogs(qc: QueryClient, projectId: string, fn: (rows: LogRow[]) => LogRow[]) {
  qc.setQueryData<LogRow[]>(['logs', projectId], (old) => fn(old ?? []));
}

function patchStock(qc: QueryClient, itemId: string | null, delta: number) {
  if (!itemId) return;
  qc.setQueryData<InventoryItem[]>(['inventory'], (old) =>
    (old ?? []).map((i) => (i.id === itemId ? { ...i, qty_on_hand: Math.max(0, i.qty_on_hand + delta) } : i)),
  );
}

export interface OptimisticLog {
  opId: string;
  projectId: string;
  category: LogRow['log_category'];
  qty: number;                 // positive amount used
  description: string;
  unitCost: number;
  itemId: string | null;
}

export function optimisticLog(qc: QueryClient, o: OptimisticLog): void {
  const row: LogRow = {
    id: `tmp-${o.opId}`,
    project_id: o.projectId,
    inventory_id: o.itemId,
    log_category: o.category,
    description: o.description,
    qty_delta: o.category === 'LABOR' || o.category === 'SAW_CUT' ? o.qty : -o.qty,
    unit_cost_at_time: o.unitCost,
    charged_amount: null,
    source_log_id: null,
    service_batch_id: null,
    created_at: new Date().toISOString(),
  };
  patchLogs(qc, o.projectId, (rows) => [row, ...rows]);
  if (o.category !== 'LABOR' && o.category !== 'SAW_CUT') patchStock(qc, o.itemId, -o.qty);
}

export interface OptimisticWeld {
  opId: string;
  projectId: string;
  process: string;
  lengthCm: number;
  /** rate per cm frozen on the row */
  rate: number;
  use: WeldUse;
  items: ReadonlyMap<string, InventoryItem>;
}

/** Shows a weld at once: the length row and, when auto-consumption applies, its wire and gas rows. */
export function optimisticWeld(qc: QueryClient, o: OptimisticWeld): void {
  const parentId = `tmp-${o.opId}`;
  const now = new Date().toISOString();
  const base = { project_id: o.projectId, charged_amount: null, source_log_id: null, service_batch_id: null, created_at: now };
  const parent: LogRow = { ...base, id: parentId, inventory_id: null, log_category: 'WELD_LENGTH', description: o.process, qty_delta: o.lengthCm, unit_cost_at_time: o.rate };
  const children: LogRow[] = [];
  for (const [part, use] of [['wire', o.use.wire], ['gas', o.use.gas]] as const) {
    if (!use) continue;
    const item = o.items.get(use.itemId);
    children.push({ ...base, id: `${parentId}-${part}`, inventory_id: use.itemId, log_category: 'WELD', description: item?.name ?? part, qty_delta: -use.qty, unit_cost_at_time: item?.last_buy_price ?? 0, parent_log_id: parentId });
    patchStock(qc, use.itemId, -use.qty);
  }
  patchLogs(qc, o.projectId, (rows) => [parent, ...children, ...rows]);
}

export function optimisticUndo(qc: QueryClient, log: LogRow): void {
  // a weld is undone together with its wire and gas rows
  const children = (qc.getQueryData<LogRow[]>(['logs', log.project_id]) ?? []).filter((r) => r.parent_log_id === log.id);
  for (const c of children) if (c.inventory_id) patchStock(qc, c.inventory_id, -c.qty_delta);
  patchLogs(qc, log.project_id, (rows) => rows.filter((r) => r.id !== log.id && r.parent_log_id !== log.id));
  // undo restores stock by -qty_delta (a consumption of 2 has qty_delta -2 and gives 2 back)
  if (log.inventory_id) patchStock(qc, log.inventory_id, -log.qty_delta);
}
