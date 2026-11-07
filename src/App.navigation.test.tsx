import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,expect,it,vi} from 'vitest';
import App from './App';
import {saveWorkspaceNavigation} from './workspace-navigation';
vi.mock('./auth/AuthContext',()=>({useAuth:()=>({status:'authenticated',user:{id:'viewer',fullName:'Viewer'},can:()=>true,canAny:()=>true})}));
vi.mock('./components/layout/Sidebar',()=>({Sidebar:()=>null}));
vi.mock('./components/layout/Topbar',()=>({Topbar:()=>null}));
vi.mock('./components/localAgent/LocalAgentContext',()=>({LocalAgentProvider:({children}:any)=>children}));
vi.mock('./components/localAgent/LocalAgentSetupDialog',()=>({LocalAgentSetupDialog:()=>null}));
vi.mock('./pages/Dashboard',()=>({DashboardView:()=> <div>Panorama marker</div>}));
vi.mock('./pages/TestLaunch',()=>({TestLaunch:()=>null}));
vi.mock('./pages/Recording',()=>({Recording:()=>null}));
vi.mock('./pages/LiveExecution',()=>({LiveExecutionScreen:({run}:any)=><div>Live job {run?.jobId}</div>}));
vi.mock('./pages/ExecutionClosure',()=>({ExecutionClosure:()=>null}));
vi.mock('./pages/DefectChecklist',()=>({default:()=>null}));
vi.mock('./pages/Ejecuciones',()=>({Ejecuciones:()=>null}));
vi.mock('./pages/Configuracion',()=>({Configuracion:()=> <div>Configuration marker</div>}));
vi.mock('./pages/Usuarios',()=>({Usuarios:()=>null}));
vi.mock('./pages/TestDesign',()=>({TestDesign:()=>null}));
vi.mock('./pages/Login',()=>({Login:()=>null}));
vi.mock('./pages/ChangePassword',()=>({ChangePassword:()=>null}));
beforeEach(()=>{sessionStorage.clear();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;});
it('remounts the workspace in its saved module rather than Panorama',async()=>{
  saveWorkspaceNavigation(sessionStorage,'viewer',{view:'configuracion',liveRun:null,checklistIdentity:null,executionDeepLink:null});
  const container=document.createElement('div');const root=createRoot(container);
  try {
    await act(async()=>root.render(<App/>));
    expect(container.textContent).toContain('Configuration marker');
    expect(container.textContent).not.toContain('Panorama marker');
  } finally {await act(async()=>root.unmount());}
});
