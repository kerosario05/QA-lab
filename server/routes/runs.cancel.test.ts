import {afterEach,expect,it,vi} from 'vitest';
import {proxyCancelRun} from './runs';
const previous=process.env.SCENARIO_PREVIEW_BASE_URL;
afterEach(()=>{if(previous===undefined) delete process.env.SCENARIO_PREVIEW_BASE_URL;else process.env.SCENARIO_PREVIEW_BASE_URL=previous;});
function response(){const result={status:0,body:null as any};return {result,status(code:number){result.status=code;return this;},json(body:any){result.body=body;return this;}};}
it('forwards DELETE to the exact engine job and preserves cancellation confirmation',async()=>{
  process.env.SCENARIO_PREVIEW_BASE_URL='http://engine:3002';
  const res=response();const fetcher=vi.fn(async()=>new Response(JSON.stringify({ok:true,status:'cancelled'}),{status:200}));
  await proxyCancelRun({params:{jobId:'fixture-job'}} as any,res as any,fetcher as any);
  expect(fetcher).toHaveBeenCalledWith('http://engine:3002/api/runs/fixture-job',expect.objectContaining({method:'DELETE'}));
  expect(res.result).toEqual({status:200,body:{ok:true,status:'cancelled'}});
});
it('preserves a real engine 404 and reports network failures separately',async()=>{
  process.env.SCENARIO_PREVIEW_BASE_URL='http://engine:3002';
  const res=response();await proxyCancelRun({params:{jobId:'missing'}} as any,res as any,async()=>new Response(JSON.stringify({error:'Job not found'}),{status:404}));
  expect(res.result).toEqual({status:404,body:{error:'Job not found'}});
  const failed=response();await proxyCancelRun({params:{jobId:'fixture'}} as any,failed as any,async()=>{throw new Error('offline');});
  expect(failed.result.status).toBe(502);
});
