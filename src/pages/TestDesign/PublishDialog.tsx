import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, MinusCircle, Send, X, XCircle } from 'lucide-react';
import { cn } from '../../constants/theme';
import { ApiError } from '../../services/http';
import {
  testDesignApi,
  type PublishIssue,
  type StoryJiraResult,
  type StoryTestRailResult,
  type SubtaskTypeInfo,
  type TestDesignDraftWithStories,
  type TestDesignScenario,
} from '../../services/test-design';

/**
 * Confirm → publish → results, for one destination.
 *
 * The confirmation says exactly what will happen (cases created vs updated,
 * sub-tasks created vs updated and their issue type) because publishing writes
 * to shared systems other people read.
 */

export type PublishDestination = 'testrail' | 'jira';

interface PublishDialogProps {
  destination: PublishDestination;
  draft: TestDesignDraftWithStories;
  /** The editor's current lists (may be ahead of `draft` until saved). */
  scenarios: Record<string, TestDesignScenario[]>;
  sectionLabel: string;
  /** Saves pending edits; publishing must send what the user sees. */
  beforePublish: () => Promise<void>;
  onPublished: (draft: TestDesignDraftWithStories) => void;
  onClose: () => void;
}

type Phase =
  | { kind: 'confirm' }
  | { kind: 'publishing' }
  | { kind: 'incomplete'; issues: PublishIssue[] }
  | { kind: 'error'; message: string }
  | { kind: 'testrail-done'; results: StoryTestRailResult[] }
  | { kind: 'jira-done'; results: StoryJiraResult[] };

function StatusIcon({ status }: { status: string }) {
  if (status === 'failed') return <XCircle size={13} className="text-[#B4463C] shrink-0" />;
  if (status === 'skipped') return <MinusCircle size={13} className="text-[#8B999D] shrink-0" />;
  if (status === 'partial') return <AlertTriangle size={13} className="text-[#C98A1B] shrink-0" />;
  return <CheckCircle2 size={13} className="text-[#48A157] shrink-0" />;
}

const STATUS_TEXT: Record<string, string> = {
  created: 'creado',
  updated: 'actualizado',
  recreated: 'recreado (se había eliminado)',
  failed: 'falló',
  skipped: 'sin escenarios seleccionados',
  published: 'publicado',
  partial: 'publicado en parte',
};

export function PublishDialog({
  destination,
  draft,
  scenarios,
  sectionLabel,
  beforePublish,
  onPublished,
  onClose,
}: PublishDialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'confirm' });
  const [subtaskType, setSubtaskType] = useState<SubtaskTypeInfo | null>(null);

  useEffect(() => {
    if (destination !== 'jira') return;
    let cancelled = false;
    testDesignApi
      .getSubtaskType(draft.jiraProjectKey)
      .then((info) => {
        if (!cancelled) setSubtaskType(info);
      })
      .catch((err) => {
        if (!cancelled) setSubtaskType({ issueType: null, message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [destination, draft.jiraProjectKey]);

  const plan = draft.stories.map((story) => {
    const list = (scenarios[story.id] ?? story.scenarios).filter((s) =>
      destination === 'testrail' ? s.selectedForTestRail : s.selectedForJira,
    );
    return {
      story,
      count: list.length,
      updates: list.filter((s) => s.testRailCaseId !== null).length,
    };
  });
  const totalSelected = plan.reduce((sum, p) => sum + p.count, 0);
  const jiraTypeMissing = destination === 'jira' && subtaskType !== null && subtaskType.issueType === null;
  const needsNewSubtask = plan.some((p) => p.count > 0 && !p.story.jiraSubtaskKey);

  async function publish() {
    setPhase({ kind: 'publishing' });
    try {
      await beforePublish();
      if (destination === 'testrail') {
        const res = await testDesignApi.publishTestRail(draft.id);
        onPublished(res.draft);
        setPhase({ kind: 'testrail-done', results: res.results });
      } else {
        const res = await testDesignApi.publishJira(draft.id);
        onPublished(res.draft);
        setPhase({ kind: 'jira-done', results: res.results });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && Array.isArray(err.payload?.issues)) {
        setPhase({ kind: 'incomplete', issues: err.payload.issues });
      } else {
        setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  const title = destination === 'testrail' ? 'Subir a TestRail' : 'Publicar en Jira';
  const busy = phase.kind === 'publishing';

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6" onClick={busy ? undefined : onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="px-6 py-4 border-b border-[#F0F1F2] flex items-center justify-between">
          <div className="text-[16px] font-semibold text-[#1a1f2e]">{title}</div>
          {!busy && (
            <button onClick={onClose} className="text-[#8B999D] hover:text-[#1a1f2e]" aria-label="Cerrar">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="px-6 py-5 overflow-y-auto text-[12px] text-[#58646D] space-y-4">
          {(phase.kind === 'confirm' || phase.kind === 'publishing') && (
            <>
              {destination === 'testrail' ? (
                <p>
                  Destino: <span className="font-semibold text-[#1a1f2e]">{sectionLabel}</span>. Cada escenario seleccionado se
                  crea como caso, con la historia en <i>refs</i>; los que ya tienen caso se actualizan.
                </p>
              ) : (
                <p>
                  Se crea una sub-tarea bajo cada historia con todos sus escenarios seleccionados para Jira, o se actualiza la
                  que ya existe.{' '}
                  {subtaskType === null ? (
                    <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Consultando el tipo…</span>
                  ) : subtaskType.issueType ? (
                    <>Tipo de sub-tarea: <span className="font-semibold text-[#1a1f2e]">{subtaskType.issueType.name}</span>.</>
                  ) : null}
                </p>
              )}
              {jiraTypeMissing && needsNewSubtask && (
                <div className="rounded-xl bg-[#FBEDEB] px-3 py-2 text-[#B4463C] flex gap-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {subtaskType?.message}
                </div>
              )}
              <div className="rounded-xl border border-[#E8EBEC] divide-y divide-[#F0F1F2]">
                {plan.map(({ story, count, updates }) => (
                  <div key={story.id} className="px-3 py-2.5 flex items-center gap-3">
                    <span className="font-semibold text-[#104B99] w-20 shrink-0">{story.issueKey}</span>
                    <span className="flex-1 truncate">{story.issueSummary}</span>
                    <span className={cn('shrink-0', count === 0 && 'text-[#8B999D]')}>
                      {count === 0
                        ? 'se omite'
                        : destination === 'testrail'
                          ? `${count - updates} nuevos · ${updates} a actualizar`
                          : `${count} casos · ${story.jiraSubtaskKey ? `actualiza ${story.jiraSubtaskKey}` : 'nueva sub-tarea'}`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {phase.kind === 'incomplete' && (
            <>
              <div className="rounded-xl bg-[#FBEDEB] px-3 py-2 text-[#B4463C] flex gap-2">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                No se publicó nada: hay escenarios seleccionados incompletos. Corrígelos o desmárcalos.
              </div>
              <ul className="space-y-1.5">
                {phase.issues.map((issue, i) => (
                  <li key={`${issue.scenarioId}-${i}`}>
                    <span className="font-semibold text-[#104B99]">{issue.issueKey}</span> · {issue.title || 'Sin título'}:{' '}
                    <span className="text-[#B4463C]">{issue.problem}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {phase.kind === 'error' && (
            <div className="rounded-xl bg-[#FBEDEB] px-3 py-2 text-[#B4463C] flex gap-2">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {phase.message}
            </div>
          )}

          {phase.kind === 'testrail-done' &&
            phase.results.map((result) => (
              <div key={result.storyId} className="rounded-xl border border-[#E8EBEC]">
                <div className="px-3 py-2 flex items-center gap-2 bg-[#FAFAF7] rounded-t-xl">
                  <StatusIcon status={result.status} />
                  <span className="font-semibold text-[#104B99]">{result.issueKey}</span>
                  <span>{STATUS_TEXT[result.status]}</span>
                </div>
                {result.scenarios.map((s) => (
                  <div key={s.scenarioId} className="px-3 py-2 border-t border-[#F0F1F2] flex items-start gap-2">
                    <StatusIcon status={s.status} />
                    <span className="flex-1">
                      <span className="text-[#1a1f2e]">{s.title}</span>{' '}
                      <span className="text-[#8B999D]">— {STATUS_TEXT[s.status]}</span>
                      {s.message && <div className="text-[#B4463C] mt-0.5">{s.message}</div>}
                    </span>
                    {s.caseId &&
                      (s.caseUrl ? (
                        <a href={s.caseUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#104B99] flex items-center gap-1">
                          C{s.caseId} <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="font-semibold text-[#104B99]">C{s.caseId}</span>
                      ))}
                  </div>
                ))}
              </div>
            ))}

          {phase.kind === 'jira-done' && (
            <div className="rounded-xl border border-[#E8EBEC] divide-y divide-[#F0F1F2]">
              {phase.results.map((r) => (
                <div key={r.storyId} className="px-3 py-2.5 flex items-start gap-2">
                  <StatusIcon status={r.status} />
                  <span className="flex-1">
                    <span className="font-semibold text-[#104B99]">{r.issueKey}</span>{' '}
                    <span className="text-[#8B999D]">
                      — {r.status === 'skipped' ? STATUS_TEXT.skipped : `sub-tarea ${STATUS_TEXT[r.status]}`}
                      {r.scenarioCount > 0 && r.status !== 'failed' ? ` con ${r.scenarioCount} casos` : ''}
                    </span>
                    {r.message && r.status === 'failed' && <div className="text-[#B4463C] mt-0.5">{r.message}</div>}
                  </span>
                  {r.subtaskKey && r.url && (
                    <a href={r.url} target="_blank" rel="noreferrer" className="font-semibold text-[#104B99] flex items-center gap-1">
                      {r.subtaskKey} <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {destination === 'jira' && phase.kind === 'confirm' && draft.stories.some((s) => !s.testRailPublishedAt) && (
            <p className="text-[11px] text-[#8B999D]">
              Consejo: si subes primero a TestRail, la sub-tarea incluirá el link a cada caso.
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#F0F1F2] flex justify-end gap-2">
          {phase.kind === 'confirm' || phase.kind === 'publishing' ? (
            <>
              <button onClick={onClose} disabled={busy} className="text-[12px] px-4 py-2 rounded-full text-[#58646D] hover:bg-[#FAFAF7]">
                Cancelar
              </button>
              <button
                onClick={publish}
                disabled={busy || totalSelected === 0 || (jiraTypeMissing && needsNewSubtask)}
                className={cn(
                  'text-white text-[12px] font-semibold px-5 py-2 rounded-full flex items-center gap-1.5 disabled:bg-[#BABEC3]',
                  destination === 'testrail' ? 'bg-[#48A157]' : 'bg-[#104B99]',
                )}
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                {busy ? 'Publicando…' : `Publicar ${totalSelected} ${totalSelected === 1 ? 'caso' : 'casos'}`}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="bg-[#1a1f2e] text-white text-[12px] font-semibold px-5 py-2 rounded-full">
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
