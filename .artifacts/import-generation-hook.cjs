const fs=require('fs');
const f='src/pages/Recording/useRecordingSession.ts';
let s=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');
fs.writeFileSync('.artifacts/kevin-hook-before.ts',s);
s=s.replace('import type { DerivationMetadata,','import type { DeriveResult, RecordingDerivationProgress, DerivationMetadata,');
s="import type { GenerationProgress } from './generation-progress';\n"+s;
s=s.replace("  const [phase, setPhase]", "  const [generation, setGeneration] = useState<GenerationProgress | null>(null);\n  const generationRunRef = useRef(0);\n  const [phase, setPhase]");
s=s.replace('    openExistingRequestRef.current += 1;', '    openExistingRequestRef.current += 1;\n    generationRunRef.current += 1;\n    setGeneration(null);');
s=s.replace('  useEffect(() => stopPolling, [stopPolling]);','  useEffect(() => () => { generationRunRef.current += 1; stopPolling(); }, [stopPolling]);');
const start=s.indexOf('  const derive = useCallback('),end=s.indexOf('  // Guards against a stale response:',start);
if(start<0||end<0)throw Error('derive boundaries missing');
s=s.slice(0,start)+`  const derive = useCallback(
    async (title?: string) => {
      if (!recordingId) return;
      const run = ++generationRunRef.current;
      const isCurrent = () => generationRunRef.current === run;
      setPhase('deriving');
      setError(null);
      setGeneration({ kind: 'deriving', derivation: { recordingId, status: 'deriving' } });
      try {
        const started = await recordingsApi.deriveAsync(recordingId, projectSlug, title);
        if (!isCurrent()) return;
        let res: DeriveResult;
        if (Array.isArray(started.scenarios) && started.summary) {
          // Older engines return the existing synchronous contract.
          res = started as DeriveResult;
        } else {
          if (!started.derivation || !('status' in started.derivation)) {
            throw new Error('El backend no devolvió el estado de generación.');
          }
          let progress: RecordingDerivationProgress = started.derivation;
          const deadline = Date.now() + 20 * 60_000;
          while (progress.status === 'deriving') {
            setGeneration({ kind: 'deriving', derivation: progress });
            if (Date.now() >= deadline) throw new Error('La generación sigue en curso. Reabre la grabación para consultar sus resultados.');
            await new Promise<void>(resolve => setTimeout(resolve, 2000));
            if (!isCurrent()) return;
            progress = (await recordingsApi.derivation(recordingId, projectSlug)).derivation;
            if (!isCurrent()) return;
          }
          if (progress.status !== 'derived') throw new Error(progress.errorMessage ?? 'La generación no terminó correctamente.');
          const [stored, status, semantic, trace] = await Promise.all([
            recordingsApi.scenarios(recordingId, projectSlug),
            recordingsApi.status(recordingId, projectSlug),
            recordingsApi.semantic(recordingId, projectSlug),
            recordingsApi.trace(recordingId, projectSlug),
          ]);
          if (!isCurrent()) return;
          if (!Array.isArray(stored.scenarios)) throw new Error('No se recibieron los escenarios generados.');
          res = { scenarios: stored.scenarios, summary: status.summary,
            semanticModel: semantic.semanticModel, narrative: trace.trace.narrative ?? '' };
        }
        setScenarios(res.scenarios ?? []);
        setNarrative(res.narrative ?? '');
        setSemanticModel(res.semanticModel ?? null);
        setDerivation(res.derivation ?? res.semanticModel?.derivation ?? null);
        setSummary(res.summary);
        setPhase('derived');
        setLifecycle({ recordingExists: true, traceReady: true, semanticReady: true, scenariosReady: (res.scenarios ?? []).length > 0 });
        setPersistedScenarioIds(new Set((res.scenarios ?? []).map(scenario => scenario.scenarioId)));
        void refreshHistory();
      } catch (err) {
        if (!isCurrent()) return;
        setPhase('stopped');
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (isCurrent()) setGeneration(null);
      }
    },
    [recordingId, projectSlug, refreshHistory],
  );

`+s.slice(end);
s=s.replace('    async (id: string) => {\n      setError(null);','    async (id: string) => {\n      generationRunRef.current += 1;\n      setGeneration(null);\n      setError(null);');
s=s.replace('  return {\n    phase,','  return {\n    generation,\n    phase,');
fs.writeFileSync(f,s);
const screen='src/pages/Recording/index.tsx';let ui=fs.readFileSync(screen,'utf8').replace(/\r\n/g,'\n');
fs.writeFileSync('.artifacts/kevin-screen-before.tsx',ui);
ui="import { GenerationProgressIndicator } from './GenerationProgressIndicator';\n"+ui;
const old=`          <div aria-live="polite" data-testid="scenario-generation-loading" className="mt-4 flex items-center gap-2 text-[12px] text-[#58646D]">
            <Loader2 size={14} className="animate-spin" />
            Generando escenarios…
          </div>`;
if(!ui.includes(old))throw Error('Loading block missing');
ui=ui.replace(old,'          <GenerationProgressIndicator progress={session.generation} testId="scenario-generation-loading" />');
fs.writeFileSync(screen,ui);
