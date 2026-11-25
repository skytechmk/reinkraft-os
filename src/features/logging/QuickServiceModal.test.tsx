import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InventoryItem } from '../../lib/types';

const enqueue = vi.fn(async (..._a: unknown[]) => ({}));
vi.mock('../../lib/offlineQueue', () => ({ enqueue: (...a: unknown[]) => enqueue(...a) }));
let opN = 0;
vi.mock('../../lib/supabase', () => ({ newOpId: () => `op-${++opN}`, supabase: {} }));
let enabled = ['MIG', 'MAG', 'TIG_DC', 'TIG_ACDC', 'PULSE', 'MMA', 'PLASMA', 'LASER'];
vi.mock('../../lib/api', () => ({ useSettings: () => ({ data: { hourly_labor_rate: 20, enabled_processes: enabled } }) }));

const { QuickServiceModal } = await import('./QuickServiceModal');

const base: Record<string, unknown> = {
  item_type: 'CONSUMABLE', material_grade: null, standard_length_mm: null, unit_label: 'PCS', qty_on_hand: 10, min_alert_qty: 2, last_buy_price: 5,
  prev_buy_price: null, is_remnant: false, remnant_length_mm: null, parent_id: null, weight_kg_per_m: null, surface_m2_per_m: null,
  coverage_m2_per_l: null, folder: 'ABRASIVES', subfolder: 'DISCS', process_tags: [], manufacturer_sku: null, supplier_name: null, supplier_contact: null,
};
const disc = { ...base, id: 'disc', name: 'Cutting disc' } as unknown as InventoryItem;
const rod = { ...base, id: 'rod', name: 'TIG rod', folder: 'WELDING', subfolder: 'TIG', process_tags: ['TIG_DC'] } as unknown as InventoryItem;
const empty = { ...base, id: 'none', name: 'Empty thing', qty_on_hand: 0 } as unknown as InventoryItem;

function open(onClose = vi.fn(), items = [disc, rod, empty]) {
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><QuickServiceModal projectId="svc" batchId="batch-1" items={items} onClose={onClose} /></QueryClientProvider>);
  return onClose;
}

describe('QuickServiceModal', () => {
  beforeEach(() => { enqueue.mockClear(); opN = 0; enabled = ['MIG', 'TIG_DC']; });

  it('is a modal dialog with focus inside and a locked page behind it', () => {
    open();
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('logs the labour chips through the outbox and stays open', () => {
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: '+10 min' }));
    fireEvent.click(screen.getByRole('button', { name: '+30 min' }));
    fireEvent.click(screen.getByRole('button', { name: '+1 h' }));
    expect(enqueue).toHaveBeenNthCalledWith(1, 'log_project_activity', expect.objectContaining({ p_project_id: 'svc', p_category: 'LABOR', p_qty: 0.167, p_service_batch_id: 'batch-1' }));
    expect(enqueue).toHaveBeenNthCalledWith(2, 'log_project_activity', expect.objectContaining({ p_qty: 0.5 }));
    expect(enqueue).toHaveBeenNthCalledWith(3, 'log_project_activity', expect.objectContaining({ p_qty: 1 }));
    expect(screen.getByRole('status').textContent).toContain('Logged');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('logs a consumable with the stepper quantity, and offers neither empty stock nor a disabled process', () => {
    enabled = ['MIG'];
    open();
    expect(screen.queryByText(/TIG rod/)).toBeNull();
    expect(screen.queryByText(/Empty thing/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Cutting disc/ }));
    fireEvent.click(screen.getByLabelText('More'));
    fireEvent.click(screen.getByRole('button', { name: /LOG 2/ }));
    expect(enqueue).toHaveBeenCalledWith('log_project_activity', expect.objectContaining({ p_category: 'CONSUMABLE', p_qty: 2, p_inventory_id: 'disc', p_service_batch_id: 'batch-1' }));
  });

  it('closes on Esc and on the backdrop, and gives the page its scroll back', () => {
    const onClose = open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('restores the page scroll and focus on unmount', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const qc = new QueryClient();
    const { unmount } = render(<QueryClientProvider client={qc}><QuickServiceModal projectId="svc" batchId="b" items={[]} onClose={() => {}} /></QueryClientProvider>);
    unmount();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
