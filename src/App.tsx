import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { C } from './constants/theme';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { DashboardView } from './pages/Dashboard';
import { TestLaunch } from './pages/TestLaunch';
import { Recording } from './pages/Recording';
import { LiveExecutionScreen } from './pages/LiveExecution';
import { ExecutionClosure } from './pages/ExecutionClosure';
import DefectChecklist from './pages/DefectChecklist';
import { parseChecklistRoute } from './pages/DefectChecklist/route';
import { Ejecuciones } from './pages/Ejecuciones';
import { Configuracion } from './pages/Configuracion';
import { Usuarios } from './pages/Usuarios';
import { TestDesign } from './pages/TestDesign';
import { Login } from './pages/Login';
import { ChangePassword } from './pages/ChangePassword';
import { useAuth } from './auth/AuthContext';
import type { ActiveRun, View } from './types';
import type { PermissionKey } from './auth/types';

/**
 * Authentication gate.
 *
 * Nothing of the app renders until the identity is settled: a stored token is
 * re-validated on boot, and a pending password change takes over the whole
 * screen — the engine's token is scoped so that nothing else would work anyway.
 */
export default function App() {
  const { status } = useAuth();

  if (status === 'loading') return <BootSplash />;
  if (status === 'anonymous') return <Login />;
  if (status === 'must-change-password') return <ChangePassword />;
  return <Workspace />;
}

function BootSplash() {
  return (
    <div className="h-screen flex items-center justify-center" style={{ background: C.canvas }}>
      <div className="flex items-center gap-2.5">
        <div className="relative w-9 h-9 animate-pulse">
          <div className="absolute inset-0 rounded-[10px] rotate-6" style={{ background: C.green }} />
          <div
            className="absolute inset-0 rounded-[10px] -rotate-3 flex items-center justify-center text-white font-bold text-[14px]"
            style={{ background: C.blue, letterSpacing: '-0.03em' }}
          >
            Q
          </div>
        </div>
        <span className="text-[13px] text-[#8B999D]">Cargando QA Lab…</span>
      </div>
    </div>
  );
}

/** Fallback landing views, in the order a user without `dashboard.view` should try. */
const LANDING_ORDER: { id: View; permissions: PermissionKey[] }[] = [
  { id: 'ejecuciones', permissions: ['executions.view'] },
  { id: 'execute', permissions: ['tests.launch'] },
  { id: 'grabacion', permissions: ['recordings.view', 'recordings.create'] },
  { id: 'diseno', permissions: ['testdesign.view'] },
  { id: 'configuracion', permissions: ['projects.view'] },
  { id: 'usuarios', permissions: ['admin.users', 'admin.roles'] },
];

function Workspace() {
  const { canAny } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [liveRun, setLiveRun] = useState<ActiveRun | null>(null);
  const [closingExecution, setClosingExecution] = useState<any>(null);
  const [checklistIdentity, setChecklistIdentity] = useState<string | null>(null);
  const [checklistJobId, setChecklistJobId] = useState<string | undefined>(undefined);
  const [checklistScenarioIds, setChecklistScenarioIds] = useState<string[] | undefined>(undefined);
  const [prevView, setPrevView] = useState<View | null>(null);
  // Screen a run was launched from. It stays mounted (hidden) while the run is live so "Volver"
  // lands on it with the TestRail/Jira selection intact instead of a fresh form or the dashboard.
  const [launchOrigin, setLaunchOrigin] = useState<'execute' | 'grabacion' | null>(null);

  // Launch id the Ejecuciones page should open on (from global search); null = the list.
  const [executionDeepLink, setExecutionDeepLink] = useState<string | null>(null);

  // Once back on (or away from) the origin, there is nothing left to keep alive.
  useEffect(() => {
    if (view !== 'live' && view !== launchOrigin) setLaunchOrigin(null);
  }, [view, launchOrigin]);

  // URL-based routing: /checklist/:identity (issueKey | launch:<uuid> | job:<uuid>)
  useEffect(() => {
    const route = parseChecklistRoute(location.pathname, location.search);
    if (route) {
      setChecklistIdentity(route.checklistIdentity);
      setChecklistJobId(route.jobId);
      setView('checklist');
      console.log(`[checklist-route] pathname=${location.pathname} identity=${route.checklistIdentity} jobId=${route.jobId ?? 'none'} matched=true`);
    }
  }, []);

  // Land on something the user can actually open: a viewer without
  // `dashboard.view` would otherwise stare at an empty Panorama.
  useEffect(() => {
    if (view !== 'dashboard' || canAny('dashboard.view')) return;
    const fallback = LANDING_ORDER.find(candidate => canAny(...candidate.permissions));
    if (fallback) setView(fallback.id);
  }, [view, canAny]);

  const handleLaunch = (run: ActiveRun) => {
    setLaunchOrigin(view === 'execute' || view === 'grabacion' ? view : null);
    setLiveRun(run);
    setView('live');
  };

  const handleOpenRun = (run: ActiveRun) => {
    setLaunchOrigin(null);
    setLiveRun(run);
    setView('live');
  };

  const handleCloseLive = () => {
    setLiveRun(null);
    setView(launchOrigin ?? 'dashboard');
  };

  const handleOpenChecklist = (issueKey: string, jobId?: string, scenarioIds?: string[]) => {
    setPrevView(view);
    setChecklistIdentity(issueKey);
    setChecklistJobId(jobId);
    setChecklistScenarioIds(scenarioIds);
    setView('checklist');
  };

  const handleCloseChecklist = () => {
    setChecklistIdentity(null);
    setChecklistJobId(undefined);
    setView(prevView || 'dashboard');
    setPrevView(null);
  };

  const handleCloseExecution = (execution: any) => {
    setClosingExecution(execution);
    setView('close');
  };

  const handleCancelClose = () => {
    setClosingExecution(null);
    setView('dashboard');
  };

  const handleConfirmClose = () => {
    setClosingExecution(null);
    setView('dashboard');
  };

  const titles: Record<string, string> = {
    live: 'Ejecución en vivo',
    close: 'Cierre de ejecución',
    dashboard: 'Buenos días, Carlos',
    execute: 'Lanzar pruebas',
    grabacion: 'Grabación de recorridos',
    ejecuciones: 'Ejecuciones',
    checklist: 'Checklist de defectos',
    configuracion: 'Configuración',
    usuarios: 'Usuarios y roles',
    diseno: 'Diseño de pruebas',
  };

  const subtitles: Record<string, string> = {
    live: 'Monitoreo en tiempo real del progreso',
    close: 'Revisa fallos, reporta bugs y firma el cierre',
    dashboard: 'Aquí está el pulso de tus pruebas automatizadas hoy',
    execute: 'Configura una nueva ejecución en 4 pasos',
    grabacion: 'Graba un recorrido real y deriva escenarios ejecutables',
    ejecuciones: 'Resumen de corridas y resultados',
    checklist: 'Defectos detectados en la ejecución',
    configuracion: 'Administración de proyectos de automatización.',
    usuarios: 'Gestiona accesos, roles y permisos por proyecto',
    diseno: 'Genera casos con IA desde historias de Jira, edítalos y publícalos',
  };

  return (
    <div className="h-screen flex" style={{ background: C.canvas, fontFamily: '"Geist", system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap');
        * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        body, html { font-feature-settings: 'cv11', 'ss01', 'ss03'; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #BABEC3; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #8B999D; }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes liveGlow {
          0%, 100% { background-position: 0% 0%; opacity: 0.7; }
          50% { background-position: 0% 100%; opacity: 1; }
        }
      `}</style>

      <Sidebar
        active={view === 'live' || view === 'close' ? 'dashboard' : view}
        onChange={(v) => {
          setView(v as View);
          setExecutionDeepLink(null);
          if (v !== 'live') {
            setLiveRun(null);
            setClosingExecution(null);
          }
        }}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <Topbar
          title={titles[view]}
          subtitle={subtitles[view]}
          onNavigate={(next) => { setExecutionDeepLink(null); setLiveRun(null); setClosingExecution(null); setView(next); }}
          onOpenRun={handleOpenRun}
          onOpenExecution={(launchId) => { setExecutionDeepLink(launchId); setLiveRun(null); setView('ejecuciones'); }}
          action={view === 'dashboard' && (
            <button
              onClick={() => setView('execute')}
              className="bg-[#1a1f2e] hover:bg-black text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 transition group ml-1"
            >
              <Plus size={13} className="group-hover:rotate-90 transition" /> Nueva ejecución
            </button>
          )}
        />

        <div className="flex-1 overflow-y-auto">
          {view === 'dashboard' && (
            <DashboardView onOpenRun={handleOpenRun} onCloseExecution={handleCloseExecution} />
          )}
          {(view === 'execute' || launchOrigin === 'execute') && (
            <div className={view === 'execute' ? undefined : 'hidden'}>
              <TestLaunch onLaunch={handleLaunch} />
            </div>
          )}
          {(view === 'grabacion' || launchOrigin === 'grabacion') && (
            <div className={view === 'grabacion' ? undefined : 'hidden'}>
              <Recording onLaunch={handleLaunch} />
            </div>
          )}
          {view === 'live' && (
            <LiveExecutionScreen
              run={liveRun}
              closeLabel={launchOrigin ? 'Volver a la configuración' : undefined}
              onClose={handleCloseLive}
              onComplete={() => {}}
              onCloseExecution={handleCloseExecution}
              onOpenChecklist={handleOpenChecklist}
            />
          )}
          {view === 'checklist' && checklistIdentity && (
            <DefectChecklist issueKey={checklistIdentity} jobId={checklistJobId} scenarioIds={checklistScenarioIds} onBack={handleCloseChecklist} />
          )}
          {view === 'close' && (
            <ExecutionClosure
              execution={closingExecution}
              onClose={handleCancelClose}
              onConfirm={handleConfirmClose}
            />
          )}
          {view === 'ejecuciones' && (
            <Ejecuciones key={executionDeepLink ?? 'list'} initialLaunchId={executionDeepLink} />
          )}
          {(view as string) === 'configuracion' && (
            <Configuracion />
          )}
          {(view as string) === 'usuarios' && (
            <Usuarios />
          )}
          {view === 'diseno' && (
            <TestDesign />
          )}
        </div>
      </main>
    </div>
  );
}
