// The two-level inventory structure from the blueprint: five folders, each with subfolders that
// say which units make sense. Folder and subfolder ids are what the database stores; the names
// shown to people live in the message files (inventory.folder.* and inventory.subfolder.*).
import type { FolderId, InventoryItem, ProcessCode, Unit } from '../lib/types';

export const PROCESSES: ProcessCode[] = ['MIG', 'MAG', 'TIG_DC', 'TIG_ACDC', 'PULSE', 'MMA', 'PLASMA', 'LASER'];

/** Names as printed on the machines, the same in every language. */
export const PROCESS_LABELS: Record<ProcessCode, string> = {
  MIG: 'MIG', MAG: 'MAG', TIG_DC: 'TIG DC', TIG_ACDC: 'TIG AC/DC', PULSE: 'PULSE', MMA: 'MMA', PLASMA: 'PLASMA', LASER: 'LASER',
};

export interface SubfolderDef {
  id: string;
  units: Unit[];
  /** shown only when at least one of these processes is switched on in Settings */
  processes?: ProcessCode[];
}
export interface FolderDef { id: FolderId; subfolders: SubfolderDef[] }

export const FOLDERS: FolderDef[] = [
  { id: 'RAW', subfolders: [
    { id: 'PROFILES', units: ['BAR', 'M'] },
    { id: 'BEAMS', units: ['BAR', 'M'] },
    { id: 'SHEETS', units: ['SHEET', 'M2', 'KG'] },
    { id: 'ROOFING', units: ['M2', 'M', 'SHEET'] },
    { id: 'LEXAN', units: ['SHEET', 'M2'] },
    { id: 'REMNANTS', units: ['PCS'] },
  ] },
  { id: 'HARDWARE', subfolders: [
    { id: 'GATES', units: ['PCS'] },
    { id: 'SLIDING', units: ['PCS', 'M'] },
    { id: 'CAPS', units: ['PCS'] },
    { id: 'FASTENERS', units: ['PCS', 'BOX'] },
  ] },
  { id: 'ABRASIVES', subfolders: [
    { id: 'DISCS', units: ['PCS', 'BOX'] },
    { id: 'FLAP', units: ['PCS', 'BOX'] },
    { id: 'DRILLING', units: ['PCS'] },
  ] },
  { id: 'CHEMICAL', subfolders: [
    { id: 'PAINTS', units: ['L', 'KG', 'PCS'] },
    { id: 'THINNERS', units: ['L', 'ML', 'PCS'] },
  ] },
  { id: 'WELDING', subfolders: [
    { id: 'MIG_MAG', units: ['KG', 'L', 'PCS'], processes: ['MIG', 'MAG', 'PULSE'] },
    { id: 'TIG', units: ['KG', 'L', 'PCS'], processes: ['TIG_DC', 'TIG_ACDC'] },
    { id: 'MMA', units: ['KG', 'BOX', 'PCS'], processes: ['MMA'] },
    { id: 'PLASMA', units: ['PCS'], processes: ['PLASMA'] },
    { id: 'LASER', units: ['PCS', 'L', 'M'], processes: ['LASER'] },
  ] },
];

export const findFolder = (id: string | null | undefined): FolderDef | undefined => FOLDERS.find((f) => f.id === id);
export const findSubfolder = (folder: string | null | undefined, sub: string | null | undefined): SubfolderDef | undefined =>
  findFolder(folder)?.subfolders.find((s) => s.id === sub);

export function isSubfolderVisible(sub: SubfolderDef, enabled: readonly ProcessCode[]): boolean {
  return !sub.processes || sub.processes.some((p) => enabled.includes(p));
}

/**
 * Whether an inventory item is shown. Switching a welding process off hides its consumables from the
 * inventory and from every quick-picker. Items without tags (and everything outside the welding
 * folder) are always shown, and so are items that predate folders.
 */
export function isItemVisible(item: Pick<InventoryItem, 'folder' | 'subfolder' | 'process_tags'>, enabled: readonly ProcessCode[]): boolean {
  if (item.folder !== 'WELDING') return true;
  if (item.process_tags?.length) return item.process_tags.some((p) => enabled.includes(p));
  const sub = findSubfolder(item.folder, item.subfolder);
  return sub ? isSubfolderVisible(sub, enabled) : true;
}

/** The legacy item_type column the database still requires, chosen from the folder. */
export function itemTypeFor(folder: FolderId, subfolder: string): InventoryItem['item_type'] {
  if (folder === 'RAW') return subfolder === 'PROFILES' || subfolder === 'BEAMS' || subfolder === 'REMNANTS' ? 'PROFILE' : 'SHEET';
  if (folder === 'CHEMICAL') return 'CHEMICAL';
  if (folder === 'ABRASIVES' || folder === 'WELDING') return 'CONSUMABLE';
  return 'CUSTOM';
}

/** Items below their alert level. The one rule used by the menu badge, the alert panel and the sheets. */
export const isLow = (i: Pick<InventoryItem, 'qty_on_hand' | 'min_alert_qty' | 'is_remnant'>): boolean =>
  !i.is_remnant && i.qty_on_hand <= i.min_alert_qty;
