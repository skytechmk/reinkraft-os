import { useEffect, useRef, type ReactNode, type RefObject, type TouchEvent } from 'react';

interface Props {
  /** accessible name of the dialog */
  label: string;
  closeLabel: string;
  onClose: () => void;
  /** where focus goes back to when the drawer closes (the button that opened it) */
  returnFocusTo: RefObject<HTMLElement | null>;
  children: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Side drawer from the left edge (portrait phone). A modal dialog: focus moves in on open and back to
 * the opener on close, Esc closes, Tab stays inside, a tap on the backdrop or a swipe to the left closes.
 */
export function Drawer({ label, closeLabel, onClose, returnFocusTo, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = returnFocusTo.current;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const els = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [returnFocusTo]);

  const onTouchStart = (e: TouchEvent) => { start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: TouchEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (dx < -60 && Math.abs(dy) < Math.abs(dx)) onClose();
  };

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" tabIndex={-1} aria-label={closeLabel} className="absolute inset-0 h-full w-full cursor-default bg-black/60" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="drawer-in absolute inset-y-0 left-0 flex w-[88vw] max-w-sm flex-col bg-ink p-3 shadow-[inset_-1px_0_0_var(--color-rule)] outline-none"
      >
        {children}
      </div>
    </div>
  );
}
