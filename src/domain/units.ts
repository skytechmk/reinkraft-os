import type { Unit } from '../lib/types';
import { getLocale } from '../i18n/core';
import { fmtShown, convertQty } from './measure';

/** One tap on [+] or [-] moves this much for each unit. */
export function stepFor(unit: Unit): number {
  switch (unit) {
    case 'SHEET': return 0.25;   // +1/4 sheet
    case 'M': return 0.5;        // +0.5 m
    case 'CM': return 5;         // +5 cm
    case 'ML': return 100;
    case 'M2': return 0.5;
    case 'KG': return 0.5;
    case 'L': return 0.5;
    default: return 1;           // PCS, BAR, BOX
  }
}

/** A quantity with its unit, converted to the chosen measuring system (counts are not converted). */
export function fmtQty(n: number, unit: string): string {
  return fmtShown(convertQty(n, unit));
}

export function fmtMoney(n: number, currency: string, digits = 2): string {
  return new Intl.NumberFormat(getLocale(), { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Tap size for money steppers (client price, advance). */
export const moneyStep = (currency: string): number => (currency === 'MKD' ? 500 : 50);

/** Plain number with thousands separators, no float noise. */
export function fmtNum(n: number): string {
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 3 }).format(n);
}
