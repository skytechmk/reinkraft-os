// Durable outbox for stock/cost writes made while offline.
// Every op carries a device-generated client_op_id; the server RPCs are
// idempotent on that id, so replaying after a dropped response is safe.
// Ops that the server rejects (e.g. INSUFFICIENT_STOCK on replay) are kept
// in the "failed" list for the user to resolve — never silently dropped.

import { supabase } from './supabase';

export type RpcName =
  | 'log_project_activity'
  | 'log_weld'
  | 'return_remnant'
  | 'undo_project_log'
  | 'record_purchase';

export interface QueuedOp {
  id: string;            // == client_op_id
  rpc: RpcName;
  args: Record<string, unknown>;
  status: 'pending' | 'failed';
  error?: string;
  createdAt: number;
}

const DB_NAME = 'reinkraft-os';
const STORE = 'outbox';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export const outbox = {
  all: () => tx<QueuedOp[]>('readonly', (s) => s.getAll()),
  put: (op: QueuedOp) => tx('readwrite', (s) => s.put(op)),
  remove: (id: string) => tx('readwrite', (s) => s.delete(id)),
};

export async function enqueue(rpc: RpcName, args: Record<string, unknown>): Promise<QueuedOp> {
  const op: QueuedOp = {
    // undo_project_log has no client_op_id: it gets a local key only
    id: String(args.p_client_op_id ?? crypto.randomUUID()),
    rpc,
    args,
    status: 'pending',
    createdAt: Date.now(),
  };
  await outbox.put(op);
  window.dispatchEvent(new Event('outbox-changed'));
  void flush();
  return op;
}

let flushing = false;

/** Replays pending ops in creation order. Stops on network errors, keeps going past business errors. */
export async function flush(): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const ops = (await outbox.all())
      .filter((o) => o.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt);

    for (const op of ops) {
      const { error } = await supabase.rpc(op.rpc, op.args);
      if (!error) {
        await outbox.remove(op.id);
        continue;
      }
      const isNetwork = !error.code && /fetch|network|failed/i.test(error.message);
      if (isNetwork) break;                     // still offline: retry later
      // business rule rejected it (stock, bad state): surface, don't drop
      await outbox.put({ ...op, status: 'failed', error: error.message });
    }
  } finally {
    flushing = false;
    window.dispatchEvent(new Event('outbox-changed'));
    window.dispatchEvent(new Event('outbox-flushed'));
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flush());
}
