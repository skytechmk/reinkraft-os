// Builds the folder -> subfolder -> item tree shown on the Inventory screen. Pure, so it is easy to test.
import { FOLDERS, findSubfolder, isItemVisible, isLow, isSubfolderVisible } from '../../domain/folders';
import type { FolderId, InventoryItem, ProcessCode } from '../../lib/types';

export const UNSORTED = 'UNSORTED' as const;
export type SectionId = FolderId | typeof UNSORTED;

export interface SubGroup { id: string; items: InventoryItem[]; low: number }
export interface FolderGroup { id: SectionId; subs: SubGroup[]; count: number; low: number }

export const matchesQuery = (i: InventoryItem, q: string): boolean => {
  if (!q) return true;
  return [i.name, i.material_grade, i.supplier_name, i.manufacturer_sku].some((v) => v?.toLowerCase().includes(q));
};

/**
 * Only visible items and subfolders (welding follows the enabled processes). Without a search, every
 * visible subfolder is listed even when empty; with one, only sections that have matches. Items that
 * predate folders go to a final "Unsorted" section.
 */
export function buildTree(items: InventoryItem[], enabled: readonly ProcessCode[], query: string, lowOnly = false): FolderGroup[] {
  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => isItemVisible(i, enabled) && matchesQuery(i, q) && (!lowOnly || isLow(i)));
  const narrowed = q !== '' || lowOnly;
  const out: FolderGroup[] = [];

  for (const f of FOLDERS) {
    const subs: SubGroup[] = [];
    for (const s of f.subfolders) {
      if (!isSubfolderVisible(s, enabled)) continue;
      const list = shown.filter((i) => i.folder === f.id && i.subfolder === s.id);
      if (narrowed && !list.length) continue;
      subs.push({ id: s.id, items: list, low: list.filter(isLow).length });
    }
    if (!subs.length) continue;
    out.push({ id: f.id, subs, count: subs.reduce((n, s) => n + s.items.length, 0), low: subs.reduce((n, s) => n + s.low, 0) });
  }

  const loose = shown.filter((i) => !i.folder || !findSubfolder(i.folder, i.subfolder));
  if (loose.length) out.push({ id: UNSORTED, subs: [{ id: UNSORTED, items: loose, low: loose.filter(isLow).length }], count: loose.length, low: loose.filter(isLow).length });
  return out;
}

/** Folders and subfolders start open only when something in them is low, or when the user is searching. */
export const defaultOpen = (low: number, searching: boolean): boolean => searching || low > 0;
