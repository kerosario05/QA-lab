// @vitest-environment node
import {it,expect,vi} from 'vitest';
import express from 'express';
import {once} from 'node:events';
import router from './scenarios';

it('proxies Jira step edits to the configured engine and preserves its validation response',async()=>{
 const previous=process.env.SCENARIO_PREVIEW_BASE_URL;process.env.SCENARIO_PREVIEW_BASE_URL='http://engine.invalid';
 const realFetch=globalThis.fetch;
 const body={issueKey:'HU-7',appSlug:'profile-one',scenarioId:'HU-7:jira:1',scenarios:[],patch:{steps:['Presionar "Buscar"']}};
 const answer={ok:true,scenarios:[{scenarioId:'HU-7:jira:1:edited-1234',validation:{valid:false,errors:['JIRA_ABSENCE_REQUIRES_OBSERVED_CONTEXT']}}]};
 const upstream=vi.fn().mockResolvedValue({status:200,json:async()=>answer});vi.stubGlobal('fetch',upstream);
 const app=express();app.use(express.json());app.use('/api/scenarios',router);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address() as {port:number};
 try{
  const response=await realFetch(`http://127.0.0.1:${address.port}/api/scenarios/jira/review-edit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  expect(await response.json()).toEqual(answer);
  expect(upstream.mock.calls[0][0]).toBe('http://engine.invalid/api/scenarios/jira/review-edit');
  expect(JSON.parse(upstream.mock.calls[0][1].body)).toEqual(body);
  expect(response.headers.get('cache-control')).toBe('no-store');
 }finally{vi.unstubAllGlobals();if(previous===undefined)delete process.env.SCENARIO_PREVIEW_BASE_URL;else process.env.SCENARIO_PREVIEW_BASE_URL=previous;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
