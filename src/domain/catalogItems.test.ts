import { describe, expect, it } from 'vitest';
import { CATALOG, catalogFor } from './catalogItems';
import { FOLDERS, PROCESSES, findSubfolder } from './folders';

describe('catalog of standard items', () => {
  it('has an entry list for every subfolder of the blueprint, and nothing else', () => {
    const keys = FOLDERS.flatMap((f) => f.subfolders.map((s) => `${f.id}/${s.id}`)).sort();
    expect(Object.keys(CATALOG).sort()).toEqual(keys);
  });

  it('every subfolder offers at least four items', () => {
    for (const [k, list] of Object.entries(CATALOG)) expect(list.length, k).toBeGreaterThanOrEqual(4);
  });

  it('uses only units the subfolder allows and valid process tags', () => {
    for (const [k, list] of Object.entries(CATALOG)) {
      const [folder, sub] = k.split('/');
      const def = findSubfolder(folder, sub)!;
      for (const c of list) {
        expect(def.units, `${k}: ${c.en}`).toContain(c.unit);
        for (const tag of c.tags ?? []) expect(PROCESSES).toContain(tag);
      }
    }
  });

  it('has non-empty, unique names in both languages per subfolder', () => {
    for (const [k, list] of Object.entries(CATALOG)) {
      for (const lang of ['en', 'mk'] as const) {
        const names = list.map((c) => c[lang].trim());
        expect(names.every(Boolean), `${k} ${lang} empty`).toBe(true);
        expect(new Set(names).size, `${k} ${lang} duplicates`).toBe(names.length);
      }
    }
  });

  it('tags every welding item with processes, and only bar items carry a bar length', () => {
    for (const [k, list] of Object.entries(CATALOG)) {
      for (const c of list) {
        if (k.startsWith('WELDING/')) expect(c.tags?.length, `${k}: ${c.en}`).toBeGreaterThan(0);
        if (c.barLengthMm) expect(c.unit).toBe('BAR');
      }
    }
    expect(catalogFor('NOPE', 'NOPE')).toEqual([]);
  });
});
