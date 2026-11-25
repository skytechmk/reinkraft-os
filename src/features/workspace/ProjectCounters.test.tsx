import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InventoryItem, LogRow, Project } from '../../lib/types';

const enqueue = vi.fn(async (..._a: unknown[]) => ({}));
vi.mock('../../lib/offlineQueue', () => ({ enqueue: (...a: unknown[]) => enqueue(...a) }));
let opN = 0;
vi.mock('../../lib/supabase', () => ({ newOpId: () => `op-${++opN}`, supabase: {} }));
let settingsData: Record<string, unknown> = { company_id: 'c', hourly_labor_rate: 20, min_remnant_length_mm: 500, unit_system: 'METRIC', enabled_processes: ['MIG', 'MAG', 'TIG_DC', 'TIG_ACDC', 'PULSE', 'MMA', 'PLASMA', 'LASER'] };
vi.mock('../../lib/api', () => ({ useSettings: () => ({ data: settingsData }) }));

const { ProjectCounters } = await import('./ProjectCounters');

const project = { id: 'p', title: 'Gate' } as Project;
const base: Record<string, unknown> = {
  item_type: 'CUSTOM', material_grade: null, standard_length_mm: null, unit_label: 'PCS', qty_on_hand: 10, min_alert_qty: 2, last_buy_price: 5,
  prev_buy_price: null, is_remnant: false, remnant_length_mm: null, parent_id: null, weight_kg_per_m: null, surface_m2_per_m: null,
  coverage_m2_per_l: null, folder: null, subfolder: null, process_tags: [], manufacturer_sku: null, supplier_name: null, supplier_contact: null,
};
const tube = { ...base, id: 'tube', name: 'Tube 6m', item_type: 'PROFILE', standard_length_mm: 6000, unit_label: 'BAR', last_buy_price: 100, folder: 'RAW', subfolder: 'PROFILES' } as unknown as InventoryItem;
const flat = { ...base, id: 'flat', name: 'Flat 4m', item_type: 'PROFILE', standard_length_mm: 4000, unit_label: 'BAR', last_buy_price: 40, folder: 'RAW', subfolder: 'PROFILES' } as unknown as InventoryItem;
const hinge = { ...base, id: 'hinge', name: 'Hinge', folder: 'HARDWARE', subfolder: 'GATES' } as unknown as InventoryItem;
const disc = { ...base, id: 'disc', name: 'Cutting disc', item_type: 'CONSUMABLE', folder: 'ABRASIVES', subfolder: 'DISCS' } as unknown as InventoryItem;
const tigRod = { ...base, id: 'rod', name: 'TIG rod', item_type: 'CONSUMABLE', folder: 'WELDING', subfolder: 'TIG', process_tags: ['TIG_DC'] } as unknown as InventoryItem;
const legacyWire = { ...base, id: 'wire', name: 'Legacy wire', item_type: 'CONSUMABLE', unit_label: 'M' } as unknown as InventoryItem;
const ALL = [tube, flat, hinge, disc, tigRod, legacyWire];

const cut = (id: string, at: string, inv = 'tube', name = 'Tube 6m'): LogRow => ({
  id, project_id: 'p', inventory_id: inv, log_category: 'MATERIAL', description: name, qty_delta: -1, unit_cost_at_time: 100,
  charged_amount: null, source_log_id: null, service_batch_id: null, created_at: at,
});
const labour: LogRow = { ...cut('lab', '2026-11-20T12:00:00'), inventory_id: null, log_category: 'LABOR', description: 'Working hours', qty_delta: 0.5 };

function show(logs: LogRow[], items: InventoryItem[] = ALL) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}><ProjectCounters project={project} items={items} logs={logs} /></QueryClientProvider>);
}
const undoBtn = () => screen.getByRole('button', { name: /Undo$/ }) as HTMLButtonElement;
const remnantBtn = () => screen.getByRole('button', { name: /\+Remnant/ }) as HTMLButtonElement;
beforeEach(() => { enqueue.mockClear(); opN = 0; settingsData = { ...settingsData, enabled_processes: ['MIG', 'MAG', 'TIG_DC', 'TIG_ACDC', 'PULSE', 'MMA', 'PLASMA', 'LASER'] }; });

describe('daily steppers', () => {
  it('logs half an hour of labour through the outbox', () => {
    show([]);
    fireEvent.click(screen.getByLabelText('Add one step of Working hours'));
    expect(enqueue).toHaveBeenCalledWith('log_project_activity', expect.objectContaining({ p_category: 'LABOR', p_qty: 0.5, p_project_id: 'p' }));
  });

  it('shows abrasives, welding and legacy consumables, but no raw materials or hardware', () => {
    show([]);
    for (const n of ['Cutting disc', 'TIG rod', 'Legacy wire']) expect(screen.getByLabelText(`Add one step of ${n}`)).toBeTruthy();
    for (const n of ['Tube 6m', 'Hinge']) expect(screen.queryByLabelText(`Add one step of ${n}`)).toBeNull();
  });

  it('does not offer a consumable of a disabled process', () => {
    settingsData = { ...settingsData, enabled_processes: ['MIG'] };
    show([]);
    expect(screen.queryByLabelText('Add one step of TIG rod')).toBeNull();
    expect(screen.getByLabelText('Add one step of Cutting disc')).toBeTruthy();
  });

  it('a minus takes back only the newest log of its own row', () => {
    const used: LogRow = { ...cut('d1', '2026-11-20T09:00:00', 'disc', 'Cutting disc'), log_category: 'CONSUMABLE' };
    show([labour, used]);
    fireEvent.click(screen.getByLabelText('Undo last Cutting disc'));
    expect(enqueue).toHaveBeenCalledWith('undo_project_log', { p_log_id: 'd1' });
  });

  it('keeps the plus disabled when stock is lower than one step', () => {
    show([], [{ ...disc, qty_on_hand: 0 }]);
    expect((screen.getByLabelText('Add one step of Cutting disc') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('raw materials drawer', () => {
  it('is collapsed by default and holds the RAW and HARDWARE items', () => {
    show([cut('c1', '2026-11-20T10:00:00')]);
    const toggle = screen.getByRole('button', { name: /Raw Materials & Hardware/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Add one step of Tube 6m')).toBeNull();
    expect(toggle.textContent).toContain('1 used');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Add one step of Tube 6m')).toBeTruthy();
    expect(screen.getByLabelText('Add one step of Hinge')).toBeTruthy();
    expect(within(document.getElementById('materials-drawer') as HTMLElement).queryByLabelText('Add one step of Cutting disc')).toBeNull();
    fireEvent.click(screen.getByLabelText('Add one step of Hinge'));
    expect(enqueue).toHaveBeenCalledWith('log_project_activity', expect.objectContaining({ p_category: 'HARDWARE', p_inventory_id: 'hinge' }));
  });

  it('lists a remnant piece with its length while some are left', () => {
    const piece = { ...base, id: 'rem', name: 'Tube offcut', is_remnant: true, remnant_length_mm: 1500, folder: 'RAW', subfolder: 'REMNANTS', qty_on_hand: 2 } as unknown as InventoryItem;
    const gone = { ...piece, id: 'rem0', name: 'Gone piece', qty_on_hand: 0 } as unknown as InventoryItem;
    show([], [piece, gone]);
    fireEvent.click(screen.getByRole('button', { name: /Raw Materials & Hardware/ }));
    expect(screen.getByText(/Remnant 1\.5 m/)).toBeTruthy();
    expect(screen.queryByText('Gone piece')).toBeNull();
  });
});

describe('Undo', () => {
  it('is disabled when nothing has been logged', () => {
    show([]);
    expect(undoBtn().disabled).toBe(true);
    expect(screen.getByText('Nothing to undo yet.')).toBeTruthy();
  });

  it('takes back the newest log of the whole project, whichever row it was on, and then waits for the save', () => {
    show([labour, cut('c-old', '2026-11-19T09:00:00')]);
    expect(screen.getByText('Takes back: Working hours')).toBeTruthy();
    fireEvent.click(undoBtn());
    expect(enqueue).toHaveBeenCalledWith('undo_project_log', { p_log_id: 'lab' });
    expect(undoBtn().disabled).toBe(true);
    fireEvent.click(undoBtn());
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('does not act on a log that is still being saved', () => {
    show([{ ...labour, id: 'tmp-xyz' }]);
    expect(undoBtn().disabled).toBe(true);
  });
});

describe('+Remnant', () => {
  it('is disabled until a bar has been cut', () => {
    show([]);
    expect(remnantBtn().disabled).toBe(true);
    expect(screen.getByText('Cut a bar first, then return the offcut.')).toBeTruthy();
  });

  it('prompts for the length, starting at 1 m, and returns the chosen length against the newest cut', () => {
    show([cut('c-new', '2026-11-20T10:00:00'), cut('c-old', '2026-11-19T10:00:00')]);
    fireEvent.click(remnantBtn());
    fireEvent.click(screen.getByLabelText('Longer offcut'));
    fireEvent.click(screen.getByLabelText('Longer offcut'));
    fireEvent.click(screen.getByRole('button', { name: /RETURN 1\.2 m/ }));
    expect(enqueue).toHaveBeenCalledWith('return_remnant', { p_client_op_id: 'op-1', p_log_id: 'c-new', p_length_mm: 1200 });
    expect(screen.getByText('Offcut returned to stock.')).toBeTruthy();
  });

  it('keeps the length between the company minimum and the bar length minus 100 mm', () => {
    show([cut('c-new', '2026-11-20T10:00:00')]);
    fireEvent.click(remnantBtn());
    const less = screen.getByLabelText('Shorter offcut') as HTMLButtonElement;
    const more = screen.getByLabelText('Longer offcut') as HTMLButtonElement;
    for (let i = 0; i < 20; i++) fireEvent.click(less);
    expect(less.disabled).toBe(true);
    expect(screen.getByRole('button', { name: /RETURN 500 mm/ })).toBeTruthy();
    for (let i = 0; i < 80; i++) fireEvent.click(more);
    expect(more.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /RETURN 5\.9 m/ }));
    expect(enqueue).toHaveBeenCalledWith('return_remnant', expect.objectContaining({ p_length_mm: 5900 }));
  });

  it('never offers the same cut twice while its return is still being saved', () => {
    show([cut('c-new', '2026-11-20T10:00:00'), cut('c-old', '2026-11-19T10:00:00')]);
    fireEvent.click(remnantBtn());
    fireEvent.click(screen.getByRole('button', { name: /RETURN 1 m/ }));
    fireEvent.click(remnantBtn());
    fireEvent.click(screen.getByRole('button', { name: /RETURN 1 m/ }));
    expect(enqueue).toHaveBeenNthCalledWith(2, 'return_remnant', { p_client_op_id: 'op-2', p_log_id: 'c-old', p_length_mm: 1000 });
  });

  it('is disabled once the only cut has been returned', () => {
    show([cut('c-new', '2026-11-20T10:00:00')]);
    fireEvent.click(remnantBtn());
    fireEvent.click(screen.getByRole('button', { name: /RETURN 1 m/ }));
    expect(remnantBtn().disabled).toBe(true);
  });

  it('skips a cut that already has an offcut credit', () => {
    const credit: LogRow = { ...cut('credit', '2026-11-20T11:00:00', 'rem'), qty_delta: 1, unit_cost_at_time: -33, source_log_id: 'c-new' };
    show([credit, cut('c-new', '2026-11-20T10:00:00'), cut('c-old', '2026-11-19T10:00:00')]);
    fireEvent.click(remnantBtn());
    fireEvent.click(screen.getByRole('button', { name: /RETURN 1 m/ }));
    expect(enqueue).toHaveBeenCalledWith('return_remnant', expect.objectContaining({ p_log_id: 'c-old' }));
  });

  it('lets the user choose the profile when several bars have cuts, newest first by default', () => {
    show([cut('f1', '2026-11-20T11:00:00', 'flat', 'Flat 4m'), cut('t1', '2026-11-20T10:00:00')]);
    fireEvent.click(remnantBtn());
    const group = screen.getByRole('group', { name: 'Which bar' });
    expect(within(group).getByText('Flat 4m').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(group).getByText('Tube 6m'));
    fireEvent.click(screen.getByRole('button', { name: /RETURN 1 m/ }));
    expect(enqueue).toHaveBeenCalledWith('return_remnant', expect.objectContaining({ p_log_id: 't1' }));
  });

  it('is not offered for a cut that is still being saved', () => {
    show([cut('tmp-1', '2026-11-20T10:00:00')]);
    expect(remnantBtn().disabled).toBe(true);
  });

  it('makes Undo wait right after a return, because the newest row on screen is not the credit yet', () => {
    show([cut('c-new', '2026-11-20T10:00:00')]);
    fireEvent.click(remnantBtn());
    fireEvent.click(screen.getByRole('button', { name: /RETURN 1 m/ }));
    expect(undoBtn().disabled).toBe(true);
    expect(screen.getByText('Saving your last tap…')).toBeTruthy();
    fireEvent.click(undoBtn());
    expect(enqueue).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new Event('outbox-flushed')); });
    expect(undoBtn().disabled).toBe(false);
  });
});

describe('weld length and saw cuts (billing rates from Settings)', () => {
  const wire = { ...base, id: 'w', name: 'MIG wire', item_type: 'CONSUMABLE', unit_label: 'KG', qty_on_hand: 10, last_buy_price: 450, folder: 'WELDING', subfolder: 'MIG_MAG', process_tags: ['MIG', 'MAG'] } as unknown as InventoryItem;
  const gas = { ...base, id: 'g', name: 'CO2', item_type: 'CONSUMABLE', unit_label: 'L', qty_on_hand: 40, last_buy_price: 12, folder: 'WELDING', subfolder: 'MIG_MAG', process_tags: ['MIG', 'MAG'] } as unknown as InventoryItem;
  const WITH = [...ALL, wire, gas];
  const rates = {
    weld_rate_enabled: true, saw_rate_enabled: true, saw_cut_rate: 50, auto_consumption_enabled: true,
    process_config: { MIG: { rate_per_cm: 0.5, wire_item_id: 'w', wire_g_per_m: 20, gas_item_id: 'g', gas_l_per_m: 8 } },
    enabled_processes: ['MIG', 'TIG_DC'],
  };
  const row = (parent: string, at: string, extra: Partial<LogRow> = {}): LogRow => ({
    id: parent, project_id: 'p', inventory_id: null, log_category: 'WELD_LENGTH', description: 'MIG', qty_delta: 10, unit_cost_at_time: 0.5,
    charged_amount: null, source_log_id: null, service_batch_id: null, created_at: at, ...extra,
  });
  const child = (id: string, parent: string, inv: string): LogRow => ({
    id, project_id: 'p', inventory_id: inv, log_category: 'WELD', description: inv, qty_delta: -0.2, unit_cost_at_time: 5,
    charged_amount: null, source_log_id: null, service_batch_id: null, parent_log_id: parent, created_at: '2026-11-20T12:00:00',
  });

  it('shows neither row while both rates are off (the default)', () => {
    show([], WITH);
    expect(screen.queryByLabelText('Add one step of Weld length')).toBeNull();
    expect(screen.queryByLabelText('Add one step of Saw cuts')).toBeNull();
  });

  describe('with the rates switched on', () => {
    beforeEach(() => { settingsData = { ...settingsData, ...rates }; });

    it('offers only the processes that are enabled', () => {
      show([], WITH);
      expect(screen.getByRole('button', { name: 'MIG' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'TIG DC' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'MMA' })).toBeNull();
    });

    it('logs ten centimetres of the chosen process through the outbox', () => {
      show([], WITH);
      fireEvent.click(screen.getByLabelText('Add one step of Weld length'));
      expect(enqueue).toHaveBeenCalledWith('log_weld', { p_client_op_id: 'op-1', p_project_id: 'p', p_process: 'MIG', p_length_cm: 10 });
      fireEvent.click(screen.getByRole('button', { name: 'TIG DC' }));
      fireEvent.click(screen.getByLabelText('Add one step of Weld length'));
      expect(enqueue).toHaveBeenLastCalledWith('log_weld', { p_client_op_id: 'op-2', p_project_id: 'p', p_process: 'TIG_DC', p_length_cm: 10 });
    });

    it('says what a tap will use, and refuses a weld the stock cannot cover', () => {
      const { unmount } = show([], WITH);
      expect(screen.getByText(/Uses .*kg.*L per tap/i)).toBeTruthy();
      unmount();
      show([], [...ALL, wire, { ...gas, qty_on_hand: 0.1 } as InventoryItem]);
      expect((screen.getByLabelText('Add one step of Weld length') as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText('Not enough wire or gas in stock for this weld.')).toBeTruthy();
    });

    it('does not use consumption when automatic consumption is off', () => {
      settingsData = { ...settingsData, auto_consumption_enabled: false };
      show([], [...ALL, wire, { ...gas, qty_on_hand: 0 } as InventoryItem]);
      expect((screen.getByLabelText('Add one step of Weld length') as HTMLButtonElement).disabled).toBe(false);
      expect(screen.queryByText(/Uses /)).toBeNull();
    });

    it('Undo takes back the weld itself, never its wire or gas rows, even when they sort first', () => {
      const logs = [child('c-gas', 'weld', 'g'), child('c-wire', 'weld', 'w'), row('weld', '2026-11-20T12:00:00'), labour];
      show(logs, WITH);
      fireEvent.click(undoBtn());
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(enqueue).toHaveBeenCalledWith('undo_project_log', { p_log_id: 'weld' });
    });

    it('the minus of the weld row undoes the weld, and the wire row cannot be undone on its own', () => {
      const logs = [child('c-wire', 'weld', 'w'), row('weld', '2026-11-20T12:00:00')];
      show(logs, WITH);
      fireEvent.click(screen.getByLabelText('Undo last Weld length'));
      expect(enqueue).toHaveBeenCalledWith('undo_project_log', { p_log_id: 'weld' });
      enqueue.mockClear();
      expect((screen.getByLabelText('Undo last MIG wire') as HTMLButtonElement).disabled).toBe(true);   // only a child row is left for it
    });

    it('counts saw cuts one at a time and takes the newest back', () => {
      const cuts: LogRow = { ...row('saw1', '2026-11-20T09:00:00'), log_category: 'SAW_CUT', description: 'Saw cuts', qty_delta: 1, unit_cost_at_time: 50 };
      show([cuts], WITH);
      fireEvent.click(screen.getByLabelText('Add one step of Saw cuts'));
      expect(enqueue).toHaveBeenCalledWith('log_project_activity', expect.objectContaining({ p_category: 'SAW_CUT', p_qty: 1, p_inventory_id: null }));
      fireEvent.click(screen.getByLabelText('Undo last Saw cuts'));
      expect(enqueue).toHaveBeenCalledWith('undo_project_log', { p_log_id: 'saw1' });
    });

    it('hides the saw row when only the weld rate is on', () => {
      settingsData = { ...settingsData, saw_rate_enabled: false };
      show([], WITH);
      expect(screen.getByLabelText('Add one step of Weld length')).toBeTruthy();
      expect(screen.queryByLabelText('Add one step of Saw cuts')).toBeNull();
    });
  });
});
