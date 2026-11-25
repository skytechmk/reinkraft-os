import type { Unit } from '../lib/types';

export type Lang = 'en' | 'mk';
export type Params = Record<string, string | number>;

// Module-level "active" language so plain functions (number, money and unit formatting) follow the UI
// language without being hooks. The provider keeps it in sync before children render.
let active: Lang = 'en';
export const getLang = (): Lang => active;
export const setActiveLang = (l: Lang): void => { active = l; };

export const LOCALES: Record<Lang, string> = { en: 'en-GB', mk: 'mk-MK' };
export const getLocale = (): string => LOCALES[active];

export function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_m, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

/**
 * Names of units and measurement symbols as shown to people.
 * UPPERCASE keys are inventory units (what an item is counted in); lowercase keys are measurement
 * symbols used when a quantity is converted for display (metric or imperial).
 */
export const UNIT_NAMES: Record<Lang, Record<string, string>> = {
  en: {
    PCS: 'PCS', BAR: 'BAR', SHEET: 'SHEET', ML: 'ML', M: 'M', CM: 'CM', IN: 'IN', BOX: 'BOX', M2: 'M²', KG: 'KG', L: 'L', FT: 'FT', FT2: 'FT²', LB: 'LB', FLOZ: 'FL OZ', GAL: 'GAL',
    mm: 'mm', cm: 'cm', m: 'm', in: 'in', ft: 'ft', kg: 'kg', lb: 'lb', m2: 'm²', ft2: 'ft²', l: 'L', gal: 'gal', floz: 'fl oz',
    kgm: 'kg/m', lbft: 'lb/ft', m2m: 'm²/m', ft2ft: 'ft²/ft', m2l: 'm²/L', ft2gal: 'ft²/gal',
  },
  mk: {
    PCS: 'ком', BAR: 'шипка', SHEET: 'лим', ML: 'мл', M: 'м', CM: 'см', IN: 'in', BOX: 'кутија', M2: 'м²', KG: 'кг', L: 'л', FT: 'ft', FT2: 'ft²', LB: 'lb', FLOZ: 'fl oz', GAL: 'gal',
    mm: 'мм', cm: 'см', m: 'м', in: 'in', ft: 'ft', kg: 'кг', lb: 'lb', m2: 'м²', ft2: 'ft²', l: 'л', gal: 'gal', floz: 'fl oz',
    kgm: 'кг/м', lbft: 'lb/ft', m2m: 'м²/м', ft2ft: 'ft²/ft', m2l: 'м²/л', ft2gal: 'ft²/gal',
  },
};

export function unitName(unit: Unit | string, lang: Lang = active): string {
  return UNIT_NAMES[lang][unit] ?? unit;
}
