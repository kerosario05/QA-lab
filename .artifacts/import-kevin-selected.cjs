const fs=require('fs'), path=require('path'), cp=require('child_process');
const ref='ccc9656736d94192992a871e1d111ca51ac445e8';
const source=f=>cp.execFileSync('git',['show',`${ref}:${f}`]);
const read=f=>fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');
const write=(f,s)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);};
const originals={};
function edit(f,fn){const old=read(f); originals[f]=old; const next=fn(old); if(next===old)throw Error('No change: '+f);write(f,next);}
function replace(s,a,b){if(!s.includes(a))throw Error('Missing anchor '+a.slice(0,70));return s.replace(a,b);}
const files=['server/engine-auth.ts','server/routes/identity.ts','src/auth/AuthContext.tsx','src/auth/types.ts','src/services/authInterceptor.ts','src/services/http.ts','src/services/identity.ts','src/pages/Login/index.tsx','src/pages/ChangePassword/index.tsx','src/pages/Usuarios/index.tsx','src/pages/Usuarios/UserDialog.tsx','src/pages/Usuarios/RolesPanel.tsx','src/App.tsx','src/main.tsx','src/components/layout/Sidebar.tsx','src/components/layout/Topbar.tsx','src/pages/Recording/GenerationProgressIndicator.tsx','src/pages/Recording/generation-progress.ts'];
for(const f of files){originals[f]=fs.existsSync(f)?read(f):null;write(f,source(f));}
// Recording capabilities and remote browser wiring are excluded with the recorder changes.
edit('src/components/layout/Sidebar.tsx',s=>s.replace("import { useRecordingCapability } from '../../services/capabilities';\n",'').replace('  const recording = useRecordingCapability();\n','').replace("item => canAny(...item.permissions) && (item.id !== 'grabacion' || recording.enabled)","item => canAny(...item.permissions)").replace('split(/s+/)','split(/\\s+/)'));
edit('src/types/index.ts',s=>s.replace(/export type View = ([^;]+);/,(_,union)=>`export type View = ${union} | 'usuarios';`));
edit('server/index.ts',s=>replace(replace(replace(s,"const app = express();","import { captureRequestAuth } from './engine-auth';\nimport { identityRouter } from './routes/identity';\n\nconst app = express();"),"app.use(cors({ origin: true, credentials: true }));","app.use(cors({ origin: true, credentials: true }));\napp.use(captureRequestAuth());"),"app.all('/api/projects',","app.use(identityRouter);\n\napp.all('/api/projects',"));
for(const f of ['server/recordings-provider.ts','server/mobile-provider.ts','server/runs-provider.ts','server/scenario-preview-provider.ts','server/executions-provider.ts','server/routes/runs.ts']){
 edit(f,s=>{s=`import { engineHeaders } from '${f.includes('/routes/')?'../':'./'}engine-auth';\n`+s;
 s=s.replaceAll("headers: { 'Content-Type': 'application/json' }","headers: { 'Content-Type': 'application/json', ...engineHeaders() }");
 s=s.replaceAll('fetch(upstreamUrl);','fetch(upstreamUrl, { headers: engineHeaders() });').replace("headers: { Accept: 'application/json' }","headers: { Accept: 'application/json', ...engineHeaders() }").replace("{ method: 'HEAD' }","{ method: 'HEAD', headers: engineHeaders() }");
 s=s.replace('fetch(url, { ...init, signal: controller.signal })','fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...engineHeaders() }, signal: controller.signal })');
 s=s.replace("fetch(url, { method: 'GET', signal: controller.signal })","fetch(url, { method: 'GET', headers: engineHeaders(), signal: controller.signal })");
 if(f==='server/mobile-provider.ts')s=replace(s,'      ...init,\n','      ...init,\n      headers: { ...(init.headers as Record<string, string> | undefined), ...engineHeaders() },\n');
 return s;});
}
edit('src/services/runs/index.ts',s=>replace(s,"    const filename = filenameMatch ? filenameMatch[1].replace(/['\"]/g, '') : `evidencia-${jobId}.docx`;","    const fallbackExtension = res.headers.get('Content-Type')?.includes('pdf') ? 'pdf' : 'docx';\n    const filename = filenameMatch ? filenameMatch[1].replace(/['\"]/g, '') : `evidencia-${jobId}.${fallbackExtension}`;"));
const types=source('src/services/recordings/types.ts').toString().replace(/\r\n/g,'\n');
const progressTypes=types.slice(types.indexOf('export type RecordingDerivationStage'),types.indexOf('export interface RecordedScenarioStep'));
edit('src/services/recordings/types.ts',s=>s+'\n'+progressTypes);
edit('src/services/recordings/index.ts',s=>{s=replace(s,'  DeriveResult,','  DeriveResult,\n  RecordingDerivationProgress,');const src=source('src/services/recordings/index.ts').toString().replace(/\r\n/g,'\n');const start=src.indexOf('  deriveAsync:');const end=src.indexOf('  scenarios:',start);const methods=src.slice(start,end).replace('{ derivation?: RecordingDerivationProgress } & Partial<DeriveResult>','Omit<Partial<DeriveResult>, \'derivation\'> & { derivation?: RecordingDerivationProgress | DeriveResult[\'derivation\'] }');return replace(s,'  scenarios:',methods+'  scenarios:');});
const provider=source('server/recordings-provider.ts').toString().replace(/\r\n/g,'\n');
edit('server/recordings-provider.ts',s=>s+'\n'+provider.slice(provider.indexOf('export function getRecordingDerivation'),provider.indexOf('export function saveRecordingScenarios')));
edit('server/routes/recordings.ts',s=>replace(replace(s,'  getRecordingScenarios,','  getRecordingScenarios,\n  getRecordingDerivation,'),"router.get('/:recordingId/scenarios'",`router.get('/:recordingId/derivation', async (req: Request, res: Response) => {
  const projectSlug = requireProjectSlug(req, res);
  if (!projectSlug) return;
  forward(res, await getRecordingDerivation(String(req.params.recordingId), projectSlug));
});

router.get('/:recordingId/scenarios'`));
fs.writeFileSync('.artifacts/kevin-before-import.json',JSON.stringify(originals));
console.log('Imported approved auth, PDF download and generation transport.');
