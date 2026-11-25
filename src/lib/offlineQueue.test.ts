import { beforeEach, describe, expect, it, vi } from 'vitest';

// One handler decides every RPC answer, so background flushes behave the same as explicit ones.
type Answer = { error: { message: string; code?: string } | null };
let handler: (name: string, args: { p_client_op_id?: string }) => Answer = () => ({ error: null });
const rpc = vi.fn(async (name: string, args: { p_client_op_id?: string }) => handler(name, args));
vi.mock('./supabase', () => ({ supabase: { rpc: (name: string, args: object) => rpc(name, args) } }));

const { enqueue, flush, outbox } = await import('./offlineQueue');

const settle = () => new Promise((r) => setTimeout(r, 30));

async function clearOutbox() {
  for (const op of await outbox.all()) await outbox.remove(op.id);
}

const args = (id: string) => ({ p_client_op_id: id, p_project_id: 'p', p_category: 'LABOR', p_qty: 1 });

describe('offline outbox', () => {
  beforeEach(async () => {
    rpc.mockClear();
    handler = () => ({ error: null });
    await clearOutbox();
  });

  it('keeps an op pending when the network is down', async () => {
    handler = () => ({ error: { message: 'Failed to fetch' } });
    await enqueue('log_project_activity', args('op-net'));
    await flush();
    await settle();
    const [op] = await outbox.all();
    expect(op.status).toBe('pending');
  });

  it('marks a business-rule rejection as failed and keeps it', async () => {
    handler = () => ({ error: { message: 'INSUFFICIENT_STOCK', code: 'P0001' } });
    await enqueue('log_project_activity', args('op-stock'));
    await flush();
    await settle();
    const [op] = await outbox.all();
    expect(op.status).toBe('failed');
    expect(op.error).toBe('INSUFFICIENT_STOCK');
  });

  it('removes an op once the server accepts it', async () => {
    await enqueue('log_project_activity', args('op-ok'));
    await flush();
    await settle();
    expect(await outbox.all()).toHaveLength(0);
  });

  it('replays in creation order', async () => {
    handler = () => ({ error: { message: 'Failed to fetch' } });
    await enqueue('log_project_activity', args('first'));
    await new Promise((r) => setTimeout(r, 2));
    await enqueue('log_project_activity', args('second'));
    await settle();
    const order: string[] = [];
    handler = (_n, a) => {
      order.push(a.p_client_op_id ?? '');
      return { error: null };
    };
    await flush();
    await settle();
    expect(order).toEqual(['first', 'second']);
  });
});
