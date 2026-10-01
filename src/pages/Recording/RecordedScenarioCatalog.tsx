import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ListChecks, Loader2, Play, RefreshCw } from 'lucide-react';
import { recordingsApi } from '../../services/recordings';
import type { RecordedScenarioCatalogEntry } from '../../services/recordings/types';
import type { ActiveRun } from '../../types';
import { cn } from '../../constants/theme';

type Launch = { recordingId: string; jobId: string; scenarioIds: string[]; titles: string[] };

const BLOCK_REASON_LABELS: Array<[RegExp, string]> = [
  [/^missing_runtime_input:(.+)$/, 'Falta el dato "$1"'],
  [/^state_sequence_invalid/, 'La secuencia grabada no es reproducible'],
  [/^mobile_recording$/, 'Grabación móvil: se ejecuta desde su propia grabación'],
  [/^dataset_authority_mismatch$/, 'Los datos no coinciden con lo grabado'],
];

function blockLabel(reason: string): string {
  for (const [pattern, label] of BLOCK_REASON_LABELS) {
    if (pattern.test(reason)) return reason.replace(pattern, label);
  }
  return reason;
}

/**
 * Every recorded scenario of the project, across recordings, to pick several and run them.
 * Executability is the engine's own admission check, so what can be ticked here is exactly
 * what execute accepts. A run is started per recording — that is how the engine replays —
 * and each one is listed so the person can follow it.
 */
export function RecordedScenarioCatalog({
  projectSlug,
  projectName,
  onLaunch,
}: {
  projectSlug: string;
  projectName: string;
  onLaunch?: (run: ActiveRun) => void;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<RecordedScenarioCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [onlyExecutable, setOnlyExecutable] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [launching, setLaunching] = useState(false);
  const [launches, setLaunches] = useState<Launch[]>([]);

  const load = useCallback(async () => {
    if (!projectSlug) return;
    setLoading(true);
    setError(null);
    try {
      const result = await recordingsApi.scenarioCatalog(projectSlug);
      setEntries(result.scenarios ?? []);
      setSelected((prev) => new Set([...prev].filter((key) => (result.scenarios ?? []).some((entry) => entryKey(entry) === key && entry.executable))));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el catálogo de escenarios');
    } finally {
      setLoading(false);
    }
  }, [projectSlug]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return entries.filter((entry) => (!onlyExecutable || entry.executable)
      && (!needle || entry.title.toLowerCase().includes(needle) || (entry.recordingLabel ?? '').toLowerCase().includes(needle)));
  }, [entries, filter, onlyExecutable]);

  const toggle = (entry: RecordedScenarioCatalogEntry) => {
    if (!entry.executable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const key = entryKey(entry);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const execute = async () => {
    const chosen = entries.filter((entry) => selected.has(entryKey(entry)) && entry.executable);
    const byRecording = new Map<string, RecordedScenarioCatalogEntry[]>();
    for (const entry of chosen) byRecording.set(entry.recordingId, [...(byRecording.get(entry.recordingId) ?? []), entry]);
    setLaunching(true);
    setError(null);
    const started: Launch[] = [];
    const failures: string[] = [];
    for (const [recordingId, group] of byRecording) {
      try {
        const launch = await recordingsApi.execute(recordingId, projectSlug, group.map((entry) => entry.scenarioId));
        if (launch.jobId) {
          started.push({ recordingId, jobId: launch.jobId, scenarioIds: group.map((entry) => entry.scenarioId), titles: group.map((entry) => entry.title) });
        } else {
          failures.push(`${group[0].recordingLabel ?? recordingId}: el motor no inició la ejecución`);
        }
      } catch (err) {
        failures.push(`${group[0].recordingLabel ?? recordingId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setLaunches((prev) => [...started, ...prev]);
    if (failures.length > 0) setError(failures.join(' · '));
    if (started.length > 0) setSelected(new Set());
    setLaunching(false);
  };

  const follow = (launch: Launch) => onLaunch?.({
    id: launch.jobId,
    jobId: launch.jobId,
    recordingId: launch.recordingId,
    scenarioIds: launch.scenarioIds,
    project: projectName,
    triggered: 'Grabación',
    startedAt: new Date().toISOString(),
    progress: 0,
    total: launch.scenarioIds.length,
    completed: 0,
    passed: 0,
    failed: 0,
    currentTest: '',
    eta: '—',
    status: 'running',
  });

  const recordingCount = new Set(entries.filter((entry) => selected.has(entryKey(entry))).map((entry) => entry.recordingId)).size;

  return (
    <section className="bg-white rounded-2xl border border-[#E8EBEC] p-5" data-testid="recorded-scenario-catalog">
      <button type="button" onClick={() => setOpen((value) => !value)} className="w-full flex items-center gap-2 text-left">
        {open ? <ChevronDown size={14} className="text-[#58646D]" /> : <ChevronRight size={14} className="text-[#58646D]" />}
        <ListChecks size={14} className="text-[#104B99]" />
        <h2 className="text-[13px] font-semibold text-[#1a1f2e]">Escenarios grabados del proyecto</h2>
        <span className="text-[11px] text-[#8B999D]">Selecciona escenarios de varias grabaciones y ejecútalos juntos</span>
      </button>

      {open && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar por título o grabación"
              className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-[#E8EBEC] text-[12px] outline-none focus:border-[#104B99]"
            />
            <label className="flex items-center gap-1.5 text-[11px] text-[#58646D]">
              <input type="checkbox" checked={onlyExecutable} onChange={() => setOnlyExecutable((value) => !value)} className="w-3.5 h-3.5 accent-[#104B99]" />
              Solo ejecutables
            </label>
            <button type="button" onClick={() => void load()} disabled={loading} className="text-[11px] text-[#104B99] flex items-center gap-1 disabled:opacity-50">
              <RefreshCw size={12} className={cn(loading && 'animate-spin')} /> Actualizar
            </button>
          </div>

          {error && <div className="mb-3 text-[12px] text-[#B4463C] bg-[#FDF0EF] rounded-lg px-3 py-2">{error}</div>}

          {loading && entries.length === 0 ? (
            <div className="flex items-center gap-2 text-[12px] text-[#58646D]"><Loader2 size={13} className="animate-spin" /> Cargando escenarios…</div>
          ) : visible.length === 0 ? (
            <p className="text-[12px] text-[#8B999D]">{entries.length === 0 ? 'Este proyecto todavía no tiene escenarios grabados.' : 'Ningún escenario coincide con el filtro.'}</p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto divide-y divide-[#F0F2F3] border border-[#E8EBEC] rounded-xl">
              {visible.map((entry) => (
                <label
                  key={entryKey(entry)}
                  className={cn('flex items-start gap-3 px-3 py-2.5', entry.executable ? 'cursor-pointer hover:bg-[#FBFCFE]' : 'opacity-60')}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(entryKey(entry))}
                    disabled={!entry.executable}
                    onChange={() => toggle(entry)}
                    className="mt-0.5 w-3.5 h-3.5 accent-[#48A157]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-medium text-[#1a1f2e]">{entry.title}</span>
                      {entry.primary && <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#EAF5FF] text-[#2877A8]">Principal</span>}
                      {entry.promoted && <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#EEF7F0] text-[#3d8a4a]">Spec generado</span>}
                      {entry.testRailCaseId && <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#EEF2F8] text-[#104B99]">TR C{entry.testRailCaseId}</span>}
                      {(entry.titleReview?.conflicts.length ?? 0) > 0 && (
                        <span title={entry.titleReview!.conflicts.map((conflict) => `${conflict.id}: ${conflict.title}`).join('\n')} className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#FFF6E5] text-[#A36A00]">
                          Título repetido ({entry.titleReview!.conflicts.length})
                        </span>
                      )}
                      {entry.titleReview?.weak && <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-[#FFF6E5] text-[#A36A00]">Título genérico</span>}
                    </div>
                    <div className="text-[10px] text-[#8B999D] mt-0.5">
                      {entry.recordingLabel ? `Grabación "${entry.recordingLabel}"` : `Grabación ${entry.recordingId.slice(0, 8)}`} · {new Date(entry.recordedAt).toLocaleDateString('es-ES')} · {entry.scenarioId}
                    </div>
                    {!entry.executable && entry.blockedReasons.length > 0 && (
                      <div className="text-[10px] text-[#B4463C] mt-0.5">{entry.blockedReasons.map(blockLabel).join(' · ')}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#58646D]">
              {selected.size > 0 ? `${selected.size} escenario(s) de ${recordingCount} grabación(es)` : 'Ningún escenario seleccionado'}
            </span>
            <button
              type="button"
              onClick={() => void execute()}
              disabled={selected.size === 0 || launching}
              className="bg-[#48A157] hover:bg-[#3d8a4a] disabled:opacity-50 text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 transition"
            >
              {launching ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {launching ? 'Iniciando…' : 'Ejecutar seleccionados'}
            </button>
          </div>

          {launches.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {launches.map((launch) => (
                <div key={launch.jobId} className="flex items-center justify-between gap-3 text-[11px] bg-[#EEF7F0] rounded-lg px-3 py-1.5">
                  <span className="text-[#3d8a4a] truncate">Ejecución iniciada · {launch.titles.join(', ')}</span>
                  {onLaunch && (
                    <button type="button" onClick={() => follow(launch)} className="text-[#104B99] font-semibold shrink-0">Ver ejecución</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function entryKey(entry: Pick<RecordedScenarioCatalogEntry, 'recordingId' | 'scenarioId'>): string {
  return `${entry.recordingId}:${entry.scenarioId}`;
}
