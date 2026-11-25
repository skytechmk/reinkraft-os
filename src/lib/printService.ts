// Prints an HTML fragment through a hidden iframe with A4/thermal-safe CSS.
// Forces white background and black text so ink and thermal paper stay legible.

export const PRINT_CSS = `
  @page { size: A4; margin: 14mm; }
  html, body { background: #FFFFFF !important; color: #000000 !important; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.35; }
  h1 { font-size: 18pt; margin: 0 0 2mm; }
  h2 { font-size: 14pt; margin: 6mm 0 2mm; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0; }
  th, td { border-bottom: 1px solid #000000; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { border-bottom: 2px solid #000000; font-size: 10pt; }
  .r { text-align: right; white-space: nowrap; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10mm; margin-bottom: 8mm; }
  .logo { max-height: 22mm; max-width: 60mm; display: block; margin-bottom: 3mm; }
  .small { font-size: 9.5pt; }
  .notice { border: 2px solid #000000; padding: 2mm 3mm; font-weight: bold; margin-bottom: 5mm; }
  .totals { width: 55%; margin-left: auto; }
  .totals td { border-bottom: 1px solid #000000; }
  .grand td { font-weight: bold; border-top: 2px solid #000000; font-size: 12pt; }
  .no-print { display: none !important; }
`;

export function printHtml(title: string, bodyHtml: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    throw new Error('Print frame unavailable');
  }

  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`);
  doc.close();

  win.focus();
  win.onafterprint = () => frame.remove();
  // allow layout to settle before opening the print dialog
  setTimeout(() => {
    win.print();
    setTimeout(() => frame.remove(), 60_000); // fallback cleanup
  }, 150);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}
