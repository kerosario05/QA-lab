import { useEffect, useState, useCallback, useRef } from 'react';
import { ClipboardList, ArrowLeft, ExternalLink, Check, Upload, User, Loader2 } from 'lucide-react';
import { getChecklist, type ChecklistResponse, type Defect } from '../../services/checklist';
import { uploadDefectsToJira, searchJiraUsers, type JiraUser } from '../../services/jira';

/* ── Helpers ── */
const sevLabel: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' };
const sevAccent: Record<string, string> = { critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-amber-500', low: 'bg-green-500' };
const sevBadge: Record<string, string> = { critical: 'bg-red-50 text-red-700 border-red-200', high: 'bg-orange-50 text-orange-700 border-orange-200', medium: 'bg-amber-50 text-amber-700 border-amber-200', low: 'bg-green-50 text-green-700 border-green-200' };
const stBadge: Record<string, string> = { pending_review: 'bg-blue-50 text-blue-700 border-blue-200', accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200', rejected: 'bg-gray-50 text-gray-600 border-gray-200', fixed: 'bg-teal-50 text-teal-700 border-teal-200' };
const stLabel: Record<string, string> = { pending_review: 'Pendiente', accepted: 'Aceptado', rejected: 'Rechazado', fixed: 'Corregido' };
const sevOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function clean(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('auth') || lower.includes('login') || lower.includes('otp')) return 'No se pudo completar el flujo de autenticación requerido.';
  if (lower.includes('timeout')) return 'La pantalla o acción esperada tardó más de lo permitido.';
  if (lower.includes('target_not_found') || lower.includes('element_not_found')) return 'No se encontró el elemento necesario para continuar.';
  if (lower.includes('assertion_not_found') || lower.includes('assertion')) return 'No se pudo validar la información esperada en pantalla.';
  const c = text.split('\n').filter(l => !/^\s*escenario:/i.test(l) && !/acci[óo]n sugerida/i.test(l) && !l.includes('dedupeKey') && !l.includes('::') && !/^\s*key:/i.test(l)).join('\n').trim();
  return c || 'No se pudo completar la validación esperada durante la ejecución.';
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString('es-DO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } as any); } catch { return iso; }
}

function getDefectSelectionId(d: Defect): string {
  return d.id || d.scenarioId || `${d.scenarioTitle}-${d.createdAt || d.updatedAt || ''}`;
}

function getDefectSummary(d: Defect): string {
  const desc = d.description ?? "";
  const techCtx = d.technicalContext as Record<string, unknown> | undefined;

  // 1. Extract "Resultado actual" section from structured description
  const actualMatch = desc.match(/Resultado actual:\n([\s\S]*?)(?:\n\n|$)/);
  if (actualMatch) {
    const text = actualMatch[1].trim();
    if (text && text.length > 0) {
      console.log(`[defect-summary] scenarioId=${d.scenarioId ?? 'none'} source=actual_result length=${text.length}`);
      return text.length > 160 ? text.slice(0, 157) + "..." : text;
    }
  }

  // 2. Use reasonCode-based human message from technicalContext
  if (techCtx?.reasonCode && typeof techCtx.reasonCode === "string") {
    const code = techCtx.reasonCode.toLowerCase();
    if (code.includes("assertion_not_found")) {
      const msg = "La validación esperada no fue encontrada en la pantalla.";
      console.log(`[defect-summary] scenarioId=${d.scenarioId ?? 'none'} source=reason_code length=${msg.length}`);
      return msg;
    }
    if (code.includes("target_not_found") || code.includes("locator_resolution_failed")) {
      const msg = "No se encontró el elemento necesario para continuar la ejecución.";
      console.log(`[defect-summary] scenarioId=${d.scenarioId ?? 'none'} source=reason_code length=${msg.length}`);
      return msg;
    }
    if (code.includes("timeout")) {
      const msg = "La acción esperada no completó dentro del tiempo límite.";
      console.log(`[defect-summary] scenarioId=${d.scenarioId ?? 'none'} source=reason_code length=${msg.length}`);
      return msg;
    }
  }

  // 3. First line of legacy description (skip "Escenario:" header)
  const lines = desc.split("\n").filter(l => l.trim());
  const nonHeader = lines.filter(l => !l.startsWith("Escenario:") && !l.startsWith("Resultado:") && !l.startsWith("Ejecución:") && !l.startsWith("TestRail:") && !l.startsWith("Evidencia:") && !l.startsWith("Código") && !l.startsWith("Paso ") && !l.startsWith("Último"));
  if (nonHeader.length > 0) {
    const msg = nonHeader[0].trim();
    if (msg.length > 0) {
      const truncated = msg.length > 160 ? msg.slice(0, 157) + "..." : msg;
      console.log(`[defect-summary] scenarioId=${d.scenarioId ?? 'none'} source=legacy length=${truncated.length}`);
      return truncated;
    }
  }

  // 4. Fallback
  const fallback = "La ejecución automatizada no pudo completarse correctamente.";
  console.log(`[defect-summary] scenarioId=${d.scenarioId ?? 'none'} source=fallback length=${fallback.length}`);
  return fallback;
}

interface Props { issueKey: string; jobId?: string; scenarioIds?: string[]; onBack: () => void; }

export default function DefectChecklist({ issueKey, jobId, scenarioIds, onBack }: Props) {
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [localJiraKeys, setLocalJiraKeys] = useState<Record<string, { key: string; url: string }>>({});
  const [expandedDefects, setExpandedDefects] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    getChecklist(issueKey, jobId, scenarioIds)
      .then(data => {
        setData(data);
        console.log(`[checklist-load] issueKey=${issueKey} jobId=${jobId ?? 'none'} received=${data?.defects?.length ?? 0}`);
      })
      .catch(err => {
        console.log(`[defects:jira] checklist API failed issueKey=${issueKey} reason=${err.message}, falling back to localStorage`);
        // Don't set null — we'll build list from localStorage below
      })
      .finally(() => setLoading(false));
  }, [issueKey, jobId]);

  const apiDefects: Defect[] = Array.isArray(data?.defects) ? data!.defects : [];

  // Build synthetic defects from localStorage when API returns no data
  const localStorageDefects: Defect[] = apiDefects.length === 0
    ? Object.entries(localJiraKeys).map(([defectId, ref]) => ({
        id: defectId,
        scenarioId: defectId,
        scenarioTitle: `Defecto ${ref.key}`,
        description: `Issue Jira creado: ${ref.key}. Referencia local almacenada en QA Lab.`,
        severity: 'medium' as const,
        status: 'pending_review' as const,
        jiraIssueKey: ref.key,
        jiraIssueUrl: ref.url,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))
    : [];

  const defects = (apiDefects.length > 0 ? apiDefects : localStorageDefects)
    .filter((d: Defect) => {
      if (!scenarioIds || scenarioIds.length === 0) return true;
      const did = d.scenarioId ?? d.id ?? '';
      return scenarioIds.some(sid => did.includes(sid) || sid.includes(did));
    });
  const pendCount = defects.filter(d => d.status === 'pending_review').length;
  const maxSev = defects.reduce((m, d) => (sevOrder[d.severity] ?? 0) > (sevOrder[m] ?? -1) ? d.severity : m, '');
  const maxSevLbl = maxSev ? sevLabel[maxSev] || maxSev : '—';

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(defects.map(d => getDefectSelectionId(d))));
  }, [defects]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedDefects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const allSelected = defects.length > 0 && selectedIds.size === defects.length;

  // ── Jira upload state ──
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ created: number; failed: number; skipped: number; evidenceAttached: number; evidenceNotAvailable: number; evidenceFailed: number } | null>(null);

  // ── localStorage helpers for cross-refresh protection ──
  const lsKey = `qa-lab:jira-defect-keys:${issueKey}`;

  const hydrateLocalKeys = useCallback(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, { key: string; url: string; storedAt: string }>;
        setLocalJiraKeys(parsed);
        const count = Object.keys(parsed).length;
        if (count > 0) console.log(`[defects:jira] localStorage loaded sourceIssueKey=${issueKey} count=${count}`);
      }
    } catch { /* ignore corrupt localStorage */ }
  }, [lsKey, issueKey]);

  const persistLocalKey = useCallback((defectId: string, key: string, url: string) => {
    try {
      const raw = localStorage.getItem(lsKey);
      const data = raw ? JSON.parse(raw) : {};
      data[defectId] = { key, url, storedAt: new Date().toISOString() };
      localStorage.setItem(lsKey, JSON.stringify(data));
      console.log(`[defects:jira] localStorage stored defectId=${defectId} issueKey=${key} reason=persist_failed`);
    } catch { /* ignore */ }
  }, [lsKey]);

  const clearLocalKey = useCallback((defectId: string) => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const data = JSON.parse(raw);
        delete data[defectId];
        localStorage.setItem(lsKey, JSON.stringify(data));
        console.log(`[defects:jira] localStorage cleared defectId=${defectId} reason=metadata_persisted`);
      }
    } catch { /* ignore */ }
  }, [lsKey]);

  // Hydrate local keys from localStorage on mount and when issueKey changes
  useEffect(() => { hydrateLocalKeys(); }, [hydrateLocalKeys]);

  // ── Assignee selector state ──
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [assigneeResults, setAssigneeResults] = useState<JiraUser[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<JiraUser | null>(null);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const assigneeRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const jiraProjectKey = import.meta.env.VITE_JIRA_PROJECT_KEY || '';

  // Close assignee dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (assigneeRef.current && !assigneeRef.current.contains(e.target as Node)) {
        setShowAssigneeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Search users with debounce
  const onAssigneeInput = useCallback((value: string) => {
    setAssigneeSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) { setAssigneeResults([]); return; }
    if (!jiraProjectKey) {
      console.log(`[defects:jira] user search skipped reason=missing_project_key`);
      return;
    }
    setSearchingUsers(true);
    debounceRef.current = setTimeout(async () => {
      try {
        console.log(`[defects:jira] user search query=${value} projectKey=${jiraProjectKey}`);
        const r = await searchJiraUsers(value, jiraProjectKey);
        setAssigneeResults(r.users ?? []);
        setShowAssigneeDropdown(true);
      } catch { setAssigneeResults([]); }
      finally { setSearchingUsers(false); }
    }, 350);
  }, [jiraProjectKey]);

  const handleUpload = useCallback(async () => {
    const selected = defects.filter(d => selectedIds.has(getDefectSelectionId(d)));
    if (selected.length === 0 || uploading) return;

    // Filter out defects that already have a Jira key (persisted OR local fallback from failed PATCH)
    const alreadyUploaded = selected.filter(d => {
      const selId = getDefectSelectionId(d);
      return d.jiraIssueKey || localJiraKeys[selId];
    });
    const toUpload = selected.filter(d => {
      const selId = getDefectSelectionId(d);
      return !d.jiraIssueKey && !localJiraKeys[selId];
    });

    setUploading(true);
    setUploadResult(null);

    const sourceIssueKey = issueKey;
    const targetProjectKey = jiraProjectKey;
    console.log(`[defects:jira] selected=${selected.length} toUpload=${toUpload.length} alreadyUploaded=${alreadyUploaded.length} sourceIssueKey=${sourceIssueKey} targetProjectKey=${targetProjectKey}`);

    if (toUpload.length === 0) {
      setUploadResult({ created: 0, failed: 0, skipped: alreadyUploaded.length, evidenceAttached: 0, evidenceNotAvailable: 0, evidenceFailed: 0 });
      setUploading(false);
      return;
    }

    const payload = {
      appSlug: '',
      sourceIssueKey,
      jiraProjectKey: targetProjectKey,
      defects: toUpload.map(d => {
        const tc = d.technicalContext;
        const hasTc = Boolean(tc && typeof tc === "object" && Object.keys(tc).length > 0);
        const hasStructuredDesc = hasTc && Boolean(d.description?.trim());
        const failureReasonIncluded = !hasStructuredDesc;
        console.log(`[jira-defect-description] scenarioId=${d.scenarioId ?? 'none'} source=${hasStructuredDesc ? 'structured' : 'legacy'} failureReasonIncluded=${failureReasonIncluded} duplicatesRemoved=${hasStructuredDesc ? 1 : 0}`);
        return {
          id: d.id || getDefectSelectionId(d),
          scenarioId: d.scenarioId,
          scenarioTitle: d.scenarioTitle,
          title: d.title || d.scenarioTitle || d.scenarioId || 'Defecto QA Lab',
          severity: d.severity,
          status: d.status,
          description: d.description,
          descriptionFormat: hasStructuredDesc ? "structured" : "legacy",
          ...(hasStructuredDesc
            ? {}
            : { failureReason: d.severityReason || undefined }),
          evidenceUrl: d.evidenceUrl,
          updatedAt: d.updatedAt,
        };
      }),
      assigneeAccountId: selectedAssignee?.accountId,
    };

    try {
      const result = await uploadDefectsToJira(payload);

      // Backend already persists jiraIssueKey and jiraIssueUrl natively.
      // Clear localStorage fallback for each created defect since metadata is persisted server-side.
      for (const c of result.created) {
        const selId = c.defectId;
        clearLocalKey(selId);
      }

      const createdEntries = (result.created as Array<{ defectId: string; scenarioId?: string; jiraIssueKey: string; jiraIssueUrl?: string; evidenceAttached?: boolean; attachmentStatus?: string; attachmentName?: string; attachmentReasonCode?: string }>);
      const evidenceAttached = createdEntries.filter(c => c.evidenceAttached).length;
      const evidenceNotAvailable = createdEntries.filter(c => c.attachmentStatus === "not_available").length;
      const evidenceFailed = createdEntries.filter(c => c.attachmentStatus === "generation_failed" || c.attachmentStatus === "upload_failed").length;
      setUploadResult({
        created: result.created.length,
        failed: result.failed.length,
        skipped: result.skipped.length + alreadyUploaded.length,
        evidenceAttached,
        evidenceNotAvailable,
        evidenceFailed,
      });

      console.log(`[defects:jira] uploaded created=${result.created.length} failed=${result.failed.length} skipped=${result.skipped.length + alreadyUploaded.length}`);
    } catch (err: any) {
      setUploadResult({ created: 0, failed: toUpload.length, skipped: alreadyUploaded.length, evidenceAttached: 0, evidenceNotAvailable: 0, evidenceFailed: 0 });
      console.log(`[defects:jira] failed error=${err.message}`);
    } finally {
      setUploading(false);
    }
  }, [defects, selectedIds, issueKey, jiraProjectKey, uploading, selectedAssignee, localJiraKeys]);

  const handleClearUploadResult = () => setUploadResult(null);

  return (
    <div className="min-h-screen" style={{ background: '#F8F9F7' }}>
      <div className="max-w-[1000px] mx-auto px-6 py-8">
        {/* ── Back button ── */}
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] font-semibold text-[#64748B] hover:text-[#0F172A] mb-4 transition">
          <ArrowLeft size={15} /> Volver
        </button>

        {loading ? (
          <div className="bg-white border border-[#E6E9EA] rounded-2xl p-12 text-center shadow-sm"><div className="text-[14px] text-[#94A3B8]">Cargando checklist...</div></div>
        ) : defects.length === 0 ? (
          <div className="bg-white border border-dashed border-[#CBD5E1] rounded-[20px] p-12 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mx-auto mb-4"><ClipboardList size={26} className="text-[#94A3B8]" /></div>
            <div className="text-[17px] font-bold text-[#0F172A] mb-1" style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}>No hay defectos registrados</div>
            <div className="text-[13px] text-[#64748B]">Cuando una ejecución falle, los posibles defectos aparecerán aquí.</div>
          </div>
        ) : (
          <>
            {/* ── Hero card ── */}
            <div className="relative overflow-hidden rounded-[24px] px-8 py-7 mb-6 shadow-[0_18px_45px_rgba(15,58,99,0.22)]" style={{ background: 'linear-gradient(135deg, #0F3A63 0%, #155A9C 45%, #1F7AB8 100%)' }}>
              {/* Decorative circles */}
              <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full border pointer-events-none" style={{ borderColor: 'rgba(255,255,255,0.12)' }} />
              <div className="absolute -top-6 -right-6 w-40 h-40 rounded-full border pointer-events-none" style={{ borderColor: 'rgba(255,255,255,0.10)' }} />

              {/* Top label */}
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList size={14} style={{ color: 'rgba(255,255,255,0.72)' }} />
                <span className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.72)' }}>Checklist de defectos</span>
              </div>

              {/* Big number */}
              <div className="text-[72px] font-extrabold leading-[0.95] text-white" style={{ fontFamily: 'Geist, system-ui, sans-serif' }}>{defects.length}</div>

              {/* Subtitle */}
              <div className="text-[15px] mt-1" style={{ color: 'rgba(255,255,255,0.86)' }}>defectos registrados para <span className="font-semibold">{issueKey}</span></div>

              {/* Badges */}
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                {pendCount > 0 && (
                  <span className="text-[12px] font-semibold px-3 py-[5px] rounded-full" style={{ background: 'rgba(47,168,102,0.24)', color: '#CFFFE1', border: '1px solid rgba(47,168,102,0.30)' }}>
                    Pendiente de revisión
                  </span>
                )}
                {maxSevLbl !== '—' && (
                  <span className="text-[12px] font-semibold px-3 py-[5px] rounded-full" style={{ background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.16)' }}>
                    Severidad mayor: {maxSevLbl}
                  </span>
                )}
              </div>

              {/* Metrics row */}
              <div className="mt-5 pt-[18px]" style={{ borderTop: '1px solid rgba(255,255,255,0.16)' }}>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Total', value: String(defects.length), isNum: true },
                    { label: 'Pendientes', value: String(pendCount), isNum: true },
                    { label: 'Severidad mayor', value: maxSevLbl, isNum: false },
                    { label: 'Actualizado', value: data?.updatedAt ? fmtDate(data.updatedAt) : '—', isNum: false },
                  ].map((m, i) => (
                    <div key={i}>
                      <div className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: 'rgba(255,255,255,0.62)' }}>{m.label}</div>
                      <div className={`font-extrabold text-white ${m.isNum ? 'text-[22px]' : 'text-[15px]'}`} style={{ fontFamily: 'Geist, system-ui, sans-serif' }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Selection action bar ── */}
            {selectedIds.size > 0 && (
              <div className="sticky top-4 z-10 bg-[#0F172A] rounded-[18px] px-5 py-3 mb-4 flex items-center justify-between gap-3 shadow-[0_14px_30px_rgba(15,23,42,0.18)]">
                <span className="text-white text-[13px] font-semibold shrink-0">{selectedIds.size} defecto(s) seleccionado(s)</span>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {/* ── Assignee selector ── */}
                  <div ref={assigneeRef} className="relative">
                    {selectedAssignee ? (
                      /* Selected assignee pill */
                      <div className="flex items-center gap-1.5 text-white">
                        {selectedAssignee.avatarUrl ? (
                          <img src={selectedAssignee.avatarUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-white">
                              {selectedAssignee.displayName.split(' ').filter(w => w.length > 0 && /^[A-ZÁÉÍÓÚ]/i.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'U'}
                            </span>
                          </div>
                        )}
                        <span className="text-[12px] font-semibold truncate max-w-[160px]" title={selectedAssignee.displayName}>
                          {selectedAssignee.displayName}
                        </span>
                        <button
                          type="button"
                          onClick={() => { setSelectedAssignee(null); setAssigneeSearch(''); setAssigneeResults([]); console.log('[defects:jira] assignee cleared'); }}
                          className="text-white/50 hover:text-white ml-0.5 shrink-0"
                          title="Quitar asignatario"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l8 8M11 3l-8 8"/></svg>
                        </button>
                      </div>
                    ) : (
                      /* Search input */
                      <div className="flex items-center gap-1">
                        <User size={14} className="text-white/60" />
                        <input
                          type="text"
                          placeholder="Asignar a..."
                          value={assigneeSearch}
                          onChange={e => onAssigneeInput(e.target.value)}
                          onFocus={() => assigneeSearch.length >= 2 && setShowAssigneeDropdown(true)}
                          className="bg-transparent border-b border-white/20 text-white text-[12px] placeholder-white/40 px-1 py-0.5 w-[110px] outline-none focus:border-white/50"
                        />
                        {searchingUsers && <Loader2 size={12} className="text-white/60 animate-spin" />}
                      </div>
                    )}
                    {showAssigneeDropdown && assigneeResults.length > 0 && (
                      <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-lg border border-[#E6E9EA] min-w-[200px] max-h-[200px] overflow-y-auto z-20">
                        {assigneeResults.map(u => (
                          <button
                            key={u.accountId}
                            type="button"
                            className="w-full text-left px-3 py-2 text-[12px] hover:bg-[#F1F5F9] transition flex items-center gap-2"
                            onClick={() => { setSelectedAssignee(u); setAssigneeSearch(''); setShowAssigneeDropdown(false); setAssigneeResults([]); console.log(`[defects:jira] assignee selected accountId=${u.accountId} displayName="${u.displayName}"`); }}
                          >
                            {u.avatarUrl && <img src={u.avatarUrl} alt="" className="w-5 h-5 rounded-full" />}
                            <div>
                              <div className="font-semibold text-[#0F172A]">{u.displayName}</div>
                              {u.emailAddress && <div className="text-[#94A3B8] text-[10px]">{u.emailAddress}</div>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Upload button ── */}
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={handleUpload}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-full transition flex items-center gap-1.5 disabled:opacity-50"
                    style={{ background: 'rgba(34,197,94,0.22)', color: '#BBF7D0', border: '1px solid rgba(34,197,94,0.30)' }}
                  >
                    {uploading ? (
                      <><Loader2 size={13} className="animate-spin" /> {`Subiendo ${selectedIds.size}...`}</>
                    ) : (
                      <><Upload size={13} /> Subir a Jira</>
                    )}
                  </button>

                  {!allSelected && (
                    <button type="button" onClick={selectAll} className="text-[12px] font-semibold px-3 py-1.5 rounded-full transition" style={{ background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.16)' }}>Seleccionar todos</button>
                  )}
                  <button type="button" onClick={clearSelection} className="text-[12px] font-semibold px-3 py-1.5 rounded-full transition" style={{ background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.16)' }}>Limpiar</button>
                </div>
              </div>
            )}

            {/* ── Upload result toast ── */}
            {uploadResult && (() => {
              const successParts: string[] = [];
              if (uploadResult.created > 0) successParts.push(`${uploadResult.created} defecto(s) subidos a Jira`);
              if (uploadResult.evidenceAttached > 0) successParts.push(`${uploadResult.evidenceAttached} evidencia(s) adjuntas`);
              if (uploadResult.evidenceNotAvailable > 0) successParts.push(`${uploadResult.evidenceNotAvailable} sin evidencia`);
              if (uploadResult.evidenceFailed > 0) successParts.push(`${uploadResult.evidenceFailed} adjuntos fallidos`);
              if (uploadResult.skipped > 0) successParts.push(`${uploadResult.skipped} ya existían`);
              const successText = successParts.join(" · ");
              const failText = `${uploadResult.created} creado(s), ${uploadResult.failed} fallido(s)${uploadResult.skipped > 0 ? `, ${uploadResult.skipped} omitido(s)` : ""}`;
              return (
              <>
                <div className={`rounded-[16px] px-5 py-3 mb-2 text-[13px] font-semibold shadow-sm flex items-center gap-3 ${uploadResult.failed > 0 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                  <span>{uploadResult.failed === 0 ? successText : failText}</span>
                  <button onClick={handleClearUploadResult} className="ml-auto text-[11px] underline opacity-70 hover:opacity-100">Cerrar</button>
                </div>
              </>
              );
            })()}

            {/* ── Defect cards ── */}
            <div className="space-y-[14px]">
              {defects.map((d: Defect) => {
                const selId = getDefectSelectionId(d);
                const isSelected = selectedIds.has(selId);
                const cardStyle = {
                  borderColor: isSelected ? '#0F4C81' : '#E6E9EA',
                  background: isSelected ? '#F8FBFF' : '#FFFFFF',
                };
                const handleCardClick = (e: React.MouseEvent) => {
                  if ((e.target as HTMLElement).closest('a, button, [role="button"]')) return;
                  toggleSelection(selId);
                };
                const handleCheckClick = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  toggleSelection(selId);
                };
                const handleCheckKey = (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelection(selId); }
                };
                const selClass = isSelected
                  ? 'shadow-[0_16px_40px_rgba(15,23,42,0.12)]'
                  : 'hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] hover:border-[#D0D4D8]';
                return (
                  <div key={selId} className={`bg-white border rounded-[20px] shadow-[0_12px_30px_rgba(15,23,42,0.05)] overflow-hidden relative hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition-all cursor-pointer ${selClass}`} style={cardStyle} onClick={handleCardClick}>
                    <div className={`absolute left-0 top-0 bottom-0 w-[4px] ${sevAccent[d.severity] || 'bg-gray-300'}`} />
                    <div className="pl-[22px] pr-6 py-[18px] flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        <div role="checkbox" aria-checked={isSelected} aria-label={`Seleccionar defecto ${d.scenarioTitle || d.scenarioId || ''}`} tabIndex={0} onClick={handleCheckClick} onKeyDown={handleCheckKey} className="w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center transition cursor-pointer" style={{ borderColor: isSelected ? '#0F4C81' : '#CBD5E1', background: isSelected ? '#0F4C81' : 'transparent' }}>
                          {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-0.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`text-[11px] font-bold px-2.5 py-[5px] rounded-full border ${sevBadge[d.severity] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>{sevLabel[d.severity] || d.severity}</span>
                            <span className="text-[16px] font-bold text-[#0F172A] leading-tight truncate">{(d.title || d.scenarioTitle || d.scenarioId || 'Sin escenario').replace(/^\[[^\]]+\]\s*/, '')}</span>
                          </div>
                          <span className={`text-[11px] font-bold px-2.5 py-[5px] rounded-full border shrink-0 ${stBadge[d.status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>{stLabel[d.status] || d.status}</span>
                        </div>
                        {d.scenarioId && d.scenarioTitle && (<div className="text-[11px] font-semibold tracking-[0.03em] text-[#94A3B8] ml-[72px] mb-2">{d.scenarioId}</div>)}
                        {(() => {
                          const isExpanded = expandedDefects.has(selId);
                          const fullDesc = d.description;
                          const summary = getDefectSummary(d);
                          const hasDetail = fullDesc.split("\n").filter(l => l.trim()).length > 2;
                          return (
                            <>
                              <div className="text-[13px] text-[#475569] leading-relaxed ml-[72px] mb-2 max-w-[680px]" style={{ whiteSpace: "pre-line" }}>
                                {isExpanded ? fullDesc : summary}
                              </div>
                              {hasDetail && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleExpand(selId); }}
                                  className="text-[11px] font-semibold text-[#0F4C81] hover:underline ml-[72px] mb-4"
                                >
                                  {isExpanded ? "Ocultar detalle" : "Ver detalle"}
                                </button>
                              )}
                            </>
                          );
                        })()}
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-[14px] border-t border-[#F1F5F9] text-[12px] text-[#64748B] font-semibold">
                          {d.severityReason && <span>{d.severityReason}</span>}
                          <span>Evidencia: {d.evidenceUrl ? <a href={d.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-[#0F4C81] hover:underline inline-flex items-center gap-0.5"><ExternalLink size={10} /> Ver evidencia</a> : <span className="text-[#94A3B8]">No adjunta</span>}</span>
                          <span className="text-[#94A3B8]">Actualizado: {fmtDate(d.updatedAt)}</span>
                          {d.jiraIssueKey && (
                            <a href={d.jiraIssueUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="text-[#0F4C81] hover:underline inline-flex items-center gap-1 text-[11px] font-bold">
                              <ExternalLink size={10} /> {d.jiraIssueKey}
                            </a>
                          )}
                          {!d.jiraIssueKey && localJiraKeys[selId] && (
                            <span className="text-[#0F4C81] inline-flex items-center gap-1 text-[11px] font-bold" title="Issue creado en Jira — referencia local (persistencia pendiente)">
                              <ExternalLink size={10} /> {localJiraKeys[selId].key}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
