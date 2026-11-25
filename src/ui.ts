// Shared Tailwind class strings. Touch targets are at least 48px. Panels are squared plates, not rounded cards.
export const card = 'rounded-[3px] bg-plate shadow-[inset_0_0_0_1px_var(--color-rule)] p-4 mb-3';
export const btn = 'min-h-[48px] px-4 rounded-[3px] font-semibold bg-raised text-bone transition-colors hover:bg-rule active:bg-signal active:text-ink disabled:pointer-events-none disabled:opacity-35';
export const btnPrimary = 'min-h-[48px] px-4 rounded-[3px] font-bold bg-signal text-ink transition hover:brightness-110 active:brightness-90 disabled:pointer-events-none disabled:opacity-40';
export const btnDanger = 'min-h-[48px] px-4 rounded-[3px] font-bold bg-crit text-white transition hover:brightness-110 active:brightness-90 disabled:pointer-events-none disabled:opacity-40';
export const chip = 'min-h-[48px] px-3 rounded-[3px] bg-raised text-sm font-medium shadow-[inset_0_0_0_1px_var(--color-rule)] transition-colors hover:bg-rule data-[on=true]:text-signal data-[on=true]:shadow-[inset_0_0_0_2px_var(--color-signal)] disabled:opacity-35';
export const input = 'min-h-[48px] w-full rounded-[3px] bg-ink px-3 text-bone shadow-[inset_0_0_0_1px_var(--color-rule)] outline-none placeholder:text-mute focus:shadow-[inset_0_0_0_2px_var(--color-signal)]';
export const label = 'text-sm text-mute';
