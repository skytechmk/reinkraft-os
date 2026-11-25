import { afterEach, describe, expect, it } from 'vitest';
import { applyTenantTheme } from './theme';

const get = (name: string) => document.documentElement.style.getPropertyValue(name);

describe('applyTenantTheme', () => {
  afterEach(() => applyTenantTheme({}));

  it('sets the three colours from valid #RRGGBB values', () => {
    applyTenantTheme({ accent: '#00AAFF', ink: '#101010', plate: '#202020' });
    expect(get('--color-signal')).toBe('#00AAFF');
    expect(get('--color-ink')).toBe('#101010');
    expect(get('--color-plate')).toBe('#202020');
  });

  it('ignores anything that is not a six digit hex colour', () => {
    applyTenantTheme({ accent: 'red', ink: '#fff', plate: 'url(javascript:alert(1))' });
    expect(get('--color-signal')).toBe('');
    expect(get('--color-ink')).toBe('');
    expect(get('--color-plate')).toBe('');
  });

  it('removes overrides for keys that are no longer present, and keeps the others', () => {
    applyTenantTheme({ accent: '#00AAFF', ink: '#101010' });
    applyTenantTheme({ accent: '#112233' });
    expect(get('--color-signal')).toBe('#112233');
    expect(get('--color-ink')).toBe('');
  });

  it('copes with a missing theme', () => {
    applyTenantTheme({ accent: '#00AAFF' });
    applyTenantTheme(undefined);
    expect(get('--color-signal')).toBe('');
  });
});
