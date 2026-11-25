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

describe('Stepper typed entry', () => {
  it('lets a person type a value, with a comma as the decimal mark', () => {
    const onChange = vi.fn();
    render(<Stepper value={1} step={0.5} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Type a value'));
    const box = screen.getByLabelText('Type a value');
    fireEvent.change(box, { target: { value: '12,5' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(12.5);
  });

  it('respects the maximum and ignores junk and Escape', () => {
    const onChange = vi.fn();
    render(<Stepper value={1} step={1} max={100} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Type a value'));
    let box = screen.getByLabelText('Type a value');
    fireEvent.change(box, { target: { value: '250' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(100);
    fireEvent.click(screen.getByLabelText('Type a value'));
    box = screen.getByLabelText('Type a value');
    fireEvent.change(box, { target: { value: 'abc' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.click(screen.getByLabelText('Type a value'));
    box = screen.getByLabelText('Type a value');
    fireEvent.change(box, { target: { value: '7' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('converts typed imperial values back to stored units', () => {
    const onChange = vi.fn();
    render(<Stepper value={1} step={0.5} onChange={onChange} display={(v) => ({ value: v * 2, unit: 'ft' })} />);
    fireEvent.click(screen.getByLabelText('Type a value'));
    const box = screen.getByLabelText('Type a value');
    fireEvent.change(box, { target: { value: '10' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(5);
  });
});
