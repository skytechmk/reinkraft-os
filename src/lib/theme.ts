import type { Settings } from './types';

type Theme = Settings['tenant_theme'];

/** Tenant colour key -> the CSS custom property it overrides. */
const VARS = { accent: '--color-signal', ink: '--color-ink', plate: '--color-plate' } as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * White-label colours. Sets --color-signal / --color-ink / --color-plate on the root element from the
 * tenant theme, only for valid #RRGGBB values. A missing or invalid key removes its override, so the
 * built-in palette applies again.
 */
export function applyTenantTheme(theme: Theme | null | undefined): void {
  const style = document.documentElement.style;
  for (const [key, cssVar] of Object.entries(VARS) as [keyof typeof VARS, string][]) {
    const v = theme?.[key];
    if (typeof v === 'string' && HEX.test(v)) style.setProperty(cssVar, v);
    else style.removeProperty(cssVar);
  }
}
