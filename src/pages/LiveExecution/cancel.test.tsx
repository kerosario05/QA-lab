import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {LiveExecutionScreen} from './index';
import type {ActiveRun} from '../../types';
const api=vi.hoisted(()=>({cancel:vi.fn(async()=>({ok:true,status:'cancelled'})),getJob:vi.fn(async()=>({status:'running'})),streamLogs:vi.fn(()=>()=>{})}));
vi.mock('../../services/runs',()=>({runsProxy:api}));
vi.mock('recharts',()=>({RadialBarChart:()=>null,RadialBar:()=>null,PolarAngleAxis:()=>null,ResponsiveContainer:()=>null}));
it('Detener waits for backend cancellation and exposes Reejecutar',async()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  Element.prototype.scrollIntoView=vi.fn();
  const element=document.createElement('div');const root=createRoot(element);
  try {
    await act(async()=>root.render(<LiveExecutionScreen run={{id:'job',jobId:'job',project:'Test',status:'running',total:1} as ActiveRun} onClose={()=>{}}/>));
    const stop=[...element.querySelectorAll('button')].find(button=>button.textContent?.includes('Detener'))!;
    expect(stop).toBeTruthy();
    await act(async()=>stop.click());
    expect(api.cancel).toHaveBeenCalledWith('job');
    expect([...element.querySelectorAll('button')].some(button=>button.textContent?.includes('Reejecutar escenarios') && !button.disabled)).toBe(true);
  } finally {await act(async()=>root.unmount());}
});

it('shows a queued job as waiting instead of executing its first step',async()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  Element.prototype.scrollIntoView=vi.fn();
  api.getJob.mockImplementation(async()=>({status:'queued',queuePosition:2} as any));
  const element=document.createElement('div');const root=createRoot(element);
  try {
    await act(async()=>{root.render(<LiveExecutionScreen run={{id:'queued-job',jobId:'queued-job',project:'Test',status:'queued',total:1} as ActiveRun} onClose={()=>{}}/>);await Promise.resolve();});
    expect(element.textContent).toContain('En espera');
    expect(element.textContent).not.toContain('Paso actual');
  } finally {await act(async()=>root.unmount());api.getJob.mockImplementation(async()=>({status:'running'}));}
});
