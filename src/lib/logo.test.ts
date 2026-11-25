import { describe, expect, it } from 'vitest';
import { isSafeLogoDataUrl, MAX_LOGO_CHARS } from './logo';

describe('isSafeLogoDataUrl', () => {
  it('accepts small PNG and JPEG data URLs', () => {
    expect(isSafeLogoDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isSafeLogoDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true);
  });
  it('rejects anything that could carry script or load from elsewhere', () => {
    expect(isSafeLogoDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isSafeLogoDataUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeLogoDataUrl('https://example.com/logo.png')).toBe(false);
    expect(isSafeLogoDataUrl('data:image/png;base64,AAAA" onerror="x')).toBe(false);
    expect(isSafeLogoDataUrl(null)).toBe(false);
    expect(isSafeLogoDataUrl('')).toBe(false);
  });
  it('rejects oversized images', () => {
    expect(isSafeLogoDataUrl('data:image/png;base64,' + 'A'.repeat(MAX_LOGO_CHARS))).toBe(false);
  });
});
