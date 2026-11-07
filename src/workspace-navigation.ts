import type {ActiveRun, View} from './types';

export interface WorkspaceNavigation {
  view: View;
  liveRun: ActiveRun | null;
  checklistIdentity: string | null;
  checklistJobId?: string;
  checklistScenarioIds?: string[];
  executionDeepLink: string | null;
}
const views = new Set<View>(['dashboard','execute','grabacion','live','ejecuciones','checklist','configuracion','usuarios','diseno']);
const initial: WorkspaceNavigation = {view:'dashboard',liveRun:null,checklistIdentity:null,executionDeepLink:null};
const key = (userId: string) => `qalab:navigation:v1:${userId}`;

export function saveWorkspaceNavigation(storage: Storage, userId: string, state: WorkspaceNavigation) {
  // Store navigation identity only: never scenario steps, input values or form drafts.
  const run = state.liveRun;
  const liveRun = run ? {id:run.id,jobId:run.jobId,project:run.project,runType:run.runType,
    startedAt:run.startedAt,total:run.total,triggered:run.triggered} : null;
  try { storage.setItem(key(userId), JSON.stringify({...state,view:state.view === 'close' ? 'ejecuciones' : state.view,liveRun})); } catch { /* storage can be disabled */ }
}

export function loadWorkspaceNavigation(storage: Storage, userId: string): WorkspaceNavigation {
  try {
    const value = JSON.parse(storage.getItem(key(userId)) ?? 'null');
    if (!value || !views.has(value.view)) return {...initial};
    if (value.view === 'live' && typeof value.liveRun?.id !== 'string') return {...initial};
    if (value.view === 'checklist' && typeof value.checklistIdentity !== 'string') return {...initial};
    const run = value.liveRun;
    return {
      view:value.view,
      liveRun:run && typeof run.id === 'string' ? {...run,progress:0,completed:0,passed:0,failed:0,currentTest:'',eta:'',status:'running'} : null,
      checklistIdentity:typeof value.checklistIdentity === 'string' ? value.checklistIdentity : null,
      checklistJobId:typeof value.checklistJobId === 'string' ? value.checklistJobId : undefined,
      checklistScenarioIds:Array.isArray(value.checklistScenarioIds) ? value.checklistScenarioIds.filter((id:unknown)=>typeof id === 'string') : undefined,
      executionDeepLink:typeof value.executionDeepLink === 'string' ? value.executionDeepLink : null,
    };
  } catch { return {...initial}; }
}
