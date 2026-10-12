import { useEffect, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import { cn } from '../../constants/theme';
import { testDesignApi, type JiraStoryRef } from '../../services/test-design';

/**
 * Multi-select of the stories of one Jira project.
 *
 * Opens on the project's most recently updated stories so the common case needs
 * no typing; the search narrows by key or text (debounced, like
 * JiraRequirementPicker). Sub-tasks never show: the engine excludes them.
 */

export interface PickedStory {
  issueKey: string;
  issueSummary: string;
}

interface StoryMultiPickerProps {
  projectKey: string;
  selected: PickedStory[];
  onChange: (stories: PickedStory[]) => void;
  max: number;
  /** Keys already in the draft: shown as taken, not selectable. */
  excludeKeys?: string[];
}

export function StoryMultiPicker({ projectKey, selected, onChange, max, excludeKeys = [] }: StoryMultiPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JiraStoryRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectKey) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      testDesignApi
        .searchStories(projectKey, query)
        .then((issues) => {
          if (!cancelled) setResults(issues);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, query ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [projectKey, query]);

  // Results belong to the project they were fetched for; hide them while another one loads.
  const visibleResults = projectKey ? results : [];
  const selectedKeys = new Set(selected.map((s) => s.issueKey));
  const taken = new Set(excludeKeys.map((k) => k.toUpperCase()));
  const full = selected.length >= max;

  function toggle(issue: JiraStoryRef) {
    if (selectedKeys.has(issue.key)) {
      onChange(selected.filter((s) => s.issueKey !== issue.key));
    } else if (!full) {
      onChange([...selected, { issueKey: issue.key, issueSummary: issue.summary }]);
    }
  }

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((story) => (
            <span
              key={story.issueKey}
              title={story.issueSummary}
              className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-[#1a1f2e] text-white text-[11px] font-semibold"
            >
              {story.issueKey}
              <button
                type="button"
                onClick={() => onChange(selected.filter((s) => s.issueKey !== story.issueKey))}
                className="w-4 h-4 rounded-full hover:bg-white/20 flex items-center justify-center"
                aria-label={`Quitar ${story.issueKey}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B999D]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!projectKey}
          placeholder={projectKey ? 'Buscar por key o texto…' : 'Selecciona un proyecto de Jira primero'}
          className="w-full pl-8 pr-8 py-2.5 rounded-xl border border-[#E8EBEC] bg-white text-[12px] text-[#1a1f2e] outline-none focus:border-[#104B99] disabled:bg-[#FAFAF7]"
        />
        {loading && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#48A157]" />}
      </div>

      {error && <p className="text-[11px] text-[#B4463C]">{error}</p>}

      {projectKey && (
        <div className="rounded-xl border border-[#E8EBEC] bg-white max-h-[280px] overflow-y-auto divide-y divide-[#F0F1F2]">
          {visibleResults.length === 0 && !loading && (
            <div className="px-3 py-4 text-[12px] text-[#8B999D] text-center">Sin historias que coincidan</div>
          )}
          {visibleResults.map((issue) => {
            const isTaken = taken.has(issue.key.toUpperCase());
            const isSelected = selectedKeys.has(issue.key);
            const disabled = isTaken || (!isSelected && full);
            return (
              <button
                key={issue.key}
                type="button"
                onClick={() => toggle(issue)}
                disabled={disabled}
                className={cn(
                  'w-full text-left px-3 py-2.5 flex items-center gap-3 text-[12px] transition',
                  isSelected ? 'bg-[#F1F8F2]' : 'hover:bg-[#FAFAF7]',
                  disabled && 'opacity-50 cursor-not-allowed',
                )}
              >
                <span
                  className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                    isSelected ? 'bg-[#48A157] border-[#48A157]' : 'border-[#BABEC3] bg-white',
                  )}
                >
                  {isSelected && <Check size={11} strokeWidth={3} className="text-white" />}
                </span>
                <span className="font-semibold text-[#104B99] flex-shrink-0">{issue.key}</span>
                <span className="text-[#1a1f2e] truncate flex-1">{issue.summary}</span>
                <span className="text-[10px] text-[#8B999D] flex-shrink-0">
                  {isTaken ? 'ya en el borrador' : issue.status}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-[#8B999D]">
        {selected.length} de {max} historias como máximo por borrador.
      </p>
    </div>
  );
}
