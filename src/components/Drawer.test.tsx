import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Drawer } from './Drawer';

describe('Drawer', () => {
  const setup = () => {
    const onClose = vi.fn();
    const opener = createRef<HTMLButtonElement>();
    render(
      <>
        <button ref={opener}>open</button>
        <Drawer label="Projects" closeLabel="Close the projects list" onClose={onClose} returnFocusTo={opener}>
          <button>one</button>
        </Drawer>
      </>,
    );
    return { onClose, opener };
  };

  it('is a modal dialog and takes focus when it opens', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Projects' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(dialog);
  });

  it('closes on Esc, on the backdrop and on a swipe to the left', () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByLabelText('Close the projects list'));
    const dialog = screen.getByRole('dialog');
    fireEvent.touchStart(dialog, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 80, clientY: 110 }] });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close on a short swipe or a vertical scroll', () => {
    const { onClose } = setup();
    const dialog = screen.getByRole('dialog');
    fireEvent.touchStart(dialog, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 170, clientY: 100 }] });
    fireEvent.touchStart(dialog, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 120, clientY: 400 }] });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('gives focus back to the opener when it unmounts', () => {
    const opener = createRef<HTMLButtonElement>();
    const { rerender } = render(
      <>
        <button ref={opener}>open</button>
        <Drawer label="Projects" closeLabel="x" onClose={() => {}} returnFocusTo={opener}><button>one</button></Drawer>
      </>,
    );
    rerender(<button ref={opener}>open</button>);
    expect(document.activeElement).toBe(opener.current);
  });
});
