import { unitName } from '../../i18n/core';
import { btn } from '../../ui';
import { fmtNum, round3 } from '../../domain/units';
import type { Shown } from '../../domain/measure';

interface Props {
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** Show the stored value converted (metric to imperial). Steps stay in stored units. */
  display: (v: number) => Shown;
  lessLabel: string;
  moreLabel: string;
}

/** Big [-] value [+] stepper with an LED readout. Values are clamped to [min, max]; no typing. */
export function QtyStepper({ value, step, min, max, onChange, display, lessLabel, moreLabel }: Props) {
  const clamp = (v: number) => Math.min(max, Math.max(min, round3(v)));
  const shown = display(value);
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" className={`${btn} min-h-[56px] min-w-[56px] text-2xl`} disabled={value <= min} onClick={() => onChange(clamp(value - step))} aria-label={lessLabel}>−</button>
      <output className="num min-w-[110px] text-center text-4xl text-signal">
        {fmtNum(shown.value)}
        <span className="ml-1 font-sans text-sm font-medium text-mute">{unitName(shown.unit)}</span>
      </output>
      <button type="button" className={`${btn} min-h-[56px] min-w-[56px] text-2xl`} disabled={value >= max} onClick={() => onChange(clamp(value + step))} aria-label={moreLabel}>+</button>
    </div>
  );
}
