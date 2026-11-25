import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { enqueue } from '../../lib/offlineQueue';
import { newOpId } from '../../lib/supabase';
import { optimisticLog, optimisticUndo, optimisticWeld, isTemp } from '../../lib/optimistic';
import { useSettings } from '../../lib/api';
import type { InventoryItem, LogRow, Project, ProcessCode } from '../../lib/types';
import { categoryFor } from '../../domain/categories';
import { PROCESSES, PROCESS_LABELS, isItemVisible, isLow } from '../../domain/folders';
import { canSupplyWeld, weldConsumption } from '../../domain/weld';
import { convertQty, fmtLengthMm, fmtShown, weldCm } from '../../domain/measure';
import { fmtNum, stepFor } from '../../domain/units';
import { unitName } from '../../i18n/core';
import { Plate } from '../../components/Plate';
import { OffcutPicker } from '../remnants/OffcutPicker';
import { offcutRange } from '../remnants/offcut';
import { btn, chip } from '../../ui';
import { useI18n } from '../../i18n';

interface Props {
  project: Project;
  items: InventoryItem[];
  logs: LogRow[];
}

const DAILY_FOLDERS = ['ABRASIVES', 'CHEMICAL', 'WELDING'];
const DRAWER_FOLDERS = ['RAW', 'HARDWARE'];
/** one tap of the weld stepper, in centimetres */
const WELD_STEP_CM = 10;

/** Consumables counted every day: abrasives, chemicals, welding. Items from before folders are placed by their log category. */
const isDaily = (i: InventoryItem) => (i.folder ? DAILY_FOLDERS.includes(i.folder) : ['WELD', 'CONSUMABLE'].includes(categoryFor(i)));
/** Structural materials and hardware, kept in the drawer. Remnant pieces show only while some are left. */
const isDrawerItem = (i: InventoryItem) =>
  (i.folder ? DRAWER_FOLDERS.includes(i.folder) : ['MATERIAL', 'HARDWARE'].includes(categoryFor(i))) && (!i.is_remnant || i.qty_on_hand > 0);

/** Everything the counters do to the project log: tap, take back, and what is still being saved. */
function useProjectLogging(project: Project, logs: LogRow[], items: InventoryItem[]) {
  const qc = useQueryClient();
  const settings = useSettings();
  const rate = settings.data?.hourly_labor_rate ?? 0;
  const [undoBusy, setUndoBusy] = useState(false);
  const [returning, setReturning] = useState<Set<string>>(new Set());   // cuts whose offcut is queued but not yet saved
  const timer = useRef<number | undefined>(undefined);

  // once the outbox has saved everything, the queue state and the busy flag can go
  useEffect(() => {
    const onFlushed = () => { setUndoBusy(false); setReturning(new Set()); };
    window.addEventListener('outbox-flushed', onFlushed);
    return () => { window.removeEventListener('outbox-flushed', onFlushed); window.clearTimeout(timer.current); };
  }, []);

  const log = (item: InventoryItem | null, qty: number) => {
    const opId = newOpId();
    const category = item ? categoryFor(item) : 'LABOR';
    optimisticLog(qc, { opId, projectId: project.id, category, qty, description: item?.name ?? 'Working hours', unitCost: item ? item.last_buy_price : rate, itemId: item?.id ?? null });
    void enqueue('log_project_activity', {
      p_client_op_id: opId, p_project_id: project.id, p_category: category, p_qty: qty,
      p_description: item?.name ?? 'Working hours', p_inventory_id: item?.id ?? null, p_service_batch_id: null,
      p_charged_amount: null, p_payment_status: null,
    });
  };

  // the wire and gas rows of a weld are children: they are never the target of an undo, the weld is
  const top = (pred: (l: LogRow) => boolean) => (l: LogRow) => !l.parent_log_id && pred(l);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const logWeld = (process: ProcessCode, lengthCm: number) => {
    const opId = newOpId();
    const preset = settings.data?.process_config?.[process];
    const use = settings.data?.auto_consumption_enabled ? weldConsumption(preset, lengthCm, itemMap) : {};
    optimisticWeld(qc, { opId, projectId: project.id, process, lengthCm, rate: preset?.rate_per_cm ?? 0, use, items: itemMap });
    void enqueue('log_weld', { p_client_op_id: opId, p_project_id: project.id, p_process: process, p_length_cm: lengthCm });
  };
  const logSaw = (qty: number) => {
    const opId = newOpId();
    optimisticLog(qc, { opId, projectId: project.id, category: 'SAW_CUT', qty, description: 'Saw cuts', unitCost: settings.data?.saw_cut_rate ?? 0, itemId: null });
    void enqueue('log_project_activity', {
      p_client_op_id: opId, p_project_id: project.id, p_category: 'SAW_CUT', p_qty: qty, p_description: 'Saw cuts',
      p_inventory_id: null, p_service_batch_id: null, p_charged_amount: null, p_payment_status: null,
    });
  };

  const undo = (pred: (l: LogRow) => boolean) => {
    const last = logs.find(top(pred));
    if (!last || isTemp(last)) return;
    optimisticUndo(qc, last);
    void enqueue('undo_project_log', { p_log_id: last.id });
  };
  const canUndo = (pred: (l: LogRow) => boolean) => {
    const last = logs.find(top(pred));
    return !!last && !isTemp(last);
  };

  const lastLog = logs.find((l) => !l.parent_log_id);
  const saving = returning.size > 0;   // an offcut credit is queued but not in the list yet, so the newest row is stale
  const undoLastDisabled = !lastLog || isTemp(lastLog) || undoBusy || saving;
  const undoLast = () => {
    if (!lastLog || undoLastDisabled) return;
    setUndoBusy(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setUndoBusy(false), 2500);   // fallback if offline: the flush event never comes
    optimisticUndo(qc, lastLog);
    void enqueue('undo_project_log', { p_log_id: lastLog.id });
  };
  const markReturning = (logId: string) => setReturning((s) => new Set(s).add(logId));

  return { rate, log, logWeld, logSaw, itemMap, undo, canUndo, lastLog, saving, undoLastDisabled, undoLast, returning, markReturning };
}
type Logging = ReturnType<typeof useProjectLogging>;

/** One-tap counters: daily steppers, undo and remnant, and a drawer for raw materials and hardware. */
export function ProjectCounters({ project, items, logs }: Props) {
  const { t } = useI18n();
  const settings = useSettings();
  const enabled: readonly ProcessCode[] = settings.data?.enabled_processes ?? PROCESSES;
  const lg = useProjectLogging(project, logs, items);
  const [open, setOpen] = useState(false);

  const visible = items.filter((i) => isItemVisible(i, enabled));
  const daily = visible.filter(isDaily);
  const drawer = visible.filter(isDrawerItem);
  const consumed = (id: string) => logs.filter((l) => l.inventory_id === id && l.qty_delta < 0).reduce((s, l) => s - l.qty_delta, 0);
  const drawerUsed = drawer.filter((i) => consumed(i.id) > 0).length;

  return (
    <>
      <DailyRows logs={logs} items={daily} lg={lg} consumed={consumed} />
      <UndoRemnantBar logs={logs} items={items} lg={lg} minOffcut={settings.data?.min_remnant_length_mm ?? 500} />
      <section className="mb-3 rounded-[3px] bg-plate shadow-[inset_0_0_0_1px_var(--color-rule)]">
        <button type="button" className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 text-left font-display text-lg font-extrabold tracking-wide"
          aria-expanded={open} aria-controls="materials-drawer" onClick={() => setOpen((v) => !v)}>
          <span>{t('workbench.drawer')}</span>
          <span className="font-sans text-sm font-medium text-mute">{drawerUsed > 0 ? t('workbench.drawerUsed', { n: drawerUsed }) : ''} {open ? '▴' : '▾'}</span>
        </button>
        {open && (
          <div id="materials-drawer" className="border-t border-rule">
            {drawer.map((i) => <ItemRow key={i.id} item={i} logs={logs} lg={lg} consumed={consumed} />)}
            {!drawer.length && <p className="p-4 text-sm text-mute">{t('workbench.addMaterialsHint')}</p>}
          </div>
        )}
      </section>
    </>
  );
}

/**
 * The daily steppers: working hours, weld length and saw cuts (each only while its rate is switched on in
 * Settings), then the consumables.
 */
function DailyRows({ logs, items, lg, consumed }: { logs: LogRow[]; items: InventoryItem[]; lg: Logging; consumed: (id: string) => number }) {
  const { t } = useI18n();
  const settings = useSettings().data;
  const hours = logs.filter((l) => l.log_category === 'LABOR').reduce((s, l) => s + l.qty_delta, 0);
  const isLabour = (l: LogRow) => l.log_category === 'LABOR';
  return (
    <Plate title={t('workbench.daily')} flush>
      <Counter title={t('workbench.workingHours')} sub={t(lg.rate ? 'workbench.perTapHours' : 'workbench.perTapHoursNoRate')} value={hours} unit={t('workbench.unitH')}
        canPlus canMinus={lg.canUndo(isLabour)} onPlus={() => lg.log(null, 0.5)} onMinus={() => lg.undo(isLabour)} />
      {settings?.weld_rate_enabled && <WeldRow logs={logs} lg={lg} />}
      {settings?.saw_rate_enabled && (() => {
        const isSaw = (l: LogRow) => l.log_category === 'SAW_CUT';
        const cuts = logs.filter(isSaw).reduce((s, l) => s + l.qty_delta, 0);
        return <Counter title={t('workbench.sawCuts')} sub={t('workbench.sawPerTap')} value={cuts} canPlus canMinus={lg.canUndo(isSaw)} onPlus={() => lg.logSaw(1)} onMinus={() => lg.undo(isSaw)} />;
      })()}
      {items.map((i) => <ItemRow key={i.id} item={i} logs={logs} lg={lg} consumed={consumed} />)}
      {!items.length && <p className="p-4 text-sm text-mute">{t('workbench.addConsumablesHint')}</p>}
    </Plate>
  );
}

/** Weld length: pick the process, tap +10 cm. Billing and (optionally) wire and gas follow from Settings. */
function WeldRow({ logs, lg }: { logs: LogRow[]; lg: Logging }) {
  const { t } = useI18n();
  const settings = useSettings().data;
  const enabled = PROCESSES.filter((p) => settings?.enabled_processes?.includes(p));
  const [picked, setPicked] = useState<ProcessCode | null>(null);
  const process = picked && enabled.includes(picked) ? picked : enabled[0];
  const isWeld = (l: LogRow) => l.log_category === 'WELD_LENGTH';
  const total = weldCm(logs.filter(isWeld).reduce((s, l) => s + l.qty_delta, 0));
  const step = weldCm(WELD_STEP_CM);
  const preset = process ? settings?.process_config?.[process] : undefined;
  const use = settings?.auto_consumption_enabled ? weldConsumption(preset, WELD_STEP_CM, lg.itemMap) : {};
  const supplied = canSupplyWeld(use, lg.itemMap);
  const parts = [use.wire, use.gas].filter((x): x is { itemId: string; qty: number } => !!x)
    .map((x) => { const it = lg.itemMap.get(x.itemId); return it ? fmtShown(convertQty(x.qty, it.unit_label)) : ''; }).filter(Boolean).join(', ');
  return (
    <Counter
      title={t('workbench.weldLength')}
      sub={[t('workbench.weldPerTap', { step: fmtShown(step) }), parts ? t('workbench.weldUses', { parts }) : ''].filter(Boolean).join(' · ')}
      value={total.value}
      unit={unitName(total.unit)}
      canPlus={!!process && supplied}
      canMinus={lg.canUndo(isWeld)}
      onPlus={() => process && lg.logWeld(process, WELD_STEP_CM)}
      onMinus={() => lg.undo(isWeld)}
      extra={(
        <div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('workbench.process')}>
            {enabled.map((p) => (
              <button key={p} type="button" className={chip} data-on={p === process} aria-pressed={p === process} onClick={() => setPicked(p)}>{PROCESS_LABELS[p]}</button>
            ))}
          </div>
          {!supplied && <p className="mt-2 text-sm text-crit" role="status">{t('workbench.weldShort')}</p>}
        </div>
      )}
    />
  );
}

function ItemRow({ item: i, logs, lg, consumed }: { item: InventoryItem; logs: LogRow[]; lg: Logging; consumed: (id: string) => number }) {
  const { t } = useI18n();
  const stock = convertQty(i.qty_on_hand, i.unit_label);
  const step = convertQty(stepFor(i.unit_label), i.unit_label);
  const used = convertQty(consumed(i.id), i.unit_label);
  const forItem = (l: LogRow) => l.inventory_id === i.id && l.qty_delta < 0;
  const sub = i.is_remnant && i.remnant_length_mm
    ? t('workbench.remnantSub', { length: fmtLengthMm(i.remnant_length_mm), qty: fmtShown(stock) })
    : t('workbench.inStockPerTap', { qty: fmtShown(stock), step: fmtShown(step) });
  return (
    <Counter
      title={i.name}
      sub={sub}
      low={isLow(i)}
      value={used.value}
      unit={unitName(used.unit)}
      canPlus={i.qty_on_hand >= stepFor(i.unit_label)}
      canMinus={lg.canUndo(forItem) && !(i.standard_length_mm && lg.saving)}
      onPlus={() => lg.log(i, stepFor(i.unit_label))}
      onMinus={() => lg.undo(forItem)}
    />
  );
}

/** [ Undo ] and [ +Remnant ] side by side, with the offcut length panel under them. */
function UndoRemnantBar({ logs, items, lg, minOffcut }: { logs: LogRow[]; items: InventoryItem[]; lg: Logging; minOffcut: number }) {
  const { t } = useI18n();
  const [panel, setPanel] = useState(false);
  const [pickId, setPickId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  // bar cuts without an offcut credit, newest first, one entry per profile
  const credited = new Set(logs.map((l) => l.source_log_id).filter((x): x is string => !!x));
  const byId = new Map(items.map((i) => [i.id, i]));
  const open: { cut: LogRow; bar: InventoryItem }[] = [];
  for (const l of logs) {
    if (l.log_category !== 'MATERIAL' || l.qty_delta >= 0 || !l.inventory_id || credited.has(l.id) || lg.returning.has(l.id)) continue;
    const bar = byId.get(l.inventory_id);
    if (!bar || bar.is_remnant || !bar.standard_length_mm || !offcutRange(bar.standard_length_mm, minOffcut)) continue;
    if (!open.some((o) => o.bar.id === bar.id)) open.push({ cut: l, bar });
  }
  const ready = open.filter((o) => !isTemp(o.cut));
  const chosen = ready.find((o) => o.bar.id === pickId) ?? ready[0];
  const enabled = ready.length > 0;

  const { lastLog, saving } = lg;
  return (
    <div className="mb-3">
      <div className="grid grid-cols-2 gap-2">
        <button className={`${btn} min-h-[56px] text-base`} disabled={lg.undoLastDisabled} onClick={lg.undoLast}>{t('workbench.undo')}</button>
        <button className={`${btn} min-h-[56px] text-base`} disabled={!enabled} aria-expanded={panel && enabled} onClick={() => setPanel((v) => !v)}>{t('workbench.remnantButton')}</button>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2 text-sm text-mute">
        <p>
          {!lastLog ? t('workbench.undoNothing')
            : isTemp(lastLog) || saving ? t('workbench.undoSyncing')
            : t('workbench.undoLastWhat', { what: lastLog.description ?? lastLog.log_category })}
        </p>
        <p>{!enabled ? (open.length ? t('workbench.undoSyncing') : t('workbench.remnantNone')) : ''}</p>
      </div>
      {notice && <p className="mt-1 text-sm text-ok" role="status">{notice}</p>}
      {panel && enabled && chosen && (
        <div className="mt-2">
          {ready.length > 1 && (
            <div className="mb-2" role="group" aria-label={t('workbench.offcutProfile')}>
              <div className="flex flex-wrap gap-2">
                {ready.map((o) => (
                  <button key={o.bar.id} className="min-h-[48px] rounded-[3px] bg-deck px-3 text-sm font-medium shadow-[inset_0_0_0_1px_var(--color-rule)] data-[on=true]:text-signal data-[on=true]:shadow-[inset_0_0_0_2px_var(--color-signal)]"
                    data-on={o.bar.id === chosen.bar.id} aria-pressed={o.bar.id === chosen.bar.id} onClick={() => setPickId(o.bar.id)}>
                    {o.bar.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <OffcutPicker key={chosen.cut.id} logId={chosen.cut.id} standardLengthMm={chosen.bar.standard_length_mm as number} minRemnantMm={minOffcut}
            onCancel={() => setPanel(false)}
            onReturned={(id) => {
              lg.markReturning(id);
              setPanel(false);
              setNotice(t('workbench.remnantDone'));
              window.clearTimeout(noticeTimer.current);
              noticeTimer.current = window.setTimeout(() => setNotice(''), 4000);
            }} />
        </div>
      )}
    </div>
  );
}

function Counter(p: { title: string; sub?: string; low?: boolean; value: number; unit?: string; canPlus: boolean; canMinus: boolean; onPlus: () => void; onMinus: () => void; extra?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="border-b border-rule px-4 py-3 last:border-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold sm:truncate">{p.title}</p>
          {p.sub && <p className={`text-sm sm:truncate ${p.low ? 'text-crit' : 'text-mute'}`}>{p.sub}</p>}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
          <button className={`${btn} min-h-[56px] min-w-[56px] text-2xl`} disabled={!p.canMinus} onClick={p.onMinus} aria-label={t('workbench.undoLastOf', { name: p.title })}>−</button>
          <output className="num min-w-[96px] text-center text-5xl text-signal" aria-label={t('workbench.used', { name: p.title })}>
            {fmtNum(Number(p.value.toFixed(2)))}
            {p.unit && <span className="ml-1 font-sans text-sm font-medium text-mute">{p.unit}</span>}
          </output>
          <button className={`${btn} min-h-[56px] min-w-[56px] text-2xl`} disabled={!p.canPlus} onClick={p.onPlus} aria-label={t('workbench.addOneStep', { name: p.title })}>+</button>
        </div>
      </div>
      {p.extra && <div className="mt-3">{p.extra}</div>}
    </div>
  );
}
