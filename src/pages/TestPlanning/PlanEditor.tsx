import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  GitCommitHorizontal,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '../../constants/theme';
import {
  testPlanning,
  type PlanDocument,
  type PlanExamples,
  type PlanPreview,
  type PlanScenario,
  type StepKind,
} from '../../services/test-planning';
import {
  blankExamples,
  blankScenario,
  defaultCommitMessage,
  duplicateScenario,
  kindOf,
  keywordFor,
  moveItem,
  parseDiff,
  REVIEW_LABELS,
  reviewState,
  scenarioChange,
  summarizeDraft,
  type ScenarioChange,
} from './plan-utils';

const KIND_STYLE: Record<StepKind, string> = {
  given: 'text-[#104B99]',
  when: 'text-[#B7791F]',
  then: 'text-[#48A157]',
  and: 'text-[#8B999D]',
  but: 'text-[#8B999D]',
};

const FIELD = 'w-full bg-[#FAFAF7] border border-[#E8EBEC] focus:border-[#104B99] focus:bg-white rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none placeholder:text-[#BABEC3]';
const ICON_BTN = 'w-7 h-7 rounded-lg flex items-center justify-center text-[#8B999D] hover:bg-[#F4F1EA] hover:text-[#1a1f2e] disabled:opacity-30 disabled:hover:bg-transparent';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// --- Examples table ---------------------------------------------------------

function ExamplesEditor({ examples, onChange, onRemove }: { examples: PlanExamples; onChange: (next: PlanExamples) => void; onRemove: () => void }) {
  const setHeader = (col: number, value: string) => onChange({ ...examples, header: examples.header.map((h, i) => (i === col ? value : h)) });
  const setCell = (row: number, col: number, value: string) =>
    onChange({ ...examples, rows: examples.rows.map((r, i) => (i === row ? r.map((c, j) => (j === col ? value : c)) : r)) });
  const addRow = () => onChange({ ...examples, rows: [...examples.rows, examples.header.map(() => '')] });
  const removeRow = (row: number) => onChange({ ...examples, rows: examples.rows.filter((_, i) => i !== row) });
  const addColumn = () => onChange({ ...examples, header: [...examples.header, 'columna'], rows: examples.rows.map((r) => [...r, '']) });
  const removeColumn = (col: number) =>
    onChange({ ...examples, header: examples.header.filter((_, i) => i !== col), rows: examples.rows.map((r) => r.filter((_, i) => i !== col)) });

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-[#58646D]">Ejemplos</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={addColumn} className="text-[11px] text-[#104B99] hover:underline">+ columna</button>
          <span className="text-[#E8EBEC]">|</span>
          <button type="button" onClick={onRemove} className="text-[11px] text-[#E63946] hover:underline">quitar tabla</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#E8EBEC]">
        <table className="text-[12px] w-full">
          <thead className="bg-[#FAFAF7]">
            <tr>
              {examples.header.map((h, col) => (
                <th key={col} className="px-1.5 py-1 min-w-[120px]">
                  <div className="flex items-center gap-1">
                    <input value={h} onChange={(e) => setHeader(col, e.target.value)} className={cn(FIELD, 'font-semibold')} />
                    {examples.header.length > 1 && (
                      <button type="button" title="Quitar columna" onClick={() => removeColumn(col)} className={ICON_BTN}><X size={12} /></button>
                    )}
                  </div>
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {examples.rows.map((row, r) => (
              <tr key={r} className="border-t border-[#F0F1F2]">
                {row.map((cell, c) => (
                  <td key={c} className="px-1.5 py-1"><input value={cell} onChange={(e) => setCell(r, c, e.target.value)} className={FIELD} /></td>
                ))}
                <td className="px-1">
                  <button type="button" title="Quitar fila" onClick={() => removeRow(r)} className={ICON_BTN}><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addRow} className="mt-1 text-[11px] text-[#104B99] hover:underline">+ fila</button>
    </div>
  );
}

// --- One scenario -------------------------------------------------------------

interface ScenarioCardProps {
  doc: PlanDocument;
  scenario: PlanScenario;
  index: number;
  count: number;
  change: ScenarioChange;
  editable: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (next: PlanScenario) => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function ScenarioCard({ doc, scenario, index, count, change, editable, open, onToggle, onChange, onMove, onDuplicate, onDelete }: ScenarioCardProps) {
  const canEditBody = editable && !scenario.locked;
  const patch = (fields: Partial<PlanScenario>) => onChange({ ...scenario, ...fields });
  const setStep = (i: number, fields: Partial<PlanScenario['steps'][number]>) =>
    patch({ steps: scenario.steps.map((s, j) => (j === i ? { ...s, ...fields } : s)) });
  const keywordChoices = (current: string) => {
    const options = doc.keywordOptions.map((o) => o.keyword);
    return options.includes(current) || !current ? options : [current, ...options];
  };

  return (
    <div className={cn('bg-white rounded-xl border overflow-hidden', change === 'new' ? 'border-[#48A157]/40' : change === 'edited' ? 'border-[#104B99]/40' : 'border-[#E8EBEC]')}>
      <div className="flex items-start gap-2 px-3 py-2.5 hover:bg-[#FAFAF7]">
        <button type="button" onClick={onToggle} className="flex-1 min-w-0 flex items-start gap-2.5 text-left">
          <span className="text-[11px] font-mono text-[#BABEC3] mt-0.5 w-6 flex-shrink-0 text-right">{index + 1}</span>
          {open ? <ChevronDown size={14} className="mt-0.5 text-[#8B999D] flex-shrink-0" /> : <ChevronRight size={14} className="mt-0.5 text-[#8B999D] flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            {scenario.comments.filter(Boolean).length > 0 && <div className="text-[10px] text-[#8B999D] truncate">{scenario.comments.filter(Boolean).join(' · ')}</div>}
            <div className="text-[13px] text-[#1a1f2e]">
              <span className="text-[#8B999D]">{scenario.examples.length ? 'Esquema' : 'Escenario'}:</span>{' '}
              <span className="font-medium">{scenario.title || <span className="italic text-[#BABEC3]">Sin título</span>}</span>
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          {change === 'new' && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#48A157]/10 text-[#48A157]">nuevo</span>}
          {change === 'edited' && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#104B99]/10 text-[#104B99]">editado</span>}
          {scenario.locked && <span title={scenario.locked}><Lock size={12} className="text-[#B7791F]" /></span>}
          <span className="text-[10px] text-[#8B999D]">
            {scenario.steps.length} pasos{scenario.examples.length ? ` · ${scenario.examples.reduce((n, e) => n + e.rows.length, 0)} ej.` : ''}
          </span>
          {editable && (
            <div className="flex items-center">
              <button type="button" title="Subir" disabled={index === 0} onClick={() => onMove(-1)} className={ICON_BTN}><ArrowUp size={13} /></button>
              <button type="button" title="Bajar" disabled={index === count - 1} onClick={() => onMove(1)} className={ICON_BTN}><ArrowDown size={13} /></button>
              <button type="button" title="Duplicar" disabled={!!scenario.locked} onClick={onDuplicate} className={ICON_BTN}><Copy size={13} /></button>
              <button type="button" title="Eliminar" onClick={onDelete} className={cn(ICON_BTN, 'hover:text-[#E63946]')}><Trash2 size={13} /></button>
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 pl-[52px] space-y-3">
          {scenario.locked && (
            <div className="rounded-lg bg-[#FFF7E6] px-3 py-2 text-[11px] text-[#8A5A00] flex items-start gap-1.5">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              <span>Este escenario tiene una línea que no es Gherkin válido; se conserva tal cual y no se puede editar aquí. {scenario.locked}</span>
            </div>
          )}

          {canEditBody ? (
            <>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold">Comentario / regla</label>
                <textarea
                  rows={Math.max(1, scenario.comments.length)}
                  value={scenario.comments.join('\n')}
                  onChange={(e) => patch({ comments: e.target.value.split('\n') })}
                  onBlur={() => patch({ comments: scenario.comments.map((c) => c.trim()).filter(Boolean) })}
                  placeholder="Regla 1 (RN-01, CA-01)"
                  className={cn(FIELD, 'resize-none')}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold">Título</label>
                <input value={scenario.title} onChange={(e) => patch({ title: e.target.value })} className={cn(FIELD, 'font-medium')} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold">Pasos</label>
                <div className="space-y-1.5 mt-1">
                  {scenario.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <select
                        value={step.keyword}
                        onChange={(e) => setStep(i, { keyword: e.target.value })}
                        className={cn('bg-white border border-[#E8EBEC] rounded-lg px-1.5 py-1.5 text-[12px] font-semibold w-[104px] flex-shrink-0 outline-none focus:border-[#104B99]', KIND_STYLE[kindOf(doc, step.keyword)])}
                      >
                        {keywordChoices(step.keyword).map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                      <textarea
                        rows={Math.min(4, Math.max(1, Math.ceil(step.text.length / 90)))}
                        value={step.text}
                        onChange={(e) => setStep(i, { text: e.target.value.replace(/\n/g, ' ') })}
                        className={cn(FIELD, 'resize-none flex-1')}
                      />
                      <button type="button" title="Subir paso" disabled={i === 0} onClick={() => patch({ steps: moveItem(scenario.steps, i, -1) })} className={ICON_BTN}><ArrowUp size={12} /></button>
                      <button type="button" title="Bajar paso" disabled={i === scenario.steps.length - 1} onClick={() => patch({ steps: moveItem(scenario.steps, i, 1) })} className={ICON_BTN}><ArrowDown size={12} /></button>
                      <button type="button" title="Quitar paso" onClick={() => patch({ steps: scenario.steps.filter((_, j) => j !== i) })} className={cn(ICON_BTN, 'hover:text-[#E63946]')}><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => patch({ steps: [...scenario.steps, { keyword: keywordFor(doc, scenario.steps.length ? 'and' : 'given'), text: '' }] })}
                  className="mt-1.5 text-[11px] text-[#104B99] hover:underline inline-flex items-center gap-1"
                >
                  <Plus size={11} /> Agregar paso
                </button>
              </div>
              {scenario.examples.map((examples, i) => (
                <ExamplesEditor
                  key={i}
                  examples={examples}
                  onChange={(next) => patch({ examples: scenario.examples.map((e, j) => (j === i ? next : e)) })}
                  onRemove={() => patch({ examples: scenario.examples.filter((_, j) => j !== i) })}
                />
              ))}
              {scenario.examples.length === 0 && (
                <button type="button" onClick={() => patch({ examples: [blankExamples(scenario)] })} className="text-[11px] text-[#104B99] hover:underline inline-flex items-center gap-1">
                  <Table2 size={11} /> Agregar tabla de Ejemplos (convierte en esquema)
                </button>
              )}
            </>
          ) : (
            <>
              {scenario.tags.length > 0 && <div className="text-[11px] font-mono text-[#104B99]">{scenario.tags.join(' ')}</div>}
              <ol className="space-y-1">
                {scenario.steps.map((step, i) => (
                  <li key={i} className="text-[12.5px] text-[#1a1f2e] leading-relaxed">
                    <span className={cn('font-semibold mr-1.5', KIND_STYLE[kindOf(doc, step.keyword)])}>{step.keyword}</span>
                    {step.text}
                  </li>
                ))}
              </ol>
              {scenario.examples.map((examples, i) => (
                <div key={i}>
                  <div className="text-[11px] font-semibold text-[#58646D] mb-1">{examples.keyword || 'Ejemplos'}{examples.name ? `: ${examples.name}` : ''}</div>
                  <div className="overflow-x-auto rounded-lg border border-[#E8EBEC]">
                    <table className="text-[12px] w-full">
                      <thead className="bg-[#FAFAF7]">
                        <tr>{examples.header.map((h, j) => <th key={j} className="text-left font-semibold text-[#58646D] px-3 py-1.5">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {examples.rows.map((row, r) => (
                          <tr key={r} className="border-t border-[#F0F1F2]">{row.map((cell, c) => <td key={c} className="px-3 py-1.5 text-[#1a1f2e]">{cell}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// --- Dialogs -------------------------------------------------------------------

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div
        className={cn('bg-white rounded-2xl shadow-xl w-full max-h-[90vh] flex flex-col', wide ? 'max-w-4xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#F0F1F2] flex items-center justify-between">
          <div className="text-[14px] font-semibold text-[#1a1f2e]">{title}</div>
          <button type="button" onClick={onClose} className={ICON_BTN}><X size={14} /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-3">{children}</div>
      </div>
    </div>
  );
}

function CommitDialog({ slug, doc, draft, canCommit, onClose, onCommitted, onReload }: {
  slug: string;
  doc: PlanDocument;
  draft: PlanScenario[];
  canCommit: boolean;
  onClose: () => void;
  onCommitted: (plan: PlanDocument, commitSha: string) => void;
  onReload: () => void;
}) {
  const payload = useMemo(
    () => ({ branch: doc.branch, path: doc.file.path, baseBlobSha: doc.file.blobSha, scenarios: draft }),
    [doc, draft],
  );
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [error, setError] = useState<{ text: string; conflict: boolean } | null>(null);
  const [commitMessage, setCommitMessage] = useState(defaultCommitMessage(doc.file.key));
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    testPlanning
      .preview(slug, payload)
      .then(setPreview)
      .catch((e) => setError({ text: message(e), conflict: (e as { status?: number }).status === 409 }));
  }, [slug, payload]);

  const commit = async () => {
    setCommitting(true);
    setError(null);
    try {
      const res = await testPlanning.commit(slug, { ...payload, message: commitMessage });
      onCommitted(res.plan, res.commitSha);
    } catch (e) {
      setError({ text: message(e), conflict: (e as { status?: number }).status === 409 });
      setCommitting(false);
    }
  };

  const blocked = !preview || !preview.changed || preview.problems.length > 0 || preview.protected || !canCommit;
  const diff = preview ? parseDiff(preview.diff) : [];

  return (
    <Modal title={`Commit y push — ${doc.file.key}`} onClose={committing ? () => undefined : onClose} wide>
      {!preview && !error && <div className="flex items-center gap-2 text-[12px] text-[#8B999D]"><Loader2 size={13} className="animate-spin" /> Calculando cambios…</div>}
      {error && (
        <div className="rounded-xl bg-[#FBEDEB] px-4 py-2.5 text-[12px] text-[#B4463C]">
          {error.text}
          {error.conflict && (
            <button type="button" onClick={onReload} className="ml-2 underline font-semibold">Recargar el plan (se pierden tus cambios)</button>
          )}
        </div>
      )}
      {preview && (
        <>
          <div className="text-[12px] text-[#58646D]">
            Rama <span className="font-mono text-[#1a1f2e]">{doc.branch}</span> · {preview.stats.edited} editados · {preview.stats.added} nuevos · {preview.stats.removed} eliminados
            {preview.stats.reordered ? ' · orden cambiado' : ''}
          </div>
          {preview.protected && <div className="rounded-xl bg-[#FBEDEB] px-4 py-2.5 text-[12px] text-[#B4463C]">La rama está protegida: no se permite commit desde QA Lab.</div>}
          {!canCommit && <div className="rounded-xl bg-[#F4F1EA] px-4 py-2.5 text-[12px] text-[#58646D]">Tu rol no tiene el permiso "Hacer commit y push". Pide a un QA Lead que haga el commit.</div>}
          {preview.problems.length > 0 && (
            <div className="rounded-xl bg-[#FBEDEB] px-4 py-2.5 text-[12px] text-[#B4463C]">
              <div className="font-semibold mb-1">Corrige estos escenarios antes del commit:</div>
              <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                {preview.problems.map((p) => <li key={p.id}><span className="font-medium">{p.title || 'Sin título'}</span>: {p.errors.join(' ')}</li>)}
              </ul>
            </div>
          )}
          {preview.danglingCoverage.length > 0 && (
            <div className="rounded-xl bg-[#FFF7E6] px-4 py-2.5 text-[11px] text-[#8A5A00]">
              La tabla de Cobertura todavía menciona escenarios eliminados: {preview.danglingCoverage.join('; ')}.
            </div>
          )}
          <div className="rounded-xl border border-[#E8EBEC] overflow-auto max-h-[45vh] bg-[#FAFAF7]">
            <pre className="text-[11.5px] font-mono leading-[1.55]">
              {diff.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    'px-3 whitespace-pre-wrap break-words',
                    line.kind === 'add' && 'bg-[#48A157]/10 text-[#1E6B2B]',
                    line.kind === 'del' && 'bg-[#E63946]/10 text-[#9B1C26]',
                    line.kind === 'hunk' && 'text-[#104B99] bg-[#104B99]/5 mt-1',
                    (line.kind === 'ctx' || line.kind === 'meta') && 'text-[#58646D]',
                  )}
                >
                  {line.kind === 'add' ? '+ ' : line.kind === 'del' ? '- ' : line.kind === 'ctx' ? '  ' : ''}
                  {line.text}
                </div>
              ))}
            </pre>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold">Mensaje del commit</label>
            <input value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} className={FIELD} />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} disabled={committing} className="px-3 py-1.5 rounded-full border border-[#E8EBEC] text-[12px] text-[#58646D] hover:bg-[#FAFAF7]">Cancelar</button>
            <button
              type="button"
              onClick={commit}
              disabled={blocked || committing || !commitMessage.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1a1f2e] text-white text-[12px] font-semibold hover:bg-black disabled:bg-[#BABEC3]"
            >
              {committing ? <Loader2 size={13} className="animate-spin" /> : <GitCommitHorizontal size={13} />} Hacer commit y push
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function AcceptDialog({ slug, doc, onClose, onAccepted }: { slug: string; doc: PlanDocument; onClose: () => void; onAccepted: (plan: PlanDocument) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await testPlanning.accept(slug, { branch: doc.branch, path: doc.file.path, blobSha: doc.file.blobSha, note: note.trim() || undefined });
      onAccepted(res.plan);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  };
  return (
    <Modal title={`Aceptar ${doc.file.key} como válido`} onClose={busy ? () => undefined : onClose}>
      <div className="text-[12px] text-[#58646D]">
        Confirmas que los {doc.scenarios.length} escenarios cubren la HU tal como están. No se cambia el repositorio; queda registrado en QA Lab
        (y en el dashboard) para esta versión del archivo.
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold">Nota (opcional)</label>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={cn(FIELD, 'resize-none')} placeholder="Observaciones de la revisión" />
      </div>
      {error && <div className="rounded-xl bg-[#FBEDEB] px-4 py-2.5 text-[12px] text-[#B4463C]">{error}</div>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className="px-3 py-1.5 rounded-full border border-[#E8EBEC] text-[12px] text-[#58646D] hover:bg-[#FAFAF7]">Cancelar</button>
        <button type="button" onClick={accept} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#48A157] text-white text-[12px] font-semibold hover:bg-[#3d8a4a] disabled:bg-[#BABEC3]">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Aceptar como válido
        </button>
      </div>
    </Modal>
  );
}

// --- The editor --------------------------------------------------------------------

export interface PlanEditorProps {
  slug: string;
  doc: PlanDocument;
  canEdit: boolean;
  canCommit: boolean;
  onDirtyChange: (dirty: boolean) => void;
  /** A new version of the plan after a commit or an acceptance. */
  onDocChange: (plan: PlanDocument, notice: string) => void;
  onReload: () => void;
}

export function PlanEditor({ slug, doc, canEdit, canCommit, onDirtyChange, onDocChange, onReload }: PlanEditorProps) {
  const [draft, setDraft] = useState<PlanScenario[]>(() => structuredClone(doc.scenarios));
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<'commit' | 'accept' | null>(null);

  const editable = canEdit && !doc.readOnlyReason;
  const originals = useMemo(() => new Map(doc.scenarios.map((s) => [s.id, s])), [doc]);
  const summary = useMemo(() => summarizeDraft(doc.scenarios, draft), [doc, draft]);
  const state = reviewState(doc.review);
  const allOpen = draft.length > 0 && openIds.size >= draft.length;

  useEffect(() => {
    onDirtyChange(summary.dirty);
  }, [summary.dirty, onDirtyChange]);

  useEffect(() => {
    if (!summary.dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [summary.dirty]);

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const update = (index: number, next: PlanScenario) => setDraft((prev) => prev.map((s, i) => (i === index ? next : s)));
  const addScenario = () => {
    const created = blankScenario(doc);
    setDraft((prev) => [...prev, created]);
    setOpenIds((prev) => new Set(prev).add(created.id));
  };
  const duplicate = (index: number) => {
    const copy = duplicateScenario(draft[index]);
    setDraft((prev) => [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)]);
    setOpenIds((prev) => new Set(prev).add(copy.id));
  };
  const remove = (index: number) => {
    const target = draft[index];
    if (target.title.trim() && !window.confirm(`¿Eliminar el escenario "${target.title}"?`)) return;
    setDraft((prev) => prev.filter((_, i) => i !== index));
  };
  const discard = () => {
    if (!window.confirm('¿Descartar todos los cambios no confirmados de este plan?')) return;
    setDraft(structuredClone(doc.scenarios));
  };

  const review = REVIEW_LABELS[state];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-[15px] font-semibold text-[#1a1f2e]">{doc.title}</div>
            <span title={review.hint} className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', review.className)}>{review.label}</span>
          </div>
          <div className="text-[11px] text-[#8B999D] font-mono truncate" title={doc.file.path}>{doc.file.path}</div>
          <div className="text-[11px] text-[#8B999D] mt-0.5">
            {doc.scenarios.length} escenarios · idioma {doc.language}
            {doc.review && ` · última revisión: ${doc.review.userName ?? '—'}, ${new Date(doc.review.reviewedAt).toLocaleString()}`}
          </div>
        </div>
        <button type="button" onClick={() => setOpenIds(allOpen ? new Set() : new Set(draft.map((s) => s.id)))} className="text-[11px] text-[#104B99] hover:underline">
          {allOpen ? 'Contraer todos' : 'Expandir todos'}
        </button>
      </div>

      {editable && (
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur rounded-xl border border-[#E8EBEC] px-4 py-2.5 flex flex-wrap items-center gap-2">
          {summary.dirty ? (
            <span className="text-[12px] text-[#1a1f2e]">
              Cambios sin confirmar: <b>{summary.edited}</b> editados · <b>{summary.added}</b> nuevos · <b>{summary.removed}</b> eliminados{summary.reordered ? ' · orden' : ''}
            </span>
          ) : (
            <span className="text-[12px] text-[#8B999D]">Sin cambios. Edita los escenarios para completarlos, o acéptalos como válidos.</span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {summary.dirty ? (
              <>
                <button type="button" onClick={discard} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E8EBEC] text-[12px] text-[#58646D] hover:bg-[#FAFAF7]">
                  <RotateCcw size={12} /> Descartar
                </button>
                <button type="button" onClick={() => setDialog('commit')} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#1a1f2e] text-white text-[12px] font-semibold hover:bg-black">
                  <GitCommitHorizontal size={13} /> Revisar cambios y hacer commit
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setDialog('accept')}
                disabled={state === 'accepted'}
                title={state === 'accepted' ? 'Esta versión ya fue aceptada' : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#48A157] text-white text-[12px] font-semibold hover:bg-[#3d8a4a] disabled:bg-[#BABEC3]"
              >
                <CheckCircle2 size={13} /> Aceptar como válido
              </button>
            )}
          </div>
        </div>
      )}

      {doc.readOnlyReason && (
        <div className="rounded-xl bg-[#F4F1EA] px-4 py-2.5 text-[12px] text-[#58646D] flex items-start gap-2">
          <Lock size={13} className="mt-0.5 flex-shrink-0" /> Solo lectura: {doc.readOnlyReason}
        </div>
      )}
      {doc.issues.length > 0 && (
        <div className="rounded-xl bg-[#FFF7E6] px-4 py-2.5 text-[12px] text-[#8A5A00]">
          <div className="flex items-center gap-1.5 font-semibold mb-1"><AlertTriangle size={13} /> El archivo original tiene errores de Gherkin</div>
          <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
            {doc.issues.map((issue, i) => <li key={i} className="break-words">{issue}</li>)}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        {draft.map((scenario, index) => (
          <ScenarioCard
            key={scenario.id}
            doc={doc}
            scenario={scenario}
            index={index}
            count={draft.length}
            change={scenarioChange(originals, scenario)}
            editable={editable}
            open={openIds.has(scenario.id)}
            onToggle={() => toggle(scenario.id)}
            onChange={(next) => update(index, next)}
            onMove={(delta) => setDraft((prev) => moveItem(prev, index, delta))}
            onDuplicate={() => duplicate(index)}
            onDelete={() => remove(index)}
          />
        ))}
      </div>
      {editable && (
        <button type="button" onClick={addScenario} className="w-full rounded-xl border border-dashed border-[#BABEC3] py-3 text-[12px] text-[#58646D] hover:border-[#104B99] hover:text-[#104B99] inline-flex items-center justify-center gap-1.5">
          <Plus size={13} /> Agregar escenario
        </button>
      )}

      {dialog === 'commit' && (
        <CommitDialog
          slug={slug}
          doc={doc}
          draft={draft}
          canCommit={canCommit}
          onClose={() => setDialog(null)}
          onReload={onReload}
          onCommitted={(plan, sha) => {
            setDialog(null);
            onDocChange(plan, `Commit ${sha.slice(0, 8)} subido a ${plan.branch}. Plan validado con cambios.`);
          }}
        />
      )}
      {dialog === 'accept' && (
        <AcceptDialog
          slug={slug}
          doc={doc}
          onClose={() => setDialog(null)}
          onAccepted={(plan) => {
            // Accepting does not change the file, so the editor is not remounted: close explicitly.
            setDialog(null);
            onDocChange(plan, `${plan.file.key} aceptado como válido.`);
          }}
        />
      )}
    </div>
  );
}
