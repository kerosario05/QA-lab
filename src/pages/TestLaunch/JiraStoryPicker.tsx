import { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2, Search, X } from 'lucide-react';
import { cn } from '../../constants/theme';
import { jiraProjectsProxy } from '../../services/jira';
import type { JiraIssue } from '../../services/jira';

export type PickedJiraIssue = { key: string; summary: string };

/**
 * The engine generates scenarios for at most this many stories per request
 * (SCENARIO_PREVIEW_MAX_ISSUES, default 5) and silently keeps the first ones.
 */
export const SCENARIO_PREVIEW_ISSUE_LIMIT = 5;
/** Jira text search needs two characters; one character just narrows the loaded list. */
const MIN_REMOTE_QUERY = 2;
const SEARCH_DEBOUNCE_MS = 350;

export function filterJiraIssues<T extends PickedJiraIssue>(issues: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return issues;
  return issues.filter(issue => issue.key.toLowerCase().includes(q) || issue.summary.toLowerCase().includes(q));
}

/**
 * Stories (HU) of the chosen Jira project, no sprint and no status: the list opens with the
 * project's most recently updated issues, and the search box looks up any HU of the project by
 * key or title. Picked stories stay picked while the search changes.
 */
export function JiraStoryPicker({ projectKey, selected, onChange }: {
  projectKey: string;
  selected: PickedJiraIssue[];
  onChange: (issues: PickedJiraIssue[]) => void;
}) {
  const [recent, setRecent] = useState<JiraIssue[]>([]);
  const [results, setResults] = useState<JiraIssue[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setQuery('');
    setResults(null);
    jiraProjectsProxy.listProjectIssues(projectKey)
      .then(found => { if (!cancelled) setRecent(found); })
      .catch(err => { if (!cancelled) { setRecent([]); setError(err instanceof Error ? err.message : String(err)); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectKey, reloadToken]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_REMOTE_QUERY) { setResults(null); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      jiraProjectsProxy.searchIssues(projectKey, q)
        .then(found => { if (!cancelled) setResults(found); })
        .catch(err => { if (!cancelled) { setResults([]); setError(err instanceof Error ? err.message : String(err)); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [projectKey, query]);

  const visible = results ?? filterJiraIssues(recent, query);
  const selectedKeys = new Set(selected.map(issue => issue.key));
  const allVisibleSelected = visible.length > 0 && visible.every(issue => selectedKeys.has(issue.key));

  const toggle = (issue: JiraIssue) => onChange(selectedKeys.has(issue.key)
    ? selected.filter(item => item.key !== issue.key)
    : [...selected, { key: issue.key, summary: issue.summary }]);
  const toggleVisible = () => {
    if (allVisibleSelected) {
      const shown = new Set(visible.map(issue => issue.key));
      onChange(selected.filter(item => !shown.has(item.key)));
    } else {
      onChange([...selected, ...visible.filter(issue => !selectedKeys.has(issue.key)).map(issue => ({ key: issue.key, summary: issue.summary }))]);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold">Historias (HU)</label>
        <span className="text-[10px] text-[#8B999D]">{selected.length} seleccionada{selected.length === 1 ? '' : 's'}</span>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(issue => (
            <span key={issue.key} title={issue.summary} className="inline-flex items-center gap-1 bg-[#104B99]/8 text-[#104B99] rounded-md pl-2 pr-1 py-0.5 text-[11px] font-mono font-semibold">
              {issue.key}
              <button type="button" aria-label={`Quitar ${issue.key}`} onClick={() => onChange(selected.filter(item => item.key !== issue.key))} className="hover:text-[#E63946]"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="bg-white border border-[#E8EBEC] rounded-xl overflow-hidden">
        <div className="p-2 border-b border-[#F4F1EA] flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8B999D]" />
            <input placeholder="Buscar HU por clave o título..." value={query} onChange={e => setQuery(e.target.value)}
              className="w-full bg-[#FAFAF7] rounded-lg pl-8 pr-8 py-2 text-[12px] outline-none placeholder:text-[#BABEC3]" />
            {query && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8B999D] hover:text-[#1a1f2e]"><X size={12} /></button>}
          </div>
          {visible.length > 0 && !loading && (
            <button type="button" onClick={toggleVisible} className="text-[11px] font-semibold text-[#104B99] hover:underline whitespace-nowrap px-1">
              {allVisibleSelected ? 'Quitar' : 'Todas'}
            </button>
          )}
        </div>
        <div className="max-h-[240px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-[12px] text-[#8B999D]"><Loader2 size={13} className="animate-spin text-[#104B99]" /> {query.trim().length >= MIN_REMOTE_QUERY ? 'Buscando...' : 'Cargando historias...'}</div>
          ) : error ? (
            <div className="px-4 py-5 text-center text-[12px] text-[#E63946] space-y-1.5">
              <div className="flex items-center justify-center gap-1.5"><AlertCircle size={12} /> No se pudieron cargar las historias de Jira</div>
              <button type="button" onClick={() => { setQuery(''); setReloadToken(t => t + 1); }} className="text-[11px] font-semibold text-[#104B99] hover:underline">Reintentar</button>
            </div>
          ) : visible.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-[#8B999D]">{query.trim() ? `Sin resultados para "${query.trim()}"` : 'Este proyecto no tiene historias'}</div>
          ) : visible.map(issue => {
            const isSel = selectedKeys.has(issue.key);
            return (
              <button key={issue.key} type="button" onClick={() => toggle(issue)}
                className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-[#F4F1EA] last:border-b-0', isSel ? 'bg-[#104B99]/5' : 'hover:bg-[#FAFAF7]')}>
                <div className={cn('w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2', isSel ? 'border-[#104B99] bg-[#104B99]' : 'border-[#E8EBEC]')}>
                  {isSel && <Check size={9} className="text-white" strokeWidth={3} />}
                </div>
                <span className="text-[10px] font-mono font-bold text-[#8B999D] flex-shrink-0">{issue.key}</span>
                <span className={cn('text-[12px] truncate flex-1', isSel ? 'font-semibold text-[#104B99]' : 'font-medium text-[#1a1f2e]')} title={issue.summary}>{issue.summary}</span>
                {issue.status && <span className="text-[10px] text-[#8B999D] flex-shrink-0">{issue.status}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {!query.trim() && !loading && !error && recent.length > 0 && (
        <div className="text-[10px] text-[#8B999D] mt-1.5">Se muestran las {recent.length} HU actualizadas más recientemente; usa el buscador para encontrar otras.</div>
      )}
      {selected.length > SCENARIO_PREVIEW_ISSUE_LIMIT && (
        <div className="flex items-start gap-1.5 mt-1.5 text-[11px] text-[#B7791F]">
          <AlertCircle size={12} className="mt-px flex-shrink-0" />
          Se generan escenarios para un máximo de {SCENARIO_PREVIEW_ISSUE_LIMIT} HU por vez; se usarán las primeras {SCENARIO_PREVIEW_ISSUE_LIMIT}.
        </div>
      )}
    </div>
  );
}
