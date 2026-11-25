import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Invoice, InventoryItem, LogRow, Project, Settings } from '../../lib/types';

const state = { isSuccess: true, isFetching: false, data: [] as Invoice[] };
const create = vi.fn();
vi.mock('../invoices/api', () => ({
  useInvoices: () => state,
  useInvoiceActions: () => ({ create: (...a: unknown[]) => create(...a) }),
  friendlyError: () => null,
}));
const printInternalSheet = vi.fn();
// the real print logic is tested in print.test.ts; here it only needs to follow the same "find or create" rule
vi.mock('../invoices/print', () => ({
  printInternalSheet: (...a: unknown[]) => printInternalSheet(...a),
  printProjectExternal: async (args: { project: Project; invoices: Invoice[]; language: string; create: (p: string, l: string) => Promise<unknown> }) => {
    const found = args.invoices.filter((i) => i.project_id === args.project.id && i.status !== 'VOID')[0];
    if (!found) await args.create(args.project.id, args.language);
    return { status: 'printed' };
  },
}));
vi.mock('../invoices/ExternalInvoiceDialog', () => ({ ExternalInvoiceDialog: () => null }));

const { ProjectPrintBar } = await import('./ProjectPrintBar');

const project = { id: 'p1', title: 'Gate' } as Project;
const settings = {} as Settings;
const logs = [{ id: 'l' }] as LogRow[];
const draft = { id: 'new', project_id: 'p1', status: 'DRAFT' } as Invoice;

const show = () => render(<ProjectPrintBar project={project} settings={settings} items={[] as InventoryItem[]} logs={logs} />);

describe('bottom print bar', () => {
  beforeEach(() => {
    Object.assign(state, { isSuccess: true, isFetching: false, data: [] });
    create.mockReset();
    create.mockResolvedValue({ invoice: draft, error: null });
    printInternalSheet.mockClear();
  });

  it('prints the internal sheet straight away', () => {
    show();
    fireEvent.click(screen.getByText(/PRINT INTERNAL/));
    expect(printInternalSheet).toHaveBeenCalledTimes(1);
  });

  it('keeps the external button off until the list of invoices has loaded, so it cannot create a second draft', () => {
    Object.assign(state, { isSuccess: false });
    const { unmount } = show();
    expect((screen.getByText(/EXPORT CLIENT QUOTE/) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    Object.assign(state, { isSuccess: true, isFetching: true });
    show();
    expect((screen.getByText(/EXPORT CLIENT QUOTE/) as HTMLButtonElement).disabled).toBe(true);
  });

  it('creates one draft for two quick taps while the list has not refreshed yet', async () => {
    show();
    const button = screen.getByText(/EXPORT CLIENT QUOTE/);
    fireEvent.click(button);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByText(/EXPORT CLIENT QUOTE/) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText(/EXPORT CLIENT QUOTE/));      // list in state is still empty
    await new Promise((r) => setTimeout(r, 20));
    expect(create).toHaveBeenCalledTimes(1);
  });
});
