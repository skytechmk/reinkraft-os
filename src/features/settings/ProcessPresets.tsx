import { useInventory } from '../../lib/api';
import type { InventoryItem, ProcessCode, Settings } from '../../lib/types';
import { PROCESSES, PROCESS_LABELS } from '../../domain/folders';
import { STARTING_PRESETS, type ProcessConfig, type ProcessPreset } from '../../domain/weld';
import { getUnitSystem } from '../../domain/measure';
import { Stepper } from '../../components/Stepper';
import { btn, chip, input, label } from '../../ui';
import { useI18n } from '../../i18n';

type Save = (patch: Partial<Settings>) => Promise<void> | void;

/** The weld rate per process is stored per centimetre; people on imperial see it per inch. */
export const rateDisplay = (currency: string) => (v: number) => ({ value: getUnitSystem() === 'IMPERIAL' ? Math.round(v * 2.54 * 100) / 100 : v, unit: currency });

function useProcessConfig(s: Settings, save: Save) {
  const cfg: ProcessConfig = s.process_config ?? {};
  return {
    cfg,
    patch: (p: ProcessCode, change: Partial<ProcessPreset>) => void save({ process_config: { ...cfg, [p]: { ...cfg[p], ...change } } }),
  };
}

/** ON/OFF pair used by the billing switches. */
export function OnOff({ on, onChange, name }: { on: boolean; onChange: (v: boolean) => void; name: string }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label={name}>
      <button type="button" className={chip} data-on={on} aria-pressed={on} onClick={() => onChange(true)}>{t('settings.billing.on')}</button>
      <button type="button" className={chip} data-on={!on} aria-pressed={!on} onClick={() => onChange(false)}>{t('settings.billing.off')}</button>
    </div>
  );
}

/** Weld rate per process: one stepper for each enabled process. Only shown while the weld rate is ON. */
export function WeldRates({ s, save, perUnit }: { s: Settings; save: Save; perUnit: string }) {
  const { t } = useI18n();
  const { cfg, patch } = useProcessConfig(s, save);
  const enabled = PROCESSES.filter((p) => s.enabled_processes.includes(p));
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-mute">{t('settings.billing.weldPerProcess', { unit: perUnit })}</p>
      {enabled.map((p) => (
        <div key={p}>
          <p className={`${label} mb-1`}>{PROCESS_LABELS[p]}</p>
          <Stepper value={cfg[p]?.rate_per_cm ?? 0} step={s.currency === 'MKD' ? 0.1 : 0.01} onChange={(v) => patch(p, { rate_per_cm: v })} display={rateDisplay(s.currency)} />
        </div>
      ))}
    </div>
  );
}

const isWire = (i: InventoryItem) => i.folder === 'WELDING' && i.unit_label === 'KG';
const isGas = (i: InventoryItem) => i.folder === 'WELDING' && (i.unit_label === 'L' || i.unit_label === 'ML');

/** Wire and gas assignment and consumption figures per process, for automatic deduction. */
export function ConsumptionPresets({ s, save }: { s: Settings; save: Save }) {
  const { t } = useI18n();
  const inv = useInventory();
  const { cfg, patch } = useProcessConfig(s, save);
  const items = inv.data ?? [];
  const enabled = PROCESSES.filter((p) => s.enabled_processes.includes(p));

  const Select = ({ p, field, options, name }: { p: ProcessCode; field: 'wire_item_id' | 'gas_item_id'; options: InventoryItem[]; name: string }) => (
    <div>
      <label className={label} htmlFor={`${p}-${field}`}>{name}</label>
      <select id={`${p}-${field}`} className={`${input} mt-1`} value={cfg[p]?.[field] ?? ''} onChange={(e) => patch(p, { [field]: e.target.value || undefined })}>
        <option value="">{t('settings.auto.notSet')}</option>
        {options.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
    </div>
  );

  const useStarting = (p: ProcessCode) => {
    const start = STARTING_PRESETS[p];
    if (!start) return;
    // PULSE and MAG share the filler and gas of MIG when they have none of their own yet
    const from = cfg.MIG ?? {};
    patch(p, {
      wire_g_per_m: start.wire_g_per_m, gas_l_per_m: start.gas_l_per_m,
      wire_item_id: cfg[p]?.wire_item_id ?? (p === 'PULSE' || p === 'MAG' ? from.wire_item_id : undefined),
      gas_item_id: cfg[p]?.gas_item_id ?? (p === 'PULSE' || p === 'MAG' ? from.gas_item_id : undefined),
    });
  };

  return (
    <div className="mt-4 space-y-5">
      <p className="text-sm text-mute">{t('settings.auto.process')}</p>
      {enabled.map((p) => {
        const hasPreset = !!STARTING_PRESETS[p];
        return (
          <div key={p} className="rounded-[3px] bg-deck p-3 shadow-[inset_0_0_0_1px_var(--color-rule)]">
            <p className="mb-2 font-display text-lg font-extrabold">{PROCESS_LABELS[p]}</p>
            {!hasPreset ? <p className="text-sm text-mute">{t('settings.auto.noFiller')}</p> : (
              <div className="space-y-3">
                <Select p={p} field="wire_item_id" options={items.filter(isWire)} name={t('settings.auto.wireItem')} />
                <div><p className={`${label} mb-1`}>{t('settings.auto.wirePerM')}</p><Stepper value={cfg[p]?.wire_g_per_m ?? 0} step={1} onChange={(v) => patch(p, { wire_g_per_m: v })} unit={t('settings.unit.gPerM')} /></div>
                <Select p={p} field="gas_item_id" options={items.filter(isGas)} name={t('settings.auto.gasItem')} />
                <div><p className={`${label} mb-1`}>{t('settings.auto.gasPerM')}</p><Stepper value={cfg[p]?.gas_l_per_m ?? 0} step={0.5} onChange={(v) => patch(p, { gas_l_per_m: v })} unit={t('settings.unit.lPerM')} /></div>
                <button type="button" className={btn} onClick={() => useStarting(p)}>{t('settings.auto.starting')}</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
