import { describe, expect, it } from 'vitest';
import { isRemnantAllowed, remnantCredit, REMNANT_PRESETS_MM } from './remnant';

describe('remnant rules', () => {
  it('offers the four brief presets', () => {
    expect([...REMNANT_PRESETS_MM]).toEqual([1000, 1500, 2000, 2500]);
  });

  it('credits the proportional cost of the returned length', () => {
    expect(remnantCredit(12, 6000, 2000)).toBe(4);
    expect(remnantCredit(3.5, 3000, 1500)).toBe(1.75);
  });

  it('rejects remnants below the company minimum', () => {
    expect(isRemnantAllowed(1000, 6000, 1200)).toBe(false);
    expect(isRemnantAllowed(1000, 6000, 500)).toBe(true);
  });

  it('rejects a remnant that is not shorter than the bar', () => {
    expect(isRemnantAllowed(2500, 2500, 500)).toBe(false);
    expect(isRemnantAllowed(2500, 3000, 500)).toBe(true);
  });
});
