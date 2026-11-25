import { describe, expect, it } from 'vitest';
import * as common from './messages/common';
import * as shell from './messages/shell';
import * as workspace from './messages/workspace';
import * as inventory from './messages/inventory';
import * as buys from './messages/buys';
import * as calendar from './messages/calendar';
import * as exportsMsgs from './messages/exports';
import * as settings from './messages/settings';
import * as invoices from './messages/invoices';
import * as docs from './messages/docs';
import * as workbench from './messages/workbench';
import { translate } from './index';

const modules = { common, shell, workspace, inventory, buys, calendar, exports: exportsMsgs, settings, invoices, docs, workbench };
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('translations', () => {
  for (const [name, m] of Object.entries(modules)) {
    const en = m.en as Record<string, string>;
    const mk = m.mk as Record<string, string>;

    it(`${name}: every English key has a Macedonian text with the same placeholders`, () => {
      for (const key of Object.keys(en)) {
        expect(mk[key], `${key} missing in mk`).toBeTruthy();
        expect(placeholders(mk[key]), `${key} placeholders differ`).toBe(placeholders(en[key]));
      }
      expect(Object.keys(mk).sort()).toEqual(Object.keys(en).sort());
    });

    it(`${name}: keys carry the module prefix`, () => {
      const prefix = name === 'common' ? /^(common|due)\./ : new RegExp(`^${name}\\.`);
      for (const key of Object.keys(en)) expect(key, key).toMatch(prefix);
    });
  }

  it('Macedonian text is Cyrillic wherever the English has letters (apart from short symbols)', () => {
    const offenders: string[] = [];
    for (const m of Object.values(modules)) {
      const en = m.en as Record<string, string>;
      const mk = m.mk as Record<string, string>;
      for (const [k, v] of Object.entries(en)) {
        const letters = v.replace(/\{\w+\}/g, '').match(/[A-Za-z]{3,}/g);
        if (letters && !/[Ѐ-ӿ]/.test(mk[k])) offenders.push(`${k}: ${mk[k]}`);
      }
    }
    // a handful of keys are intentionally Latin (file formats, brand, unit symbols)
    expect(offenders.length, offenders.join('\n')).toBeLessThan(6);
  });

  it('translate fills placeholders and falls back to the key for an unknown one', () => {
    expect(translate('mk', 'due.in', { n: 3 })).toBe('рок за 3 д');
    expect(translate('en', 'due.in', { n: 3 })).toBe('due in 3 d');
    expect(translate('en', 'no.such.key' as never)).toBe('no.such.key');
  });
});
