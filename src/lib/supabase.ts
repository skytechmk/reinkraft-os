import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDemoClient } from './demoBackend';

// VITE_DEMO=1 swaps in in-memory sample data for local visual preview. Never set it for a deploy.
const demo = import.meta.env.VITE_DEMO === '1';
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!demo && (!url || !anonKey)) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see .env.example)');
}

export const supabase: SupabaseClient = demo
  ? createDemoClient()
  : createClient(url as string, anonKey as string, { auth: { persistSession: true, autoRefreshToken: true } });

/** Device-generated idempotency key for every stock/cost write. */
export const newOpId = (): string => crypto.randomUUID();
