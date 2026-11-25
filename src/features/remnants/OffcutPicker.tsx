import { useState } from 'react';
import { useI18n } from '../../i18n';
import { enqueue } from '../../lib/offlineQueue';
import { newOpId } from '../../lib/supabase';
import { fmtLengthMm, lengthMm } from '../../domain/measure';
import { btn, btnPrimary } from '../../ui';
import { QtyStepper } from '../logging/QtyStepper';
import { OFFCUT_STEP_MM, offcutRange } from './offcut';

interface Props {
  /** the bar cut the offcut belongs to */
  logId: string;
  standardLengthMm: number;
  minRemnantMm: number;
  /** called right after the return is queued, so the screen can stop offering the same cut */
  onReturned: (logId: string) => void;
  onCancel: () => void;
}

/** Asks for the offcut length (stepper in mm, inches when imperial) and queues the return. */
export function OffcutPicker({ logId, standardLengthMm, minRemnantMm, onReturned, onCancel }: Props) {
  const { t } = useI18n();
  const range = offcutRange(standardLengthMm, minRemnantMm);
  const [len, setLen] = useState(range?.start ?? 0);

  if (!range) {
    return (
      <div className="rounded-[3px] bg-deck p-3">
        <p className="text-sm text-crit" role="alert">{t('workbench.offcutRangeBad')}</p>
        <button className={`${btn} mt-2`} onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    );
  }

  const confirm = () => {
    void enqueue('return_remnant', { p_client_op_id: newOpId(), p_log_id: logId, p_length_mm: len });
    onReturned(logId);
  };

  return (
    <div className="rounded-[3px] bg-deck p-3 shadow-[inset_0_0_0_1px_var(--color-rule)]">
      <p className="font-semibold">{t('workbench.offcutTitle')}</p>
      <p className="mb-3 text-sm text-mute">{t('workbench.offcutHint', { min: fmtLengthMm(range.min), max: fmtLengthMm(range.max) })}</p>
      <QtyStepper value={len} step={OFFCUT_STEP_MM} min={range.min} max={range.max} onChange={setLen} display={lengthMm}
        lessLabel={t('workbench.offcutShorter')} moreLabel={t('workbench.offcutLonger')} />
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <button className={`${btnPrimary} min-h-[56px]`} onClick={confirm}>{t('workbench.offcutConfirm', { length: fmtLengthMm(len) })}</button>
        <button className={btn} onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </div>
  );
}
