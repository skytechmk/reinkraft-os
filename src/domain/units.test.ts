import { describe, expect, it } from 'vitest';
import { fmtQty, round3, stepFor } from './units';

describe('unit steps', () => {
  it('uses the brief steps for each unit', () => {
    expect(stepFor('SHEET')).toBe(0.25);
    expect(stepFor('M')).toBe(0.5);
    expect(stepFor('BAR')).toBe(1);
    expect(stepFor('PCS')).toBe(1);
  });

  it('formats quantities without float noise', () => {
    expect(fmtQty(1.25, 'SHEET')).toBe('1.25 SHEET');
    expect(round3(0.1 + 0.2)).toBe(0.3);
  });
});
