import { useI18n } from '../i18n';
import { btn } from '../ui';
import { fmtNum, round3 } from '../domain/units';
import { unitName } from '../i18n/core';
import type { Shown } from '../domain/measure';

interface Props {
  value: number;
  step: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  unit?: string;
  disabled?: boolean;
  /** Show the stored value converted (metric to imperial). Steps stay in stored units, so nothing needs converting back. */
  display?: (v: number) => Shown;
}

/** Large [-] / [+] stepper. No free typing for quantities. */
export function Stepper({ value, step, min = 0, max, onChange, unit, disabled = false, display }: Props) {
  const { t } = useI18n();
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min, round3(v)));
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" className={`${btn} min-w-[56px] text-2xl`} disabled={disabled} onClick={() => onChange(clamp(value - step))} aria-label={t('shell.stepper.decrease')}>
        −
      </button>
      <output className="num min-w-[110px] text-center text-4xl">
        {fmtNum(display ? display(value).value : value)}
        {(display || unit) && <span className="ml-1 font-sans text-sm font-medium text-mute">{display ? unitName(display(value).unit) : unit}</span>}
      </output>
      <button type="button" className={`${btn} min-w-[56px] text-2xl`} disabled={disabled} onClick={() => onChange(clamp(value + step))} aria-label={t('shell.stepper.increase')}>
        +
      </button>
    </div>
  );
}
