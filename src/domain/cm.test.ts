import { afterEach, describe, expect, it } from 'vitest';
import { convertQty, setActiveUnitSystem } from './measure';
import { stepFor } from './units';
import { unitName } from '../i18n/core';
import { FOLDERS } from './folders';

afterEach(() => setActiveUnitSystem('METRIC'));

describe('centimetres as an inventory unit', () => {
  it('stays centimetres in metric and shows inches in imperial', () => {
    expect(convertQty(50, 'CM')).toEqual({ value: 50, unit: 'CM' });
    setActiveUnitSystem('IMPERIAL');
    expect(convertQty(50, 'CM')).toEqual({ value: 19.7, unit: 'IN' });
  });
  it('steps by 5 and has names in both languages', () => {
    expect(stepFor('CM')).toBe(5);
    expect(unitName('CM', 'en')).toBe('CM');
    expect(unitName('CM', 'mk')).toBe('см');
  });
  it('is offered in the subfolders where lengths are common', () => {
    const offered = FOLDERS.flatMap((f) => f.subfolders).filter((s) => s.units.includes('CM')).map((s) => s.id);
    expect(offered).toEqual(expect.arrayContaining(['PROFILES', 'BEAMS', 'SHEETS', 'ROOFING', 'SLIDING']));
  });
});
