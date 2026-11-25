import { describe, expect, it } from 'vitest';
import { FOLDERS, isItemVisible, isLow, isSubfolderVisible, itemTypeFor, findSubfolder } from './folders';

const base = { process_tags: [] as never[] };

describe('inventory folders', () => {
  it('has the five folders of the blueprint, with the units it lists', () => {
    expect(FOLDERS.map((f) => f.id)).toEqual(['RAW', 'HARDWARE', 'ABRASIVES', 'CHEMICAL', 'WELDING']);
    expect(findSubfolder('RAW', 'PROFILES')?.units).toEqual(['BAR', 'M', 'CM']);
    expect(findSubfolder('RAW', 'REMNANTS')?.units).toEqual(['PCS']);
    expect(findSubfolder('CHEMICAL', 'THINNERS')?.units).toEqual(['L', 'ML', 'PCS']);
  });

  it('hides welding subfolders whose process is switched off, and counts PULSE for MIG/MAG', () => {
    const migMag = findSubfolder('WELDING', 'MIG_MAG')!;
    const tig = findSubfolder('WELDING', 'TIG')!;
    expect(isSubfolderVisible(migMag, ['MMA'])).toBe(false);
    expect(isSubfolderVisible(migMag, ['PULSE'])).toBe(true);
    expect(isSubfolderVisible(tig, ['TIG_ACDC'])).toBe(true);
    expect(isSubfolderVisible(findSubfolder('RAW', 'PROFILES')!, [])).toBe(true);
  });

  it('shows an item by its own process tags first, then by its subfolder, and never hides non-welding items', () => {
    expect(isItemVisible({ ...base, folder: 'WELDING', subfolder: 'TIG', process_tags: ['TIG_DC'] }, ['TIG_ACDC'])).toBe(false);
    expect(isItemVisible({ ...base, folder: 'WELDING', subfolder: 'TIG', process_tags: ['TIG_DC'] }, ['TIG_DC'])).toBe(true);
    expect(isItemVisible({ ...base, folder: 'WELDING', subfolder: 'TIG' }, ['TIG_ACDC'])).toBe(true);
    expect(isItemVisible({ ...base, folder: 'WELDING', subfolder: 'MMA' }, ['MIG'])).toBe(false);
    expect(isItemVisible({ ...base, folder: 'ABRASIVES', subfolder: 'DISCS' }, [])).toBe(true);
    expect(isItemVisible({ ...base, folder: null, subfolder: null }, [])).toBe(true);   // created before folders existed
  });

  it('keeps the legacy item type in step with the folder', () => {
    expect(itemTypeFor('RAW', 'PROFILES')).toBe('PROFILE');
    expect(itemTypeFor('RAW', 'LEXAN')).toBe('SHEET');
    expect(itemTypeFor('CHEMICAL', 'PAINTS')).toBe('CHEMICAL');
    expect(itemTypeFor('WELDING', 'MMA')).toBe('CONSUMABLE');
    expect(itemTypeFor('HARDWARE', 'GATES')).toBe('CUSTOM');
  });

  it('flags low stock the same way everywhere and ignores offcuts', () => {
    expect(isLow({ qty_on_hand: 4, min_alert_qty: 5, is_remnant: false })).toBe(true);
    expect(isLow({ qty_on_hand: 5, min_alert_qty: 5, is_remnant: false })).toBe(true);
    expect(isLow({ qty_on_hand: 6, min_alert_qty: 5, is_remnant: false })).toBe(false);
    expect(isLow({ qty_on_hand: 0, min_alert_qty: 5, is_remnant: true })).toBe(false);
  });
});
