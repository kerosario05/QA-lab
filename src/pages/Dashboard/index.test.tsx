import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {DashboardView} from './index';
import {loadDashboardData} from '../../services/dashboard';
vi.mock('../../services/dashboard',()=>({loadDashboardData:vi.fn()}));
vi.mock('./DashboardGeneral',()=>({DashboardGeneral:()=> <div>Historial disponible</div>}));
vi.mock('../ProjectDashboard',()=>({ProjectDashboard:()=>null}));

it('keeps the existing dashboard while refreshing and skips overlapping timer requests',async()=>{
  vi.useFakeTimers();
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const data={projects:[],executions:[],activeRuns:[],activeRunsAvailable:true,loadedAt:new Date().toISOString()};
  let rejectRefresh!:(e:Error)=>void;
  vi.mocked(loadDashboardData).mockResolvedValueOnce(data).mockImplementationOnce(()=>new Promise((_,reject)=>{rejectRefresh=reject;}));
  try{
    await act(async()=>{root.render(<DashboardView onOpenRun={()=>{}} onCloseExecution={()=>{}}/>);});
    expect(host.textContent).toContain('Historial disponible');
    await act(async()=>{vi.advanceTimersByTime(60000);});
    expect(host.textContent).toContain('Historial disponible');
    await act(async()=>{vi.advanceTimersByTime(60000);});
    expect(loadDashboardData).toHaveBeenCalledTimes(2);
    await act(async()=>{rejectRefresh(new Error('HTTP 502'));});
    expect(host.textContent).toContain('Historial disponible');expect(host.textContent).toContain('se conservan los últimos datos');
  }finally{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.resetAllMocks();}
});
