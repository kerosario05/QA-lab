import { useState } from 'react';
import { ChevronDown, Calendar } from 'lucide-react';
import { C } from '../../constants/theme';
import { DashboardGeneral } from './DashboardGeneral';
import { ProjectDashboard } from '../ProjectDashboard';
import { projects } from '../../data/mockData';
import type { ActiveRun } from '../../types';

interface DashboardViewProps {
  onOpenRun: (run: ActiveRun) => void;
  onCloseExecution: (execution: any) => void;
}

export function DashboardView({ onOpenRun, onCloseExecution }: DashboardViewProps) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  return (
    <div className="p-7" style={{ background: C.canvas, minHeight: '100%' }}>
      {!selectedProject && (
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 bg-white rounded-full p-1 border border-[#E8EBEC]">
            <button className="text-[11px] font-medium px-3.5 py-1.5 rounded-full bg-[#1a1f2e] text-white">Todo</button>
            <select
              onChange={(e) => e.target.value && setSelectedProject(e.target.value)}
              className="text-[11px] font-medium px-3.5 py-1.5 rounded-full text-[#58646D] hover:bg-[#FAFAF7] bg-transparent outline-none cursor-pointer pr-7"
              defaultValue=""
            >
              <option value="" disabled>Por proyecto...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-[11px] bg-white border border-[#E8EBEC] px-3 py-1.5 rounded-full hover:bg-[#FAFAF7] flex items-center gap-1.5 text-[#58646D]">
              <Calendar size={11} /> Mayo 2026 <ChevronDown size={11} />
            </button>
          </div>
        </div>
      )}

      {selectedProject ? (
        <ProjectDashboard
          projectId={selectedProject}
          onBack={() => setSelectedProject(null)}
          onCloseExecution={onCloseExecution}
        />
      ) : (
        <DashboardGeneral onSelectProject={setSelectedProject} onOpenRun={onOpenRun} />
      )}
    </div>
  );
}
