// @vitest-environment node
import {createServer} from 'node:http';
import {Agent} from 'undici';
import {afterEach,expect,it,vi} from 'vitest';
import {requestScenarioPreview} from './scenario-preview-provider';

vi.mock('./engine-auth',()=>({engineHeaders:()=>({})}));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

it('preview waits for delayed headers using its configured timeout rather than a shorter client limit',async()=>{
 const server=createServer((_req,res)=>{
  setTimeout(()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,stories:[{jiraKey:'HU-1',title:'Fixture',scenarios:[{title:'Done',custom_steps_separated:[{content:'Validar "Done"',expected:''}]}]}]}));},1200);
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();
 if(!address || typeof address==='string') throw new Error('Fixture address missing');
 const baseUrl=`http://127.0.0.1:${address.port}`;
 const shortClient=new Agent({headersTimeout:10});
 try {
  const shortOptions:RequestInit={method:'GET'};
  Reflect.set(shortOptions,'dispatcher',shortClient);
  await expect(fetch(baseUrl,shortOptions)).rejects.toMatchObject({cause:{code:'UND_ERR_HEADERS_TIMEOUT'}});
  vi.stubEnv('SCENARIO_PREVIEW_BASE_URL',baseUrl);
  vi.stubEnv('SCENARIO_PREVIEW_TIMEOUT_MS','4000');
  const result=await requestScenarioPreview({projectKey:'HU',appSlug:'synthetic-profile'});
  expect(result.ok).toBe(true);
  expect(result.totalScenarios).toBe(1);
  vi.stubEnv('SCENARIO_PREVIEW_TIMEOUT_MS','20');
  expect((await requestScenarioPreview({projectKey:'HU'})).errorCode).toBe('PREVIEW_TIMEOUT');
 } finally {
  await shortClient.destroy();
  server.closeAllConnections();
  await new Promise<void>((resolve,reject)=>server.close(error=>error ? reject(error) : resolve()));
 }
},10000);

it('preview reports safe transport cause codes and classifies HTTP client timeouts',async()=>{
 vi.stubEnv('SCENARIO_PREVIEW_BASE_URL','http://fixture.invalid');
 for(const [cause,errorCode] of [['ECONNREFUSED','PREVIEW_PROVIDER_ERROR'],['UND_ERR_HEADERS_TIMEOUT','PREVIEW_TIMEOUT'],['UND_ERR_BODY_TIMEOUT','PREVIEW_TIMEOUT']]) {
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('fetch failed',{cause:{code:cause}})));
  const result=await requestScenarioPreview({projectKey:'HU',generationMode:'jira_semantic'});
  expect(result.errorCode).toBe(errorCode);
  if(cause==='ECONNREFUSED') expect(result.message).toContain(cause);
 }
});
