import { useEffect, useRef, useState } from 'react';
import { AlertCircle, GitBranch, Loader2, Search, X } from 'lucide-react';
import { jiraProjectsProxy } from '../../services/jira';
import type { JiraIssue } from '../../services/jira/types';

export function JiraRequirementPicker({
  selectedIssue,
  onSelectIssue,
}: {
  selectedIssue: JiraIssue | null;
  onSelectIssue: (issue: JiraIssue | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const requestId = ++requestSeq.current;
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2 || selectedIssue) {
      setIssues([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      jiraProjectsProxy.searchAllIssues(trimmedQuery)
        .then((results) => {
          if (requestId === requestSeq.current) setIssues(results);
        })
        .catch((error) => {
          if (requestId === requestSeq.current) {
            setIssues([]);
            setSearchError(error instanceof Error ? error.message : 'No se pudo buscar en Jira');
          }
        })
        .finally(() => {
          if (requestId === requestSeq.current) setSearchLoading(false);
        });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query, selectedIssue]);

  function clearSelectedIssue() {
    onSelectIssue(null);
    setQuery('');
    setIssues([]);
    setSearchError(null);
  }

  return (
    <div className="bg-[#FAFAF7] rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-[#0052CC] flex items-center justify-center">
          <GitBranch size={15} className="text-white" />
        </div>
        <div>
          <div className="text-[14px] font-semibold text-[#1a1f2e]">Jira</div>
          <p className="text-[11px] text-[#8B999D]">Busca y vincula el caso con la evidencia</p>
        </div>
      </div>

      <div>
        <label htmlFor="jira-issue-search" className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold mb-1.5 block">
          Caso o requerimiento Jira
        </label>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B999D]" />
          <input
            id="jira-issue-search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (selectedIssue) onSelectIssue(null);
            }}
            placeholder="Buscar por clave o título, ej. IPF-426"
            aria-label="Buscar caso o requerimiento Jira por clave o título"
            aria-busy={searchLoading}
            className="w-full bg-white border border-[#E8EBEC] rounded-xl pl-9 pr-9 py-2.5 text-[13px] outline-none focus:border-[#0052CC] focus:ring-4 focus:ring-[#0052CC]/10"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(''); setIssues([]); setSearchError(null); onSelectIssue(null); }} aria-label="Limpiar búsqueda Jira"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B999D] hover:text-[#1a1f2e]">
              <X size={14} />
            </button>
          )}
        </div>
        {query.trim().length === 1 && <p className="mt-1.5 text-[11px] text-[#8B999D]">Escribe al menos 2 caracteres para buscar.</p>}
      </div>

      {searchLoading && (
        <div className="flex items-center gap-2 rounded-xl border border-[#E8EBEC] bg-white px-3 py-2.5 text-[12px] text-[#8B999D]">
          <Loader2 size={13} className="animate-spin text-[#0052CC]" /> Buscando en Jira…
        </div>
      )}
      {searchError && (
        <div role="alert" className="flex items-start gap-1.5 text-[11px] text-[#E63946]">
          <AlertCircle size={12} className="mt-0.5 shrink-0" /> {searchError}
        </div>
      )}
      {!searchLoading && query.trim().length >= 2 && !selectedIssue && !searchError && issues.length === 0 && (
        <div className="rounded-xl border border-[#E8EBEC] bg-white px-3 py-2.5 text-[12px] text-[#8B999D]">
          No se encontraron casos para esta búsqueda.
        </div>
      )}
      {issues.length > 0 && !selectedIssue && (
        <div className="max-h-56 overflow-y-auto rounded-xl border border-[#E8EBEC] bg-white divide-y divide-[#F4F1EA]">
          {issues.map((issue) => (
            <button key={issue.key} type="button" onClick={() => { onSelectIssue(issue); setQuery(`${issue.key} — ${issue.summary}`); setIssues([]); }}
              className="w-full text-left px-3 py-2.5 hover:bg-[#0052CC]/5 transition-colors">
              <span className="text-[11px] font-mono font-bold text-[#0052CC]">{issue.key}</span>
              <span className="ml-2 text-[12px] font-medium text-[#1a1f2e]">{issue.summary}</span>
              {(issue.issueType || issue.status) && (
                <span className="block mt-1 text-[10px] text-[#8B999D]">{[issue.issueType, issue.status].filter(Boolean).join(' · ')}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {selectedIssue && (
        <div className="rounded-xl border border-[#0052CC]/20 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] font-mono font-bold text-[#0052CC]">{selectedIssue.key}</span>
              <p className="mt-1 text-[12px] font-medium text-[#1a1f2e]">{selectedIssue.summary}</p>
              <p className="mt-2 text-[10px] text-[#8B999D]">Se usará como Requerimiento en el documento de evidencia.</p>
            </div>
            <button type="button" onClick={clearSelectedIssue} className="shrink-0 text-[11px] font-semibold text-[#0052CC] hover:underline">
              Cambiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
