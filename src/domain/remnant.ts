// Remnant rules from the V1.0 brief. The SQL function return_remnant enforces the same rules.

export const REMNANT_PRESETS_MM = [1000, 1500, 2000, 2500] as const;

/** A remnant is allowed when it is at least the company minimum and shorter than a full bar. */
export function isRemnantAllowed(remnantMm: number, standardLengthMm: number, minRemnantMm: number): boolean {
  return remnantMm >= minRemnantMm && remnantMm < standardLengthMm;
}

/** Proportional credit for a returned remnant, from the bar's frozen unit cost. */
export function remnantCredit(unitCost: number, standardLengthMm: number, remnantMm: number): number {
  return Math.round(((unitCost * remnantMm) / standardLengthMm) * 10000) / 10000;
}
