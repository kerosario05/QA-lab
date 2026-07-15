import { useState, useEffect } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import { C } from './constants/theme';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { BentoCard } from './components/ui/BentoCard';
import { DashboardView } from './pages/Dashboard';
import { TestLaunch } from './pages/TestLaunch';
import { LiveExecutionScreen } from './pages/LiveExecution';
import { ExecutionClosure } from './pages/ExecutionClosure';
import DefectChecklist from './pages/DefectChecklist';
import type { ActiveRun, View } from './types';

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [liveRun, setLiveRun] = useState<ActiveRun | null>(null);
  const [closingExecution, setClosingExecution] = useState<any>(null);
  const [checklistIssueKey, setChecklistIssueKey] = useState<string | null>(null);
  const [checklistJobId, setChecklistJobId] = useState<string | undefined>(undefined);
  const [checklistScenarioIds, setChecklistScenarioIds] = useState<string[] | undefined>(undefined);
  const [prevView, setPrevView] = useState<View | null>(null);

  // URL-based routing: /checklist/:issueKey
  useEffect(() => {
    const match = location.pathname.match(/^\/checklist\/([A-Za-z0-9_-]+)$/);
    if (match) {
      const issueKey = match[1];
      const params = new URLSearchParams(location.search);
      const jobId = params.get('jobId') || undefined;
      setChecklistIssueKey(issueKey);
      setChecklistJobId(jobId);
      setView('checklist');
      console.log(`[checklist-route] pathname=${location.pathname} issueKey=${issueKey} jobId=${jobId ?? 'none'} matched=true`);
    }
  }, []);

  const handleLaunch = (run: ActiveRun) => {
    setLiveRun(run);
    setView('live');
  };

  const handleOpenRun = (run: ActiveRun) => {
    setLiveRun(run);
    setView('live');
  };

  const handleCloseLive = () => {
    setLiveRun(null);
    setView('dashboard');
  };

  const handleOpenChecklist = (issueKey: string, jobId?: string, scenarioIds?: string[]) => {
    setPrevView(view);
    setChecklistIssueKey(issueKey);
    setChecklistJobId(jobId);
    setChecklistScenarioIds(scenarioIds);
    setView('checklist');
  };

  const handleCloseChecklist = () => {
    setChecklistIssueKey(null);
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

  const titles: Record<View, string> = {
    live: 'Ejecución en vivo',
    close: 'Cierre de ejecución',
    dashboard: 'Buenos días, Carlos',
    execute: 'Lanzar pruebas',
    settings: 'Ajustes',
  };

  const subtitles: Record<View, string> = {
    live: 'Monitoreo en tiempo real del progreso',
    close: 'Revisa fallos, reporta bugs y firma el cierre',
    dashboard: 'Aquí está el pulso de tus pruebas automatizadas hoy',
    execute: 'Configura una nueva ejecución en 4 pasos',
    settings: 'Preferencias e integraciones',
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
          {view === 'execute' && (
            <TestLaunch onLaunch={handleLaunch} />
          )}
          {view === 'live' && (
            <LiveExecutionScreen
              run={liveRun}
              onClose={handleCloseLive}
              onComplete={() => {}}
              onCloseExecution={handleCloseExecution}
              onOpenChecklist={handleOpenChecklist}
            />
          )}
          {view === 'checklist' && checklistIssueKey && (
            <DefectChecklist issueKey={checklistIssueKey} jobId={checklistJobId} scenarioIds={checklistScenarioIds} onBack={handleCloseChecklist} />
          )}
          {view === 'close' && (
            <ExecutionClosure
              execution={closingExecution}
              onClose={handleCancelClose}
              onConfirm={handleConfirmClose}
            />
          )}
          {view === 'settings' && (
            <div className="p-8" style={{ background: C.canvas, minHeight: '100%' }}>
              <BentoCard className="text-center !p-12 max-w-md mx-auto">
                <Settings2 size={28} className="text-[#BABEC3] mx-auto mb-3" />
                <div className="text-[18px] font-medium text-[#1a1f2e] mb-1" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>Módulo de ajustes</div>
                <div className="text-[11px] text-[#8B999D]">Próximamente · integraciones y permisos</div>
              </BentoCard>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
