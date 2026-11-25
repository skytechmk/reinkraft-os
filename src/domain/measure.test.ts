import { afterEach, describe, expect, it } from 'vitest';
import { convertQty, fmtAreaM2, fmtCoverage, fmtLengthMm, fmtLitres, fmtMetres, fmtWeightKg, fmtWeightPerM, setActiveUnitSystem } from './measure';
import { fmtQty } from './units';

afterEach(() => setActiveUnitSystem('METRIC'));

describe('metric display (the default)', () => {
  it('shows lengths in mm below a metre and in m above', () => {
    expect(fmtLengthMm(500)).toBe('500 mm');
    expect(fmtLengthMm(1500)).toBe('1.5 m');
    expect(fmtLengthMm(6000)).toBe('6 m');
  });
  it('leaves counts and metric quantities alone', () => {
    expect(fmtQty(48, 'M')).toBe('48 M');
    expect(fmtQty(1.25, 'SHEET')).toBe('1.25 SHEET');
    expect(fmtWeightKg(43.89)).toBe('43.89 kg');
  });
});

describe('imperial display', () => {
  it('converts lengths, using inches for short pieces and feet for long ones', () => {
    setActiveUnitSystem('IMPERIAL');
    expect(fmtLengthMm(500)).toBe('19.7 in');
    expect(fmtLengthMm(1000)).toBe('3.28 ft');
    expect(fmtLengthMm(6000)).toBe('19.69 ft');
    expect(fmtMetres(10)).toBe('32.81 ft');
  });
  it('converts weight, area, volume and the per-metre figures', () => {
    setActiveUnitSystem('IMPERIAL');
    expect(fmtWeightKg(10)).toBe('22.05 lb');
    expect(fmtAreaM2(1)).toBe('10.76 ft²');
    expect(fmtLitres(3.785411784)).toBe('1 gal');
    expect(fmtWeightPerM(2.31)).toBe('1.552 lb/ft');
    expect(fmtCoverage(8)).toBe('325.97 ft²/gal'.replace('325.97', String(Math.round(8 * 10.763910417 * 3.785411784 * 10) / 10)));
  });
  it('shows metre and millilitre items in feet, fl oz or gallons, but never converts counts', () => {
    setActiveUnitSystem('IMPERIAL');
    expect(convertQty(48, 'M')).toEqual({ value: 157.48, unit: 'FT' });
    expect(convertQty(100, 'ML')).toEqual({ value: 3.4, unit: 'FLOZ' });
    expect(convertQty(15600, 'ML')).toEqual({ value: 4.12, unit: 'GAL' });
    expect(convertQty(3, 'BAR')).toEqual({ value: 3, unit: 'BAR' });
    expect(fmtQty(48, 'M')).toBe('157.48 FT');
  });
  it('is lossless: switching back shows the same stored value', () => {
    setActiveUnitSystem('IMPERIAL');
    const imperial = convertQty(48, 'M');
    setActiveUnitSystem('METRIC');
    expect(convertQty(48, 'M')).toEqual({ value: 48, unit: 'M' });
    expect(imperial.unit).toBe('FT');
  });
});
