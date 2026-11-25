import { useState } from 'react';
import { useI18n } from '../i18n';
import { NumberEntry } from './NumberEntry';
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

/** Large [-] / [+] stepper. Tap the number to type a value by hand. */
export function Stepper({ value, step, min = 0, max, onChange, unit, disabled = false, display }: Props) {
  const { t } = useI18n();
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min, round3(v)));
  const [typing, setTyping] = useState(false);
  // what is shown per stored unit (1 when nothing is converted): what the person types is in shown units
  const factor = display ? display(1000).value / 1000 || 1 : 1;
  const shown = display ? display(value).value : value;
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" className={`${btn} min-w-[56px] text-2xl`} disabled={disabled} onClick={() => onChange(clamp(value - step))} aria-label={t('shell.stepper.decrease')}>
        −
      </button>
      {typing ? (
        <NumberEntry
          initial={String(shown)}
          label={t('shell.stepper.type')}
          className="min-w-[110px] flex-1"
          onCommit={(n) => { onChange(clamp(n / factor)); setTyping(false); }}
          onCancel={() => setTyping(false)}
        />
      ) : (
        <button type="button" className="min-h-[48px] min-w-[110px] flex-1 rounded-[3px] text-center hover:bg-raised disabled:pointer-events-none" disabled={disabled} onClick={() => setTyping(true)} aria-label={t('shell.stepper.type')}>
          <output className="num text-4xl">
            {fmtNum(shown)}
            {(display || unit) && <span className="ml-1 font-sans text-sm font-medium text-mute">{display ? unitName(display(value).unit) : unit}</span>}
          </output>
        </button>
      )}
      <button type="button" className={`${btn} min-w-[56px] text-2xl`} disabled={disabled} onClick={() => onChange(clamp(value + step))} aria-label={t('shell.stepper.increase')}>
        +
      </button>
    </div>
  );
}
