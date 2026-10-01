const fs=require('fs'),cp=require('child_process'),path=require('path');
const ref='ccc9656', originals={};
const read=f=>fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');
const write=(f,s)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);};
const replace=(s,a,b)=>{if(!s.includes(a))throw Error('Missing '+a);return s.replace(a,b)};
const edit=(f,fn)=>{originals[f]=read(f);write(f,fn(originals[f]))};
for(const f of ['src/pages/Recording/LiveBrowserView.tsx','src/pages/Recording/live-view-input.ts','server/live-view-proxy.ts']){originals[f]=fs.existsSync(f)?read(f):null;write(f,cp.execFileSync('git',['show',`${ref}:${f}`]));}
edit('server/index.ts',s=>{
 s='import { attachLiveViewProxy } from "./live-view-proxy";\n'+s;
 s=replace(s,"import { captureRequestAuth }", "import { engineBaseUrl, captureRequestAuth }");
 s=replace(s,'app.listen(PORT, () => {','const server = app.listen(PORT, () => {');
 return s+'\nattachLiveViewProxy(server, engineBaseUrl);\n';
});
edit('server/live-view-proxy.ts',s=>{
 s="import https from 'node:https';\n"+s;
 return replace(s,'const upstream = http.request({',"const upstream = (target.protocol === 'https:' ? https : http).request({");
});
edit('src/pages/Recording/index.tsx',s=>{
 s="import { LiveBrowserView } from './LiveBrowserView';\n"+s;
 s=replace(s,"'usa el navegador que se abrió'","'interactúa con el navegador integrado'");
 // Stable object identity keeps the socket alive across status polling rerenders.
 s=replace(s,"  const isRecording =", "  const isRecording =");
 const anchor="            <div className=\"flex gap-4\">";
 const offset=s.indexOf("        {session.phase === 'recording' && (");
 const index=s.indexOf(anchor,offset);
 if(index<0)throw Error('Recording panel anchor missing');
 s=s.slice(0,index)+`            {project?.type !== 'mobile' && session.recordingId && (
              <LiveBrowserView recordingId={session.recordingId} viewport={EMBEDDED_RECORDING_VIEWPORT} />
            )}
`+s.slice(index);
 s=s.replace('export function Recording(', 'const EMBEDDED_RECORDING_VIEWPORT = { width: 1280, height: 720 };\n\nexport function Recording(');
 return s;
});
// Stream hello owns the page dimensions. Resizing this canvas never resizes the target page.
edit('src/pages/Recording/LiveBrowserView.tsx',s=>{
 s=replace(s,'    let disposed = false;','    let disposed = false;\n    let pageViewport = viewport;\n    let latestFrame = 0;\n    let controlAllowed = false;\n    setStatus(\'connecting\');\n    setError(null);');
 s=replace(s,"          setStatus(message.canControl ? 'live' : 'view_only');",`          controlAllowed = message.canControl === true;
          if (message.viewport?.width > 0 && message.viewport?.height > 0) {
            pageViewport = message.viewport;
            canvas.width = pageViewport.width;
            canvas.height = pageViewport.height;
            canvas.style.aspectRatio = \x60\x24{pageViewport.width} / \x24{pageViewport.height}\x60;
          }
          setStatus(controlAllowed ? 'live' : 'view_only');`);
 s=replace(s,"      const bitmap = await createImageBitmap(new Blob([event.data], { type: 'image/jpeg' }));\n      if (disposed || !context) return;\n      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);",`      const frame = ++latestFrame;
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(new Blob([event.data], { type: 'image/jpeg' })); }
      catch { return; }
      if (disposed || !context || frame !== latestFrame) { bitmap.close(); return; }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();`);
 s=replace(s,'canvas.getBoundingClientRect(), viewport)','canvas.getBoundingClientRect(), pageViewport)');
 s=replace(s,'    const onDown = (event: MouseEvent) => {','    const onDown = (event: MouseEvent) => {\n      if (!controlAllowed) return;');
 s=replace(s,'    const onKey = (event: KeyboardEvent) => {','    const onKey = (event: KeyboardEvent) => {\n      if (!controlAllowed) return;');
 s=replace(s,'    const onPaste = (event: ClipboardEvent) => {','    const onPaste = (event: ClipboardEvent) => {\n      if (!controlAllowed) return;');
 s=replace(s,'      canvas.removeEventListener(\'mouseup\', onUp);','      window.removeEventListener(\'mouseup\', onUp);');
 s=replace(s,"    canvas.addEventListener('mouseup', onUp);","    window.addEventListener('mouseup', onUp);");
 return s;
});
write('.artifacts/live-view-before.json',JSON.stringify(originals));
console.log('Embedded browser UI and websocket proxy integrated.');
