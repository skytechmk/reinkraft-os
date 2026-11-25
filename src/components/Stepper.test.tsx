import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Stepper } from './Stepper';

describe('Stepper', () => {
  it('adds one step on [+]', () => {
    const onChange = vi.fn();
    render(<Stepper value={1} step={0.5} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('increase'));
    expect(onChange).toHaveBeenCalledWith(1.5);
  });

  it('never goes below the minimum on [-]', () => {
    const onChange = vi.fn();
    render(<Stepper value={0.5} step={0.5} min={0} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('decrease'));
    expect(onChange).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByLabelText('decrease'));
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('never goes above the maximum on [+]', () => {
    const onChange = vi.fn();
    render(<Stepper value={2} step={1} max={2} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('increase'));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
