import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('quotes commas, quotes and newlines, and leaves plain cells alone', () => {
    const out = toCsv([['a', 'b,c', 'say "hi"', 'x\ny'], [1, null, 2.5, 'ok']]);
    expect(out.replace('﻿', '')).toBe('a,"b,c","say ""hi""","x\ny"\r\n1,,2.5,ok');
  });
  it('starts with a byte order mark so Excel reads UTF-8', () => {
    expect(toCsv([['Порта']]).charCodeAt(0)).toBe(0xfeff);
  });
});
