import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import './index.css';
import { useI18n, type MessageKey } from './i18n';
import { supabase, newOpId } from './lib/supabase';
import { flush } from './lib/offlineQueue';
import { useInventory, useOutboxSync, useProjects, useSettings, useSystemProjectId } from './lib/api';
import { setActiveUnitSystem, type UnitSystem } from './domain/measure';
import { isLow } from './domain/folders';
import { applyTenantTheme } from './lib/theme';
import type { Settings } from './lib/types';
import { LoginScreen } from './features/login/LoginScreen';
import { QuickServiceModal } from './features/logging/QuickServiceModal';
import { ProjectWorkspace } from './features/workspace/ProjectWorkspace';
import { InventoryPanel } from './features/inventory/InventoryPanel';
import { BuysPanel } from './features/buys/BuysPanel';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { OutboxBanner } from './components/OutboxBanner';
import { SyncPill } from './components/SyncPill';
import { btnPrimary } from './ui';

type View = 'PROJECTS' | 'INVENTORY' | 'PURCHASES' | 'SETTINGS';

// Calendar is kept in the menu but locked until version 1.1 (CalendarPanel stays on disk for it).
const NAV: { id: View | 'CALENDAR'; label: MessageKey; locked?: boolean }[] = [
  { id: 'PROJECTS', label: 'shell.nav.projects' },
  { id: 'INVENTORY', label: 'shell.nav.inventory' },
  { id: 'PURCHASES', label: 'shell.nav.purchases' },
  { id: 'CALENDAR', label: 'shell.nav.calendar', locked: true },
];

const segment = 'min-h-[48px] min-w-[48px] px-3 text-sm font-semibold tracking-wide first:rounded-l-[3px] last:rounded-r-[3px] shadow-[inset_0_0_0_1px_var(--color-rule)]';
const segmentState = (on: boolean) => (on ? 'bg-signal text-ink' : 'bg-deck text-mute hover:text-bone');

export default function App() {
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <p className="p-6 text-mute">{t('common.loading')}</p>;
  if (!session) return <LoginScreen />;
  return <Shell />;
}

function Shell() {
  const { t, lang, setLang } = useI18n();
  const qc = useQueryClient();
  const [view, setView] = useState<View>('PROJECTS');
  const [quickOpen, setQuickOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [batchId] = useState(() => newOpId());
  const quickButton = useRef<HTMLButtonElement>(null);
  useOutboxSync();

  useEffect(() => {
    void flush();
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const system = useSystemProjectId();
  const inv = useInventory();
  const projects = useProjects();
  const settings = useSettings();

  // metric or imperial is display-only; switching remounts the screens so every amount re-renders
  const unitSystem = settings.data?.unit_system ?? 'METRIC';
  setActiveUnitSystem(unitSystem);

  // white-label colours: applied whenever the settings load or change
  const tenantTheme = settings.data?.tenant_theme;
  useEffect(() => { applyTenantTheme(tenantTheme); }, [tenantTheme]);

  // counts shown in the menu: jobs in progress, and items at or below their alert level (same rule as the alert panel)
  const activeCount = projects.data?.filter((p) => p.status === 'ACTIVE').length ?? 0;
  const lowCount = inv.data?.filter(isLow).length ?? 0;

  // open the most recently created active project the first time the workspace loads
  useEffect(() => {
    if (selected || !projects.data?.length) return;
    const open = projects.data.find((p) => p.status === 'ACTIVE') ?? projects.data[0];
    setSelected(open.id);
  }, [projects.data, selected]);

  // the measuring system is company-wide: same optimistic cache update as the Settings screen
  const setUnits = async (next: UnitSystem) => {
    const s = settings.data;
    if (!s || s.unit_system === next) return;
    qc.setQueryData<Settings>(['settings'], (old) => (old ? { ...old, unit_system: next } : old));
    const { error } = await supabase.from('company_settings').update({ unit_system: next }).eq('company_id', s.company_id);
    if (error) void qc.invalidateQueries({ queryKey: ['settings'] });
  };

  const tabClass = (on: boolean) =>
    `min-h-[48px] shrink-0 border-b-4 px-4 text-sm font-semibold tracking-wide transition-colors ${on ? 'border-signal text-bone' : 'border-transparent text-mute hover:text-bone'}`;

  return (
    <div className="flex h-dvh flex-col">
      <header className="sticky top-0 z-30 shrink-0 border-b border-rule bg-ink/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-x-3 px-4 lg:flex-nowrap">
          <span className="py-2 font-display text-3xl font-black tracking-wide text-signal">REINKRAFT</span>
          <button ref={quickButton} className={`${btnPrimary} my-1`} onClick={() => setQuickOpen(true)} aria-haspopup="dialog" aria-expanded={quickOpen}>{t('shell.quickService')}</button>
          <nav className="order-last flex w-full min-w-0 overflow-x-auto lg:order-none lg:w-auto lg:flex-1" aria-label={t('shell.nav.main')}>
            {NAV.map((n) => {
              if (n.locked) {
                return (
                  <button key={n.id} disabled aria-disabled="true" title={t('shell.nav.lockedHint')}
                    className="min-h-[48px] shrink-0 cursor-not-allowed border-b-4 border-transparent px-4 text-sm font-semibold tracking-wide text-mute/60">
                    {t(n.label)} 🔒 V1.1
                  </button>
                );
              }
              const badge = n.id === 'PROJECTS' && activeCount > 0 ? `(${activeCount})` : n.id === 'INVENTORY' && lowCount > 0 ? `(${lowCount}!)` : null;
              return (
                <button key={n.id} onClick={() => setView(n.id as View)} aria-current={view === n.id ? 'page' : undefined} className={tabClass(view === n.id)}>
                  {t(n.label)}
                  {badge && <span className={`ml-1 ${n.id === 'INVENTORY' ? 'text-crit' : 'text-signal'}`}>{badge}</span>}
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2 py-1 lg:ml-0">
            <span className="hidden xl:inline-flex"><SyncPill /></span>
            <div role="group" aria-label={t('shell.lang.label')} className="flex">
              {(['en', 'mk'] as const).map((l) => (
                <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`${segment} ${segmentState(lang === l)}`}>
                  {l === 'en' ? 'EN' : 'МК'}
                </button>
              ))}
            </div>
            <div role="group" aria-label={t('shell.units.label')} title={t('shell.units.hint')} className="flex">
              {(['METRIC', 'IMPERIAL'] as const).map((u) => (
                <button key={u} type="button" aria-pressed={unitSystem === u} disabled={!settings.data} title={t('shell.units.hint')} onClick={() => void setUnits(u)} className={`${segment} ${segmentState(unitSystem === u)}`}>
                  {t(u === 'METRIC' ? 'shell.units.metric' : 'shell.units.imperial')}
                </button>
              ))}
            </div>
            <button type="button" className={`${segment} rounded-[3px] bg-deck text-mute hover:text-bone`} title={t('shell.signOutShort')} aria-label={t('shell.signOut')} onClick={() => void supabase.auth.signOut()}>
              <span aria-hidden="true">⎋</span><span className="ml-1 hidden md:inline">{t('shell.signOut')}</span>
            </button>
            <button type="button" aria-current={view === 'SETTINGS' ? 'page' : undefined} onClick={() => setView('SETTINGS')}
              className={`${segment} rounded-[3px] ${view === 'SETTINGS' ? 'bg-signal text-ink' : 'bg-raised text-bone hover:bg-rule'}`}>
              <span aria-hidden="true">⚙</span><span className="ml-1.5">{t('shell.settingsButton')}</span>
            </button>
          </div>
        </div>
      </header>

      <main key={unitSystem} className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col overflow-y-auto px-4 pb-6 pt-4">
        <OutboxBanner />

        {view === 'PROJECTS' && <ProjectWorkspace selected={selected} onSelect={setSelected} />}
        {view === 'INVENTORY' && <InventoryPanel />}
        {view === 'PURCHASES' && <BuysPanel />}
        {view === 'SETTINGS' && <SettingsPanel />}
      </main>

      {quickOpen && system.data && (
        <QuickServiceModal projectId={system.data} batchId={batchId} items={inv.data ?? []} onClose={() => { setQuickOpen(false); window.setTimeout(() => quickButton.current?.focus(), 0); }} />
      )}
    </div>
  );
}
