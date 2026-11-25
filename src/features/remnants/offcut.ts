import { isRemnantAllowed } from '../../domain/remnant';

export const OFFCUT_STEP_MM = 100;
const OFFCUT_DEFAULT_MM = 1000;

export interface OffcutRange { min: number; max: number; start: number }

/** Offcut lengths for a bar: at least the company minimum, at most the bar length minus one step. null when no length fits. */
export function offcutRange(barMm: number, minRemnantMm: number): OffcutRange | null {
  const max = barMm - OFFCUT_STEP_MM;
  const min = Math.max(minRemnantMm, OFFCUT_STEP_MM);
  if (min > max || !isRemnantAllowed(min, barMm, minRemnantMm) || !isRemnantAllowed(max, barMm, minRemnantMm)) return null;
  return { min, max, start: Math.min(max, Math.max(min, OFFCUT_DEFAULT_MM)) };
}
