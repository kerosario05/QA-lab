export interface LiveLogEntry {
  time: string;
  type: string;
  msg: string;
}

interface OrderedEntry {
  entry: LiveLogEntry;
  order: number;
}

interface SelectionIssue {
  field: string;
  values: Set<string>;
  count: number;
  firstTime: string;
  lastTime: string;
  firstOrder: number;
  lastOrder: number;
  failed: boolean;
}

const technicalPrefixes = [
  /^\[(?:recording-replay|recorded-target-lineage|recorded-target-winner(?:-rejected)?|state-diagnostic|state-mutation-diagnostic|post-action-probe-timing|post-action-probe-gap|field-scope-diagnostic|field-scoped-fallback|fill-resolver|recorded-precondition|detail-final-click|detail-early-completion-gate|early-completion-assertions|expected-result-parser|async-wait-provenance|selection-controlled-poll|stateful-click-observer-install|stateful-click-diagnostic|click-owner-identity|click-primitive|dom-mutation-diagnostic|selection-state)\]/,
  /^\[(?:critical-path|selection-state|detail-runtime|detail-evidence|auth-contract|auth-decision|section-profile|navigation-causality|preview-case-finish|preview-status-map)\]/,
];

function unwrapRunnerMessage(message: string): string {
  return message
    .replace(/^\[scenario-preview\]\s+stdout:\s*/, '')
    .replace(/^\[scenario-preview\]\s+stderr:\s*/, '')
    .trim();
}

function secondsAt(time: string): number | null {
  const match = time.match(/(?:^|\s)(\d{2}):(\d{2}):(\d{2})(?:\s|$)/) ?? time.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
}

function formatElapsed(firstTime: string, lastTime: string): string | null {
  const first = secondsAt(firstTime);
  const last = secondsAt(lastTime);
  if (first === null || last === null) return null;
  let seconds = last - first;
  if (seconds < 0) seconds += 24 * 60 * 60;
  return seconds > 0 ? `${seconds} s` : null;
}

function formatAction(description: string): string {
  const action = description.replace(/^['"]|['"]$/g, '').trim();
  const fill = action.match(/^Ingresar\s+["“].*["”]\s+en\s+["“](.+)["”]$/);
  if (fill) return `Completar campo «${fill[1]}»`;

  const selection = action.match(/^Seleccionar\s+["“](.+?)["”]\s+en\s+["“](.+)["”]$/);
  if (selection) return `Seleccionar «${selection[1]}» en «${selection[2]}»`;

  const associatedButton = action.match(/^Presionar botón asociado a\s+["“](.+)["”]$/);
  if (associatedButton) return `Presionar control «${associatedButton[1]}»`;

  const press = action.match(/^Presionar\s+["“](.+)["”]$/);
  if (press) return `Presionar «${press[1]}»`;

  return action;
}

function formatNecessaryMessage(entry: LiveLogEntry): string | null {
  const original = entry.msg.trim();
  const scenarioStart = original.match(/^\[scenario-preview\]\s+case_started:\s*([^\s]+)\s+\((\d+)\/(\d+)\)\s*(.*)$/);
  if (scenarioStart) return `Escenario ${scenarioStart[2]}/${scenarioStart[3]} · ${scenarioStart[4] || scenarioStart[1]}`;
  if (/^\[scenario-preview\]\s+case_finished:/.test(original)) return null;
  if (/^\[scenario-preview\]\s+case_started:\s*\[discovery:preview\]/.test(original)) return null;

  const message = unwrapRunnerMessage(original);
  if (message.startsWith('{')) {
    try {
      const event = JSON.parse(message) as {
        type?: unknown;
        caseId?: unknown;
        stepIndex?: unknown;
        action?: unknown;
        status?: unknown;
        reason?: unknown;
        failedAtStep?: unknown;
        failedTarget?: unknown;
        failedReason?: unknown;
      };
      if (event.type === 'case_started') return null;
      if (event.type === 'case_finished') {
        if (event.status === 'failed') {
          const caseId = typeof event.caseId === 'string' ? event.caseId : 'Escenario';
          const step = typeof event.failedAtStep === 'number' ? ` · paso ${event.failedAtStep}` : '';
          const target = typeof event.failedTarget === 'string' ? ` · ${event.failedTarget}` : '';
          const reason = typeof event.failedReason === 'string' && event.failedReason === 'target_not_found'
            ? ' · destino no encontrado'
            : '';
          return `${caseId} · Fallido${step}${target}${reason}`;
        }
        return null;
      }
      if (typeof event.stepIndex === 'number' && typeof event.action === 'string' && event.status === 'not_found') {
        const reason = typeof event.reason === 'string' && event.reason.includes('selection_owner_unresolved')
          ? ' · no se resolvió el campo asociado'
          : '';
        return `Paso ${event.stepIndex} · Destino no encontrado · ${formatAction(event.action)}${reason}`;
      }
      return null;
    } catch {
      // Leave non-JSON messages to the normal formatter.
    }
  }

  if (/^\[recorded-click-retry\]/.test(message)) return null;

  if (/^\[(?:preview-status-map|preview-case-finish|navigation-causality)\]/.test(message)) return null;

  const discoveryResult = message.match(/^\[discovery:preview\]\s+Results:\s+(\d+) passed,\s+(\d+) failed out of (\d+)/);
  if (discoveryResult) return `Resultado · ${discoveryResult[1]} aprobados · ${discoveryResult[2]} fallidos · ${discoveryResult[3]} escenarios`;

  const checklist = message.match(/^\[defect-checklist\]\s+resolved issueKey=([A-Z]+-\d+) .*?failed=(\d+)/);
  if (checklist) return `Incidencia ${checklist[1]} vinculada · ${checklist[2]} fallos`;

  if (/^\[run:scenario-preview\]\s+(?:last stdout:|failed after executing cases|completed summary\b)/i.test(message)) return null;
  if (/^\[discovery:preview\]\s+completed\b/i.test(message)) return null;

  const step = message.match(/^\[evidence\]\s+step\s+(\d+):\s*(.+?)\s+status=(passed|failed|skipped)\b/i);
  if (step) {
    const outcome = step[3].toLowerCase();
    const status = outcome === 'passed' ? 'Aprobado' : outcome === 'failed' ? 'Fallido' : 'Omitido';
    return `Paso ${step[1]} · ${status} · ${formatAction(step[2])}`;
  }

  const specStep = message.match(/^\[promoted-step\]/);
  if (specStep) return message;

  const stage = message.match(/^\[promotion-progress\]/);
  if (stage) return message;

  const recordingCedulas = message.match(/^\[recording-rerun-data\]\s+scenarioId=\S+\s+field=\S+\s+discoveryCedula=(\S+)\s+specCedula=(\S+)\s+distinct=(true|false)$/);
  if (recordingCedulas) {
    return `Cédulas renovadas · Discovery ${recordingCedulas[1]} · Spec ${recordingCedulas[2]} · ${recordingCedulas[3] === 'true' ? 'diferentes' : 'revisar diferencia'}`;
  }
  const promotedCedula = message.match(/^\[recording-rerun-data\]\s+scenarioId=\S+\s+field=\S+\s+promotedSpecCedula=(\S+)$/);
  if (promotedCedula) return `Cédula renovada para el spec promovido · ${promotedCedula[1]}`;

  const rerun = message.match(/^\[runs:rerun\]\s+sourceJobId=.*?mode=(\w+)\s+selected=(\d+)\s+total=(\d+)/);
  if (rerun) return `Reejecución iniciada · ${rerun[2]} de ${rerun[3]} escenarios`;

  if (/^\[run:scenario-preview\]\s+started\b/.test(message)) return 'Ejecución iniciada';
  if (/^\[run:scenario-preview\]\s+artifacts valid\b/.test(message)) return 'Escenarios validados';
  if (/^\[run:scenario-preview\]\s+spawning discovery:preview\b/.test(message)) return 'Iniciando Discovery';
  if (/^\[discovery:preview\]\s+Starting preview execution\b/.test(message)) return 'Discovery iniciado';

  const actionStart = message.match(/^\[discovery:case\]\s+(Filling|Clicking|Selecting|Pressing) target:\s*(.+?)(?:\s+\((?:step=(\d+); )?strategy:.*)?$/);
  if (actionStart) {
    const verb = actionStart[1] === 'Filling' ? 'Completando' : actionStart[1] === 'Selecting' ? 'Seleccionando' : 'Presionando';
    const stepPrefix = actionStart[3] ? `Paso ${actionStart[3]} · ` : '';
    return `${stepPrefix}${verb} «${actionStart[2].trim()}»`;
  }

  if (/^\[discovery:case\].*Post-click semantic verification PASSED/i.test(message)) return 'Verificación posterior aprobada';
  if (/^\[discovery:case\].*(?:stopping|no observable causal effect|surface not reached)/i.test(message)) return message.replace(/^\[discovery:case\]\s*/, 'Advertencia · ');
  if (/^\[discovery:case\].*Transition detected: yes/i.test(message)) return 'Cambio de pantalla detectado';

  const screenWait = message.match(/^\[screen-stability\].*?target="([^"]+)"\s+stable=(true|false).*?waitedMs=(\d+)/);
  if (screenWait && (Number(screenWait[3]) >= 1500 || screenWait[2] === 'false')) {
    const elapsed = (Number(screenWait[3]) / 1000).toFixed(1);
    return screenWait[2] === 'true'
      ? `La pantalla tardó ${elapsed} s en estabilizarse tras «${screenWait[1]}»`
      : `La pantalla no se estabilizó tras «${screenWait[1]}» (${elapsed} s)`;
  }

  const actionWait = message.match(/^\[post-action-sync\]\s+phase=outcome\s+actionIndex=(\d+)\s+durationMs=(\d+).*?requestFailed=(true|false).*?signal=([^\s]+)/);
  if (actionWait && (Number(actionWait[2]) >= 1500 || actionWait[3] === 'true' || actionWait[4] === 'none')) {
    const elapsed = (Number(actionWait[2]) / 1000).toFixed(1);
    return `Acción ${actionWait[1]} tardó ${elapsed} s${actionWait[3] === 'true' ? ' · hubo solicitudes fallidas' : ''}`;
  }

  const network = message.match(/^\[network-observation\]\s+stepIndex=(\d+)\s+requests=(\d+)\s+completed=(\d+)\s+pending=(\d+)\s+failed=(\d+)/);
  if (network && Number(network[5]) > 0) return `Paso ${network[1]} · ${network[5]} de ${network[2]} solicitudes fallidas`;
  if (/^\[network-observation:events\]/.test(message)) return null;

  const selectionRetry = message.match(/^\[recorded-selection-retry\]\s+phase=settle_data_result\s+status=not_found/i);
  if (selectionRetry) return 'No se pudo resolver el campo de la selección tras el reintento';

  if (technicalPrefixes.some((prefix) => prefix.test(message))) return null;
  if (/^\[target-resolver\]\s+selection_field_unresolved\b/.test(message)) return null;
  if (/^\[recorded-selection\].*applicationFailedClosed=true.*selection_owner_unresolved/.test(message)) return null;
  if (/^\[recorded-selection\]/.test(message)) return null;
  if (/^\[scenario-preview\].*\b(?:headed|autoPromote|autoPom|overwrite|deferEvidenceConsolidation|loaded \d+ virtual cases)=/.test(message)) return null;
  if (/^\[run:scenario-preview\].*(?:child started pid=|command=|artifactsDir=|beforeValidate|Saved \d+ scenarios to|\.json$)/i.test(message)) return null;
  if (/^\[scenario-preview\]\s+stdout:\s*>/.test(original)) return null;
  if (/^\[scenario-preview\]\s+stdout:\s*\[evidence:scenario\]/.test(original)) return null;
  if (/^\[scenario-preview\]\s+stdout:\s*\[network-observation:events\]/.test(original)) return null;
  if (/^\[scenario-preview\]\s+stdout:\s*\[discovery:case\]/.test(original)
    && !/^\[discovery:case\]\s*(?:Filling|Clicking|Selecting|Pressing) target:/.test(message)
    && !/^\[discovery:case\].*(?:PASSED|FAILED|stopping|no observable causal effect|surface not reached|Transition detected: yes)/i.test(message)) return null;

  // Structured subsystem lines are diagnostics. Keep only the events explicitly
  // normalized above; otherwise a generic "failed/not_found" match leaks raw logs.
  if (/^\[[\w:-]+\]/.test(message)) return null;

  if (entry.type === 'error' || /\b(?:error|failed|failure|timeout|hard_timeout|not found|not_found|cancelled)\b/i.test(message)) {
    return message.replace(/^\[scenario-preview\]\s+stderr:\s*/, 'Advertencia · ');
  }
  if (message.startsWith('[scenario-preview]')) return message.replace(/^\[scenario-preview\]\s*/, '');
  return null;
}

export function compactLiveLogs(logs: LiveLogEntry[]): {entries: LiveLogEntry[]; hiddenCount: number} {
  const visible: OrderedEntry[] = [];
  const selectionIssues = new Map<string, SelectionIssue>();

  logs.forEach((entry, order) => {
    const message = unwrapRunnerMessage(entry.msg);
    const unresolved = message.match(/^\[target-resolver\]\s+selection_field_unresolved\s+target="([^"]+)"\s+field="([^"]+)"/);
    const failedClosed = message.match(/^\[recorded-selection\]\s+applicationFailedClosed=true\s+target="([^"]+)".*reason=selection_owner_unresolved/);

    if (unresolved) {
      const [, value, field] = unresolved;
      const key = field.toLocaleLowerCase();
      let issue = selectionIssues.get(key);
      if (!issue) {
        issue = {field, values: new Set(), count: 0, firstTime: entry.time, lastTime: entry.time, firstOrder: order, lastOrder: order, failed: false};
        selectionIssues.set(key, issue);
      }
      issue.values.add(value);
      issue.count += 1;
      issue.lastTime = entry.time;
      issue.lastOrder = order;
      return;
    }

    if (failedClosed) {
      const field = failedClosed[1];
      const key = field.toLocaleLowerCase();
      let issue = selectionIssues.get(key);
      if (!issue) {
        issue = {field, values: new Set(), count: 0, firstTime: entry.time, lastTime: entry.time, firstOrder: order, lastOrder: order, failed: false};
        selectionIssues.set(key, issue);
      }
      issue.failed = true;
      issue.lastTime = entry.time;
      issue.lastOrder = order;
      if (issue.count === 0) issue.count += 1;
      return;
    }

    const formatted = formatNecessaryMessage(entry);
    if (formatted) visible.push({entry: {...entry, msg: formatted}, order});
  });

  for (const issue of selectionIssues.values()) {
    const values = [...issue.values];
    const subject = values.length === 1 ? ` para «${values[0]}»` : values.length > 1 ? ` para ${values.length} opciones` : '';
    const elapsed = formatElapsed(issue.firstTime, issue.lastTime);
    const checks = issue.count === 1 ? '1 comprobación' : `${issue.count} comprobaciones`;
    visible.push({
      entry: {
        time: issue.lastTime,
        type: issue.failed ? 'error' : 'info',
        msg: `Selección pendiente · no se resolvió «${issue.field}»${subject} · ${checks}${elapsed ? ` en ${elapsed}` : ''}`,
      },
      order: issue.lastOrder,
    });
  }

  visible.sort((left, right) => left.order - right.order);
  const entries = visible.map(({entry}) => entry);
  return {entries, hiddenCount: Math.max(0, logs.length - entries.length)};
}
