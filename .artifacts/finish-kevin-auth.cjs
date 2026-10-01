const fs=require('fs'),cp=require('child_process');
for(const f of ['server/routes/checklist.ts','server/routes/newman.ts','server/routes/runtime-inputs.ts']){
 let s=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');fs.writeFileSync('.artifacts/'+f.replaceAll('/','-')+'.before',s);
 s="import { engineHeaders } from '../engine-auth';\n"+s;
 s=s.replaceAll("headers: { 'Content-Type': 'application/json' }","headers: { 'Content-Type': 'application/json', ...engineHeaders() }");
 if(f.endsWith('runtime-inputs.ts'))s=s.replace('input-requirements`);','input-requirements`, { headers: engineHeaders() });');
 if(f.endsWith('newman.ts'))s=s.replace('api/newman/collections`);','api/newman/collections`, { headers: engineHeaders() });').replace('api/newman/${jobId}/report`);','api/newman/${jobId}/report`, { headers: engineHeaders() });');
 fs.writeFileSync(f,s);
}
// Preserve RequestInit overrides while merging the current session into Request objects.
const f='src/services/authInterceptor.ts';let s=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');
s=s.replace('const headers = new Headers(input.headers);','const headers = new Headers(init?.headers ?? input.headers);').replace('return originalFetch(new Request(input, { headers }), init);','return originalFetch(input, { ...init, headers });');fs.writeFileSync(f,s);
const result=cp.spawnSync('npx.cmd',['tsc','-b','--pretty','false'],{shell:true,encoding:'utf8'});
fs.writeFileSync('.artifacts/kevin-typecheck.log',(result.stdout??'')+(result.stderr??''));
console.log('typecheck exit='+result.status);
console.log((result.stdout??'').split('\n').filter(l=>/src\/(App|auth|services\/http|services\/identity|services\/authInterceptor|pages\/(Usuarios|Login|ChangePassword)|pages\/Recording\/useRecordingSession)/.test(l)).join('\n')||'No compiler errors in imported login or generation hook.');
