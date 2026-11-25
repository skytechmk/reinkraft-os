// Metric or imperial for DISPLAY only. Everything is stored in metric (mm, m, kg, L, ml); these
// helpers convert on the way to the screen, so records stay exact and switching is lossless.
import { getLocale, unitName } from '../i18n/core';

export type UnitSystem = 'METRIC' | 'IMPERIAL';

let active: UnitSystem = 'METRIC';
export const getUnitSystem = (): UnitSystem => active;
export const setActiveUnitSystem = (s: UnitSystem): void => { active = s; };

const MM_PER_IN = 25.4;
const M_PER_FT = 0.3048;
const KG_PER_LB = 0.45359237;
const L_PER_GAL = 3.785411784;
const ML_PER_FLOZ = 29.5735295625;
const FT2_PER_M2 = 10.763910417;

const trim = (n: number, digits = 2): number => Number(n.toFixed(digits));

/** A converted amount with the code of its unit (resolve it with unitName()). */
export interface Shown { value: number; unit: string }

export const fmtShown = (s: Shown): string =>
  `${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 3 }).format(s.value)} ${unitName(s.unit)}`;

/** An inventory quantity in its stored unit. Metres and millilitres convert; counts do not. */
export function convertQty(n: number, unit: string): Shown {
  if (active === 'IMPERIAL') {
    if (unit === 'M') return { value: trim(n / M_PER_FT), unit: 'FT' };
    if (unit === 'CM') return { value: trim(n / 2.54, 1), unit: 'IN' };
    if (unit === 'M2') return { value: trim(n * FT2_PER_M2), unit: 'FT2' };
    if (unit === 'KG') return { value: trim(n / KG_PER_LB), unit: 'LB' };
    if (unit === 'L') return { value: trim(n / L_PER_GAL), unit: 'GAL' };
    if (unit === 'ML') {
      const gal = n / (L_PER_GAL * 1000);
      return gal >= 1 ? { value: trim(gal), unit: 'GAL' } : { value: trim(n / ML_PER_FLOZ, 1), unit: 'FLOZ' };
    }
  }
  return { value: trim(n, 3), unit };
}

/** A length stored in millimetres: bar length, offcut, shortest offcut worth keeping. */
export function lengthMm(mm: number): Shown {
  if (active === 'IMPERIAL') {
    const inches = mm / MM_PER_IN;
    return inches < 24 ? { value: trim(inches, 1), unit: 'in' } : { value: trim(mm / (M_PER_FT * 1000)), unit: 'ft' };
  }
  return mm >= 1000 ? { value: trim(mm / 1000, 3), unit: 'm' } : { value: trim(mm, 1), unit: 'mm' };
}

/** A weld length stored in centimetres (the weld rate is per cm, or per inch when imperial). */
export const weldCm = (cm: number): Shown => (active === 'IMPERIAL' ? { value: trim(cm / 2.54, 1), unit: 'in' } : { value: trim(cm, 1), unit: 'cm' });

export const metres = (m: number): Shown => (active === 'IMPERIAL' ? { value: trim(m / M_PER_FT), unit: 'ft' } : { value: trim(m), unit: 'm' });
export const weightKg = (kg: number): Shown => (active === 'IMPERIAL' ? { value: trim(kg / KG_PER_LB), unit: 'lb' } : { value: trim(kg), unit: 'kg' });
export const areaM2 = (a: number): Shown => (active === 'IMPERIAL' ? { value: trim(a * FT2_PER_M2), unit: 'ft2' } : { value: trim(a), unit: 'm2' });
export const litres = (l: number): Shown => (active === 'IMPERIAL' ? { value: trim(l / L_PER_GAL), unit: 'gal' } : { value: trim(l), unit: 'l' });
/** kg per metre of profile */
export const weightPerM = (v: number): Shown => (active === 'IMPERIAL' ? { value: trim((v / KG_PER_LB) * M_PER_FT, 3), unit: 'lbft' } : { value: trim(v, 3), unit: 'kgm' });
/** painted square metres per metre of profile (square feet per foot) */
export const areaPerM = (v: number): Shown => (active === 'IMPERIAL' ? { value: trim(v / M_PER_FT, 3), unit: 'ft2ft' } : { value: trim(v, 3), unit: 'm2m' });
/** paint coverage: square metres per litre (square feet per gallon) */
export const coverage = (v: number): Shown => (active === 'IMPERIAL' ? { value: trim(v * FT2_PER_M2 * L_PER_GAL, 1), unit: 'ft2gal' } : { value: trim(v, 2), unit: 'm2l' });

export const fmtLengthMm = (mm: number): string => fmtShown(lengthMm(mm));
export const fmtMetres = (m: number): string => fmtShown(metres(m));
export const fmtWeightKg = (kg: number): string => fmtShown(weightKg(kg));
export const fmtAreaM2 = (a: number): string => fmtShown(areaM2(a));
export const fmtLitres = (l: number): string => fmtShown(litres(l));
export const fmtWeightPerM = (v: number): string => fmtShown(weightPerM(v));
export const fmtAreaPerM = (v: number): string => fmtShown(areaPerM(v));
export const fmtCoverage = (v: number): string => fmtShown(coverage(v));
