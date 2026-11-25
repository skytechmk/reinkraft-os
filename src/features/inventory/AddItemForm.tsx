import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useSettings } from '../../lib/api';
import type { FolderId, ProcessCode, Unit } from '../../lib/types';
import { Plate } from '../../components/Plate';
import { Stepper } from '../../components/Stepper';
import { FOLDERS, findSubfolder, isSubfolderVisible, itemTypeFor } from '../../domain/folders';
import { catalogFor, type CatalogItem } from '../../domain/catalogItems';
import { moneyStep, stepFor } from '../../domain/units';
import { areaPerM, convertQty, coverage as coverageShown, fmtLengthMm, weightPerM } from '../../domain/measure';
import { btnPrimary, chip, input, label } from '../../ui';
import { useI18n, type MessageKey } from '../../i18n';

const folderKey = (id: string) => `inventory.folder.${id}` as MessageKey;
const subKey = (id: string) => `inventory.sub.${id}` as MessageKey;

export function AddItemForm() {
  const { t, lang, unit: unitLabel } = useI18n();
  const settings = useSettings();
  const qc = useQueryClient();
  const enabled = settings.data?.enabled_processes ?? [];
  const cur = settings.data?.currency ?? 'EUR';

  const [folder, setFolder] = useState<FolderId>('RAW');
  const [sub, setSub] = useState('PROFILES');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<Unit>('BAR');
  const [grade, setGrade] = useState('');
  const [tags, setTags] = useState<ProcessCode[]>([]);
  const [barLen, setBarLen] = useState<number | null>(6000);
  const [minAlert, setMinAlert] = useState(1);
  const [cost, setCost] = useState(0);
  const [kgPerM, setKgPerM] = useState(0);
  const [m2PerM, setM2PerM] = useState(0);
  const [coverage, setCoverage] = useState(0);
  const [sup, setSup] = useState({ manufacturer_sku: '', supplier_name: '', supplier_contact: '' });
  const [msg, setMsg] = useState('');

  const folderDef = FOLDERS.find((f) => f.id === folder);
  // Offcuts are filed by the app when a bar is cut, not typed in here.
  const subs = useMemo(() => (folderDef?.subfolders ?? []).filter((s) => s.id !== 'REMNANTS' && isSubfolderVisible(s, enabled)), [folderDef, enabled]);
  const subDef = findSubfolder(folder, sub);
  const standard = catalogFor(folder, sub);
  const isProfile = folder === 'RAW' && sub === 'PROFILES';

  const pickFolder = (f: FolderId) => {
    const first = FOLDERS.find((x) => x.id === f)?.subfolders.find((s) => s.id !== 'REMNANTS' && isSubfolderVisible(s, enabled));
    setFolder(f);
    if (first) pickSub(f, first.id);
  };
  const pickSub = (f: FolderId, s: string) => {
    const u = findSubfolder(f, s)?.units[0] ?? 'PCS';
    setSub(s); setUnit(u); setMinAlert(stepFor(u)); setTags([]); setGrade('');
    setBarLen(u === 'BAR' ? 6000 : null);
  };
  const pickStandard = (c: CatalogItem) => {
    setName(lang === 'mk' ? c.mk : c.en);
    setUnit(c.unit); setMinAlert(stepFor(c.unit)); setGrade(c.grade ?? ''); setTags(c.tags ?? []);
    setBarLen(c.unit === 'BAR' ? (c.barLengthMm ?? 6000) : null);
  };
  const pickUnit = (u: Unit) => {
    setUnit(u); setMinAlert(stepFor(u));
    setBarLen(u === 'BAR' ? (barLen ?? 6000) : null);
  };

  const create = async () => {
    if (!settings.data || !name.trim()) return;
    const clean = (v: string) => v.trim() || null;
    const { error } = await supabase.from('inventory').insert({
      company_id: settings.data.company_id, name: name.trim(), folder, subfolder: sub, item_type: itemTypeFor(folder, sub),
      unit_label: unit, process_tags: tags, last_buy_price: cost, min_alert_qty: minAlert, material_grade: clean(grade),
      standard_length_mm: isProfile && unit === 'BAR' ? barLen : null,
      weight_kg_per_m: isProfile && kgPerM > 0 ? kgPerM : null,
      surface_m2_per_m: isProfile && m2PerM > 0 ? m2PerM : null,
      coverage_m2_per_l: folder === 'CHEMICAL' && sub === 'PAINTS' && coverage > 0 ? coverage : null,
      manufacturer_sku: clean(sup.manufacturer_sku), supplier_name: clean(sup.supplier_name), supplier_contact: clean(sup.supplier_contact),
    });
    if (error) return setMsg(error.message);
    setName(''); setGrade(''); setTags([]); setCost(0);
    setMsg(t('inventory.added'));
    void qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  return (
    <Plate title={t('inventory.addItem')} className="lg:sticky lg:top-24">
      <div className="space-y-4">
        <div>
          <p className={label}>{t('inventory.folderLabel')}</p>
          <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label={t('inventory.folderLabel')}>
            {FOLDERS.map((f) => <button key={f.id} type="button" className={chip} data-on={f.id === folder} aria-pressed={f.id === folder} onClick={() => pickFolder(f.id)}>{t(folderKey(f.id))}</button>)}
          </div>
        </div>
        <div>
          <p className={label}>{t('inventory.subfolderLabel')}</p>
          <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label={t('inventory.subfolderLabel')}>
            {subs.map((s) => <button key={s.id} type="button" className={chip} data-on={s.id === sub} aria-pressed={s.id === sub} onClick={() => pickSub(folder, s.id)}>{t(subKey(s.id))}</button>)}
          </div>
        </div>
        {standard.length > 0 && (
          <div>
            <p className={label}>{t('inventory.standardItems')}</p>
            <p className="text-xs text-mute">{t('inventory.standardHint')}</p>
            <div className="mt-1 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
              {standard.map((c) => {
                const n = lang === 'mk' ? c.mk : c.en;
                return <button key={c.en} type="button" className={chip} data-on={name === n} onClick={() => pickStandard(c)}>{n}</button>;
              })}
            </div>
          </div>
        )}
        <div>
          <label className={label} htmlFor="iname">{t('inventory.name')}</label>
          <input id="iname" className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <p className={label}>{t('inventory.countedIn')}</p>
          <div className="mt-1 flex flex-wrap gap-2">{(subDef?.units ?? []).map((u) => <button key={u} type="button" className={chip} data-on={u === unit} aria-pressed={u === unit} onClick={() => pickUnit(u)}>{unitLabel(u)}</button>)}</div>
        </div>
        {isProfile && unit === 'BAR' && (
          <div>
            <p className={label}>{t('inventory.barLengthLabel')}</p>
            <div className="mt-1 grid grid-cols-2 gap-2">{[3000, 6000].map((l) => <button key={l} type="button" className={chip} data-on={barLen === l} aria-pressed={barLen === l} onClick={() => setBarLen(l)}>{fmtLengthMm(l)}</button>)}</div>
          </div>
        )}
        {isProfile && (
          <>
            <div><p className={`${label} mb-1`}>{t('inventory.weightPerM')}</p><Stepper value={kgPerM} step={0.1} onChange={setKgPerM} display={weightPerM} /></div>
            <div><p className={`${label} mb-1`}>{t('inventory.surfacePerM')}</p><Stepper value={m2PerM} step={0.01} onChange={setM2PerM} display={areaPerM} /></div>
          </>
        )}
        {folder === 'CHEMICAL' && sub === 'PAINTS' && <div><p className={`${label} mb-1`}>{t('inventory.paintCoverage')}</p><Stepper value={coverage} step={1} onChange={setCoverage} display={coverageShown} /></div>}
        <div><p className={`${label} mb-1`}>{t('inventory.warnAt')}</p><Stepper value={minAlert} step={stepFor(unit)} onChange={setMinAlert} display={(v) => convertQty(v, unit)} /></div>
        <div><p className={`${label} mb-1`}>{t('inventory.unitCost')}</p><Stepper value={cost} step={moneyStep(cur)} onChange={setCost} unit={cur} /></div>

        <details className="rounded-[3px] shadow-[inset_0_0_0_1px_var(--color-rule)]">
          <summary className="flex min-h-[48px] cursor-pointer items-center px-3 text-sm font-semibold">{t('inventory.supplier')}</summary>
          <div className="space-y-3 p-3 pt-0">
            {([['manufacturer_sku', 'inventory.supplier.sku'], ['supplier_name', 'inventory.supplier.name'], ['supplier_contact', 'inventory.supplier.contact']] as const).map(([f, k]) => (
              <div key={f}>
                <label className={label} htmlFor={`add-${f}`}>{t(k)}</label>
                <input id={`add-${f}`} className={`${input} mt-1`} value={sup[f]} onChange={(e) => setSup({ ...sup, [f]: e.target.value })} />
              </div>
            ))}
          </div>
        </details>

        <p className="text-sm text-mute">{t('inventory.stockStartsAtZero')}</p>
        <button className={`${btnPrimary} w-full`} onClick={create} disabled={!name.trim()}>{t('inventory.saveItem')}</button>
        {msg && <p className="text-sm text-mute" role="status">{msg}</p>}
      </div>
    </Plate>
  );
}
