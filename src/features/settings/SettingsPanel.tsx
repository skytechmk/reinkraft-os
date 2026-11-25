import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useSettings } from '../../lib/api';
import type { ProcessCode, Settings } from '../../lib/types';
import { PROCESSES } from '../../domain/folders';
import { downloadBackup } from '../../lib/backup';
import { ExportsPanel } from '../exports/ExportsPanel';
import { isSafeLogoDataUrl, resizeLogo } from '../../lib/logo';
import { lengthMm, weldCm } from '../../domain/measure';
import { unitName } from '../../i18n/core';
import { ConsumptionPresets, OnOff, WeldRates } from './ProcessPresets';
import { useI18n, type MessageKey } from '../../i18n';
import { Plate } from '../../components/Plate';
import { Stepper } from '../../components/Stepper';
import { btn, btnDanger, btnPrimary, chip, input, label } from '../../ui';

const PROCESS_NAMES: Record<ProcessCode, string> = { MIG: 'MIG', MAG: 'MAG', TIG_DC: 'TIG DC', TIG_ACDC: 'TIG AC/DC', PULSE: 'PULSE', MMA: 'MMA', PLASMA: 'PLASMA', LASER: 'LASER' };
const VAT_PRESETS = [0, 18];
const CURRENCIES: Settings['currency'][] = ['EUR', 'USD', 'MKD'];
const LOGO_ERRORS: Record<string, MessageKey> = {
  LOGO_NOT_AN_IMAGE: 'settings.logo.errType',
  LOGO_TOO_LARGE: 'settings.logo.errSize',
  LOGO_UNREADABLE: 'settings.logo.errRead',
};

/** Rates that drive every cost and price, and the company details and logo printed on invoices. */
export function SettingsPanel() {
  const { t } = useI18n();
  const settings = useSettings();
  const qc = useQueryClient();
  const s = settings.data;
  const [msg, setMsg] = useState('');
  const [logoMsg, setLogoMsg] = useState('');
  const [address, setAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState('');
  const [bank, setBank] = useState('');
  const [terms, setTerms] = useState('');
  const [customVat, setCustomVat] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');

  useEffect(() => {
    if (!s) return;
    setAddress(s.company_address ?? '');
    setTaxId(s.company_tax_id ?? '');
    setPhone(s.company_phone ?? '');
    setBank(s.company_bank_account ?? '');
    setTerms(s.payment_terms ?? '');
    setCustomVat(!VAT_PRESETS.includes(s.default_vat_pct));
  }, [s?.company_id]); // eslint-disable-line react-hooks/exhaustive-deps -- load once per company, not on every keystroke save

  if (!s) return <p className="text-mute">{t('settings.loading')}</p>;

  const save = async (patch: Partial<Settings>, onOk?: () => void) => {
    qc.setQueryData<Settings>(['settings'], (old) => (old ? { ...old, ...patch } : old));
    const { error } = await supabase.from('company_settings').update(patch).eq('company_id', s.company_id);
    if (error) {
      void qc.invalidateQueries({ queryKey: ['settings'] });
      setMsg(t('settings.saveFailed', { error: error.message }));
    } else {
      setMsg(t('common.saved'));
      onOk?.();
    }
  };

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await resizeLogo(file);
      await save({ logo_data_url: dataUrl }, () => setLogoMsg(t('settings.logo.saved')));
    } catch (e) {
      setLogoMsg(t(LOGO_ERRORS[(e as Error).message] ?? 'settings.logo.errRead'));
    }
  };

  const toggleProcess = (p: ProcessCode) =>
    void save({ enabled_processes: s.enabled_processes.includes(p) ? s.enabled_processes.filter((x) => x !== p) : [...s.enabled_processes, p] });

  const exportBackup = async () => {
    setBackupBusy(true);
    setBackupMsg('');
    try {
      await downloadBackup();
      setBackupMsg(t('settings.backup.done'));
    } catch (e) {
      setBackupMsg(t('settings.backup.failed', { error: (e as Error).message }));
    } finally {
      setBackupBusy(false);
    }
  };

  const vatCustom = customVat || !VAT_PRESETS.includes(s.default_vat_pct);
  const rateStep = s.currency === 'MKD' ? 50 : 1;
  const logo = isSafeLogoDataUrl(s.logo_data_url) ? s.logo_data_url : null;

  return (
    <div className="mx-auto max-w-2xl">
      {msg && <p className="mb-3 text-sm text-mute" role="status">{msg}</p>}

      <Plate title={t('settings.group.units')}>
        <p className="mb-2 text-sm text-mute">{t('settings.units')}</p>
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={t('settings.units')}>
          {(['METRIC', 'IMPERIAL'] as const).map((u) => (
            <button key={u} className={chip} data-on={s.unit_system === u} aria-pressed={s.unit_system === u} onClick={() => void save({ unit_system: u })}>
              {t(u === 'METRIC' ? 'settings.units.metric' : 'settings.units.imperial')}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-mute">{t('settings.units.note')}</p>

        <p className="mb-2 mt-5 text-sm text-mute">{t('settings.currency')}</p>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('settings.currency')}>
          {CURRENCIES.map((c) => (
            <button key={c} className={chip} data-on={s.currency === c} aria-pressed={s.currency === c} onClick={() => void save({ currency: c })}>{c}</button>
          ))}
        </div>
        <p className="mt-2 text-sm text-mute">{t('settings.currencyNote')}</p>

        <p className="mb-2 mt-5 text-sm text-mute">{t('settings.vatDefault')}</p>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('settings.vatDefault')}>
          {VAT_PRESETS.map((v) => (
            <button key={v} className={chip} data-on={!vatCustom && s.default_vat_pct === v} aria-pressed={!vatCustom && s.default_vat_pct === v} onClick={() => { setCustomVat(false); void save({ default_vat_pct: v }); }}>{v}%</button>
          ))}
          <button className={chip} data-on={vatCustom} aria-pressed={vatCustom} onClick={() => setCustomVat(true)}>{t('settings.vat.custom')}</button>
        </div>
        {vatCustom && (
          <div className="mt-3">
            <p className="mb-1 text-sm text-mute">{t('settings.vat.customLabel')}</p>
            <Stepper value={s.default_vat_pct} step={1} max={100} onChange={(v) => void save({ default_vat_pct: v })} unit="%" />
          </div>
        )}
      </Plate>

      <Plate title={t('settings.group.processes')}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t('settings.group.processes')}>
          {PROCESSES.map((p) => {
            const on = s.enabled_processes.includes(p);
            return <button key={p} className={chip} data-on={on} aria-pressed={on} onClick={() => toggleProcess(p)}>{PROCESS_NAMES[p]}</button>;
          })}
        </div>
        <p className="mt-2 text-sm text-mute">{t('settings.processes.note')}</p>
        {s.enabled_processes.includes('PULSE') && <p className="mt-1 text-sm text-signal">{t('settings.processes.pulse')}</p>}
      </Plate>

      <Plate title={t('settings.group.billing')}>
        <p className="mb-1 text-sm text-mute">{t('settings.labourRate')}</p>
        <Stepper value={s.hourly_labor_rate} step={rateStep} onChange={(v) => void save({ hourly_labor_rate: v })} unit={s.currency} />
        <p className="mt-1 text-sm text-mute">{t('settings.billing.always')}</p>

        <p className="mb-2 mt-6 font-semibold">{t('settings.billing.weld')}</p>
        <OnOff on={!!s.weld_rate_enabled} onChange={(v) => void save({ weld_rate_enabled: v })} name={t('settings.billing.weld')} />
        <p className="mt-2 text-sm text-mute">{t('settings.billing.weldNote', { unit: unitName(weldCm(1).unit) })}</p>
        {s.weld_rate_enabled && <WeldRates s={s} save={save} perUnit={unitName(weldCm(1).unit)} />}

        <p className="mb-2 mt-6 font-semibold">{t('settings.billing.saw')}</p>
        <OnOff on={!!s.saw_rate_enabled} onChange={(v) => void save({ saw_rate_enabled: v })} name={t('settings.billing.saw')} />
        <p className="mt-2 text-sm text-mute">{t('settings.billing.sawNote')}</p>
        {s.saw_rate_enabled && (
          <div className="mt-3">
            <p className="mb-1 text-sm text-mute">{t('settings.billing.sawRate')}</p>
            <Stepper value={s.saw_cut_rate ?? 0} step={rateStep} onChange={(v) => void save({ saw_cut_rate: v })} unit={s.currency} />
          </div>
        )}
      </Plate>

      <Plate title={t('settings.group.thresholds')}>
        <p className="mb-1 text-sm text-mute">{t('settings.markup')}</p>
        <Stepper value={s.weld_consumable_markup_pct} step={5} max={300} onChange={(v) => void save({ weld_consumable_markup_pct: v })} unit="%" />
        <p className="mt-1 text-sm text-mute">{t('settings.markup.note')}</p>

        <p className="mb-2 mt-6 font-semibold">{t('settings.auto.title')}</p>
        <OnOff on={!!s.auto_consumption_enabled} onChange={(v) => void save({ auto_consumption_enabled: v })} name={t('settings.auto.title')} />
        <p className="mt-2 text-sm text-mute">{t('settings.auto.note')}</p>
        {s.auto_consumption_enabled && <ConsumptionPresets s={s} save={save} />}
        <p className="mb-1 mt-5 text-sm text-mute">{t('settings.minOffcut')}</p>
        <Stepper value={s.min_remnant_length_mm} step={100} min={100} max={2000} onChange={(v) => void save({ min_remnant_length_mm: v })} display={lengthMm} />
        <button className={`${btn} mt-5 w-full`} onClick={() => void exportBackup()} disabled={backupBusy}>
          {'💾 '}{backupBusy ? t('settings.backup.busy') : t('settings.backup.export')}
        </button>
        <p className="mt-2 text-sm text-mute">{t('settings.backup.note')}</p>
        {backupMsg && <p className="mt-2 text-sm text-mute" role="status">{backupMsg}</p>}
      </Plate>

      <Plate title={t('settings.group.company')}>
        <p className={label}>{t('settings.logo')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <div className="flex min-h-[96px] min-w-[160px] items-center justify-center rounded-[3px] bg-white p-3">
            {logo ? <img src={logo} alt={t('settings.logo.alt')} className="max-h-20 max-w-[220px]" /> : <span className="text-sm text-neutral-500">{t('settings.logo.none')}</span>}
          </div>
          <div className="flex flex-col gap-2">
            <label className={`${btnPrimary} inline-flex cursor-pointer items-center justify-center`} htmlFor="logo-file">
              {logo ? t('settings.logo.replace') : t('settings.logo.upload')}
            </label>
            <input id="logo-file" type="file" accept="image/*" className="sr-only" onChange={(e) => { void onLogo(e.target.files?.[0]); e.target.value = ''; }} />
            {logo && <button className={btnDanger} onClick={() => void save({ logo_data_url: null }, () => setLogoMsg(''))}>{t('settings.logo.remove')}</button>}
          </div>
        </div>
        <p className="mt-2 text-sm text-mute">{t('settings.logo.help')}</p>
        {logoMsg && <p className="mt-2 text-sm text-mute" role="status">{logoMsg}</p>}

        <div className="mt-5 space-y-3">
          <div>
            <label className={label} htmlFor="co-address">{t('settings.address')}</label>
            <textarea id="co-address" rows={2} className={`${input} mt-1 py-2`} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="co-tax">{t('settings.taxId')}</label>
              <input id="co-tax" className={`${input} mt-1`} value={taxId} onChange={(e) => setTaxId(e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="co-phone">{t('settings.phone')}</label>
              <input id="co-phone" className={`${input} mt-1`} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={label} htmlFor="co-bank">{t('settings.bank')}</label>
            <textarea id="co-bank" rows={2} className={`${input} mt-1 py-2`} value={bank} onChange={(e) => setBank(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="co-terms">{t('settings.paymentTerms')}</label>
            <textarea id="co-terms" rows={3} className={`${input} mt-1 py-2`} value={terms} onChange={(e) => setTerms(e.target.value)} />
            <p className="mt-1 text-sm text-mute">{t('settings.paymentTerms.help')}</p>
          </div>
          <button
            className={`${btn} w-full`}
            onClick={() => void save(
              { company_address: address.trim() || null, company_tax_id: taxId.trim() || null, company_phone: phone.trim() || null, company_bank_account: bank.trim() || null, payment_terms: terms.trim() || null },
              () => setMsg(t('settings.detailsSaved')),
            )}
          >
            {t('settings.saveDetails')}
          </button>
        </div>
      </Plate>

      <details className="mb-3 rounded-[3px] bg-plate shadow-[inset_0_0_0_1px_var(--color-rule)]">
        <summary className="flex min-h-[48px] cursor-pointer items-center px-4 font-display text-lg font-extrabold">{t('settings.group.reports')}</summary>
        <div className="p-4 pt-0"><ExportsPanel /></div>
      </details>
    </div>
  );
}
