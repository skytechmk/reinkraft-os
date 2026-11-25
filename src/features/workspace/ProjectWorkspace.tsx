import { useRef, useState, type TouchEvent } from 'react';
import { useInventory, useLogs, useProjects, useSettings } from '../../lib/api';
import { useI18n } from '../../i18n';
import { Drawer } from '../../components/Drawer';
import { LowStockPanel } from '../../components/LowStockPanel';
import { Plate } from '../../components/Plate';
import { COCKPIT_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { btn } from '../../ui';
import { NewProjectForm, ProjectList } from './ProjectList';
import { ProjectHeader } from './ProjectHeader';
import { WorkshopNotes } from './WorkshopNotes';
import { ProjectCounters } from './ProjectCounters';
import { ProjectFinance } from './ProjectFinance';

interface Props {
  selected: string | null;
  onSelect: (id: string) => void;
}

const EDGE_PX = 28;     // a swipe that starts this close to the left edge opens the drawer
const SWIPE_PX = 60;

/**
 * The cockpit. Desktop and landscape: three columns 25 / 45 / 30, each scrolling on its own, with the
 * low-stock alert panel pinned at the bottom of the left one. Portrait phone: the left column becomes a
 * drawer opened by the "Projects" button or a swipe from the left edge; the workbench takes the full
 * width and the money block stacks directly under it.
 */
export function ProjectWorkspace({ selected, onSelect }: Props) {
  const { t } = useI18n();
  const projects = useProjects();
  const inv = useInventory();
  const settings = useSettings();
  const cockpit = useMediaQuery(COCKPIT_QUERY);
  const [drawer, setDrawer] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const edge = useRef<{ x: number; y: number } | null>(null);

  const project = projects.data?.find((p) => p.id === selected) ?? null;
  const logs = useLogs(selected);
  const noProjects = projects.isSuccess && projects.data.length === 0;

  const choose = (id: string) => {
    onSelect(id);
    setDrawer(false);            // the project shows at once
  };

  const onTouchStart = (e: TouchEvent) => {
    const x = e.touches[0].clientX;
    edge.current = !cockpit && !drawer && x <= EDGE_PX ? { x, y: e.touches[0].clientY } : null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = edge.current;
    edge.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (dx > SWIPE_PX && Math.abs(dy) < dx) setDrawer(true);
  };

  const left = (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ProjectList projects={projects.data ?? []} selectedId={selected} onSelect={choose} />
      <LowStockPanel items={inv.data ?? []} enabledProcesses={settings.data?.enabled_processes ?? []} />
    </div>
  );

  return (
    <div className="cockpit:min-h-0 cockpit:flex-1" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {!cockpit && (
        <button ref={opener} className={`${btn} mb-3 w-full text-left`} aria-haspopup="dialog" aria-expanded={drawer} onClick={() => setDrawer(true)}>
          {t('workspace.drawerButton')}
        </button>
      )}
      <div className="grid grid-cols-1 gap-4 cockpit:h-full cockpit:grid-cols-[25fr_45fr_30fr] cockpit:grid-rows-[minmax(0,1fr)]">
        {cockpit && <div className="min-h-0">{left}</div>}

        <section className="min-w-0 cockpit:min-h-0 cockpit:overflow-y-auto">
          {project ? (
            <div key={project.id}>
              <ProjectHeader project={project} />
              <WorkshopNotes project={project} />
              <ProjectCounters project={project} items={inv.data ?? []} logs={logs.data ?? []} />
            </div>
          ) : noProjects ? (
            <Plate title={t('workspace.firstProjectTitle')}>
              <p className="mb-3 text-sm text-mute">{t('workspace.firstProjectHint')}</p>
              <NewProjectForm idPrefix="first-" onCreated={(id) => id && onSelect(id)} />
            </Plate>
          ) : (
            <p className="p-4 text-mute">{t('workspace.loadingProject')}</p>
          )}
        </section>

        <aside className="min-w-0 cockpit:min-h-0 cockpit:overflow-y-auto">
          {project && settings.data && (
            <ProjectFinance key={project.id} project={project} items={inv.data ?? []} logs={logs.data ?? []} settings={settings.data} />
          )}
        </aside>
      </div>

      {!cockpit && drawer && (
        <Drawer label={t('workspace.drawerTitle')} closeLabel={t('workspace.drawerClose')} onClose={() => setDrawer(false)} returnFocusTo={opener}>
          {left}
        </Drawer>
      )}
    </div>
  );
}
