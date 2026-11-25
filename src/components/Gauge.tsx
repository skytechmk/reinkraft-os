import { useI18n } from '../i18n';

interface Props {
  value: number;
  max: number;
  /** alert level shown as a white notch */
  marker?: number;
  tone?: 'ok' | 'signal' | 'crit';
  label?: string;
}

const COLOR = { ok: 'var(--color-ok)', signal: 'var(--color-signal)', crit: 'var(--color-crit)' } as const;

/** Tick-mark gauge for stock levels, payment progress and margin. */
export function Gauge({ value, max, marker, tone = 'ok', label }: Props) {
  const { t } = useI18n();
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / (max || 1)) * 100))}%`;
  return (
    <div className="gauge" role="img" aria-label={label ?? t('shell.gauge.percent', { n: Math.round((value / (max || 1)) * 100) })} style={{ ['--g' as string]: COLOR[tone] }}>
      <i style={{ width: pct(value) }} />
      {marker !== undefined && <b style={{ left: pct(marker) }} />}
    </div>
  );
}
