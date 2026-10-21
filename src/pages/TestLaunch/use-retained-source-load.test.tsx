import React,{act,StrictMode,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {useRetainedSourceLoad} from './use-retained-source-load';

function Harness({contextKey,active,load,received}:{contextKey:string;active:boolean;load:()=>Promise<string[]>;received:(data:string[])=>void}) {
 const [state,setState]=useState({scenarios:[] as string[],selected:false,input:''});
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const {retry}=useRetainedSourceLoad({contextKey,active,load,
  onStart:()=>{setLoading(true);setError('');},
  onSuccess:scenarios=>{received(scenarios);setState({scenarios,selected:false,input:''});},
  onError:()=>setError('failed'),onFinish:()=>setLoading(false),
  onReset:()=>{setState({scenarios:[],selected:false,input:''});setLoading(false);setError('');}});
 return <><output>{JSON.stringify({state,error,loading})}</output><button onClick={()=>setState({scenarios:['edited-step'],selected:true,input:'synthetic-value'})}>Edit</button><button onClick={retry}>Retry</button></>;
}
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}

it('back from Launch to Cases preserves edits, selection and input without a second request, including StrictMode',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const load=vi.fn().mockResolvedValue(['original-step']);const received=vi.fn();
 const render=(active:boolean)=>root.render(<StrictMode><Harness contextKey="project-a:sprint:status" active={active} load={load} received={received}/></StrictMode>);
 try{
  await act(async()=>render(true));
  await act(async()=>host.querySelector('button')!.click());
  const edited=host.querySelector('output')!.textContent;
  await act(async()=>render(false));
  await act(async()=>render(true));
  expect(load).toHaveBeenCalledTimes(1);expect(received).toHaveBeenCalledTimes(1);
  expect(host.querySelector('output')!.textContent).toBe(edited);
  expect(edited).toContain('edited-step');expect(edited).toContain('synthetic-value');expect(edited).toContain('"selected":true');
 }finally{await act(async()=>root.unmount());host.remove();}
});

it('a source context change invalidates prior results and late responses cannot replace the new project',async()=>{
 const host=document.createElement('div');const root=createRoot(host);const old=deferred<string[]>();const next=deferred<string[]>();
 const load=vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);const received=vi.fn();
 const render=(contextKey:string,active:boolean)=>root.render(<Harness {...{contextKey,active,load,received}}/>);
 try{
  await act(async()=>render('project-a',true));
  await act(async()=>render('project-a',false));
  await act(async()=>render('project-a',true));
  expect(load).toHaveBeenCalledTimes(1);
  await act(async()=>render('project-b',true));
  await act(async()=>old.resolve(['stale-a']));
  expect(received).not.toHaveBeenCalled();
  await act(async()=>next.resolve(['new-b']));
  expect(received).toHaveBeenCalledExactlyOnceWith(['new-b']);
  expect(host.textContent).not.toContain('stale-a');expect(host.textContent).toContain('new-b');
 }finally{await act(async()=>root.unmount());host.remove();}
});

it('failed and empty source responses are retained on Back; retry is explicit and context changes clear old input',async()=>{
 const host=document.createElement('div');const root=createRoot(host);const received=vi.fn();
 const load=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue([]);
 const render=(active:boolean,contextKey='same')=>root.render(<Harness {...{contextKey,active,load,received}}/>);
 try{
  await act(async()=>render(true));await act(async()=>render(false));await act(async()=>render(true));
  expect(load).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('failed');
  await act(async()=>host.querySelectorAll('button')[1].click());
  await act(async()=>render(false));await act(async()=>render(true));
  expect(load).toHaveBeenCalledTimes(2);expect(received).toHaveBeenCalledExactlyOnceWith([]);
  await act(async()=>host.querySelector('button')!.click());
  await act(async()=>render(false,'changed-status'));
  expect(host.textContent).not.toContain('synthetic-value');expect(load).toHaveBeenCalledTimes(2);
 }finally{await act(async()=>root.unmount());host.remove();}
});

it('leaving the component prevents a pending result from updating its owner',async()=>{
 const host=document.createElement('div');const root=createRoot(host);const pending=deferred<string[]>();const received=vi.fn();
 await act(async()=>root.render(<Harness contextKey="project-a" active load={()=>pending.promise} received={received}/>));
 await act(async()=>root.unmount());await act(async()=>pending.resolve(['late']));
 expect(received).not.toHaveBeenCalled();host.remove();
});
