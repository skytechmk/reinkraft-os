import { useMemo, useState } from 'react';
import type { InventoryItem, LogRow, Project, Settings } from '../../lib/types';
import { computeTotals, paintLitres } from '../../domain/calc';
import { summarizeConsumption } from '../../domain/summary';
import { fmtMoney, moneyStep } from '../../domain/units';
import { fmtAreaM2, fmtLitres, fmtMetres, fmtWeightKg } from '../../domain/measure';
import { Plate } from '../../components/Plate';
import { Gauge } from '../../components/Gauge';
import { Stepper } from '../../components/Stepper';
import { btn } from '../../ui';
import { useI18n } from '../../i18n';
import { useProjectUpdate } from './useProjectUpdate';
import { ProjectPrintBar } from './ProjectPrintBar';

interface Props {
  project: Project;
  items: InventoryItem[];
  logs: LogRow[];
  settings: Settings;
}

/**
 * Right column, top to bottom: what this project took out of stock, the steel and paint maths, the
 * private profit breakdown (for the owner only) and, at the very bottom, the two print buttons.
 */
export function ProjectFinance({ project, items, logs, settings }: Props) {
  const { t: tr } = useI18n();
  const update = useProjectUpdate();
  const [error, setError] = useState('');
  const cur = settings.currency;
  const step = moneyStep(cur);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const t = useMemo(() => computeTotals(logs, itemsById, settings.weld_consumable_markup_pct), [logs, itemsById, settings.weld_consumable_markup_pct]);
  const used = useMemo(() => summarizeConsumption(logs, items), [logs, items]);

  const price = project.quoted_price ?? 0;
  const margin = price - t.total;
  const balance = Math.max(0, price - project.advance_paid);
  const litres = paintLitres(t.paintM2, items);

  const save = async (patch: Partial<Project>) => setError((await update(project.id, patch)) ?? '');

  return (
    <div>
      <Plate title={tr('workspace.summaryTitle')}>
        <dl className="grid grid-cols-3 gap-2">
          <Readout name={tr('workspace.summaryBars')} value={String(used.bars)} />
          <Readout name={tr('workspace.summaryGas')} value={fmtLitres(used.gasLitres)} />
          <Readout name={tr('workspace.summaryWire')} value={fmtWeightKg(used.wireKg)} />
        </dl>
        <p className="mt-2 text-sm text-mute">{tr('workspace.summaryHint')}</p>
      </Plate>

      <Plate title={tr('workspace.calculatorsTitle')}>
        <Row name={tr('workspace.steelUsed')} value={fmtMetres(t.metres)} />
        <Row name={tr('workspace.weight')} value={fmtWeightKg(t.weightKg)} />
        <Row name={tr('workspace.surfaceToPaint')} value={fmtAreaM2(t.paintM2)} />
        <Row name={tr('workspace.paintNeeded')} value={litres !== null ? fmtLitres(litres) : tr('workspace.addPaintCoverage')} />
        <p className="mt-2 text-sm text-mute">{tr('workspace.needsWeightSurface')}</p>
      </Plate>

      <Plate
        title={tr('workspace.privateTitle')}
        right={<span className="rounded-[2px] bg-raised px-2 py-0.5 text-xs font-bold tracking-wide text-signal">{tr('workspace.privateBadge')}</span>}
      >
        <dl className="mb-4 grid grid-cols-3 gap-2">
          <Readout name={tr('workspace.privateCost')} value={fmtMoney(t.total, cur, 0)} />
          <Readout name={tr('workspace.privateQuote')} value={fmtMoney(price, cur, 0)} />
          <Readout name={tr('workspace.privateNet')} value={`${margin >= 0 ? '+' : ''}${fmtMoney(margin, cur, 0)}`} tone={margin >= 0 ? 'text-ok' : 'text-crit'} />
        </dl>

        <Row name={tr('workspace.rowLabour')} value={fmtMoney(t.labour, cur)} />
        <Row name={tr('workspace.rowMaterials')} value={fmtMoney(t.material, cur)} />
        <Row name={tr('workspace.rowWeldWireGas')} value={fmtMoney(t.weld, cur)} />
        <Row name={tr('workspace.rowConsumablesHardware')} value={fmtMoney(t.consumables + t.hardware, cur)} />
        <Row name={tr('workspace.totalCost')} value={fmtMoney(t.total, cur)} strong />

        <div className="mt-4 rounded-[3px] bg-deck p-3 shadow-[inset_0_0_0_1px_var(--color-rule)]">
          <p className="text-sm text-mute">{tr('workspace.suggestedPrice', { pct: settings.weld_consumable_markup_pct })}</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="num text-2xl">{fmtMoney(t.suggestedPrice, cur)}</span>
            <button className={btn} disabled={t.suggestedPrice <= 0 || t.suggestedPrice === price} onClick={() => void save({ quoted_price: Math.round(t.suggestedPrice) })}>{tr('workspace.use')}</button>
          </div>
        </div>

        <p className="mb-1 mt-4 text-sm text-mute">{tr('workspace.clientPrice')}</p>
        <Stepper value={price} step={step} onChange={(v) => void save({ quoted_price: v })} unit={cur} />
        <p className="mb-1 mt-4 text-sm text-mute">{tr('workspace.advancePaidLabel')}</p>
        <Stepper value={project.advance_paid} step={step} onChange={(v) => void save({ advance_paid: v })} unit={cur} />
        <Row name={tr('workspace.balanceDue')} value={fmtMoney(balance, cur)} strong />

        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-mute">{tr('workspace.margin')}</span>
            <span className={`num text-2xl ${margin >= 0 ? 'text-ok' : 'text-crit'}`}>{margin >= 0 ? '+' : ''}{fmtMoney(margin, cur)}</span>
          </div>
          {price > 0 ? (
            <>
              <div className="mt-2"><Gauge value={Math.max(0, margin)} max={price} tone={margin >= 0 ? 'ok' : 'crit'} label={tr('workspace.marginShare')} /></div>
              <p className="mt-1 text-sm text-mute">{tr('workspace.marginPct', { pct: Math.round((margin / price) * 100) })}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-mute">{tr('workspace.setPriceForMargin')}</p>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-crit" role="alert">{error}</p>}
      </Plate>

      <ProjectPrintBar project={project} settings={settings} items={items} logs={logs} />
    </div>
  );
}

function Readout({ name, value, tone = '' }: { name: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-[3px] bg-deck px-2 py-3 text-center shadow-[inset_0_0_0_1px_var(--color-rule)]">
      <dd className={`num truncate text-lg ${tone}`}>{value}</dd>
      <dt className="mt-1 text-xs text-mute">{name}</dt>
    </div>
  );
}

function Row({ name, value, strong }: { name: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 border-b border-rule py-2 last:border-0 ${strong ? 'font-bold' : 'text-bone/80'}`}>
      <span>{name}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}
