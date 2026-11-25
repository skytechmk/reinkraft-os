import { useState } from 'react';
import { input } from '../ui';

/** Parses what a person typed. Accepts a comma as the decimal mark. Returns null for anything that is not a number of zero or more. */
export function parseTyped(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
}

interface Props {
  /** what the box starts with */
  initial: string;
  label: string;
  onCommit: (n: number) => void;
  onCancel: () => void;
  className?: string;
}

/** A big number box for typing a value by hand. Enter or leaving the box confirms, Escape cancels. */
export function NumberEntry({ initial, label, onCommit, onCancel, className = '' }: Props) {
  const [text, setText] = useState(initial);
  const [done, setDone] = useState(false);
  const finish = (ok: boolean) => {
    if (done) return;
    setDone(true);
    const n = parseTyped(text);
    if (ok && n !== null) onCommit(n); else onCancel();
  };
  return (
    <input
      autoFocus
      inputMode="decimal"
      aria-label={label}
      className={`${input} num text-center text-3xl ${className}`}
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
    />
  );
}
