import { Router } from 'express';
import type { Request, Response } from 'express';
import { JiraClient } from '../jira-client';

const router = Router();
const client = new JiraClient();

function sendError(res: Response, status: number, errorMsg: string, extra?: Record<string, unknown>): void {
  res.status(status).json({ ok: false, error: errorMsg, ...extra });
}

// GET /api/jira/projects
router.get('/projects', async (_req: Request, res: Response) => {
  console.log('[jira-api] projects request');

  try {
    const projects = await client.getProjects();
    console.log(`[jira-api] projects response count=${projects.length}`);
    res.json({ ok: true, projects });
  } catch (err: any) {
    console.log(`[jira-api] projects error: ${err.message}`);
    sendError(res, err.status ?? 503, err.message ?? 'Failed to fetch Jira projects');
  }
});

// GET /api/jira/projects/:key/sprint/active
router.get('/projects/:key/sprint/active', async (req: Request, res: Response) => {
  const projectKey = String(req.params.key);
  console.log(`[jira-api] active_sprint request project=${projectKey}`);

  try {
    const sprint = await client.getActiveSprint(projectKey);
    console.log(`[jira-api] active_sprint response project=${projectKey} found=${sprint !== null}`);
    res.json({ ok: true, sprint });
  } catch (err: any) {
    console.log(`[jira-api] active_sprint error project=${projectKey}: ${err.message}`);
    sendError(res, err.status ?? 503, err.message ?? 'Failed to fetch active sprint');
  }
});

// GET /api/jira/projects/:key/sprint/:sprintId/issues
// Read-only: devuelve las HUs del sprint activo (agile API), sin generar escenarios ni llamar IA/MCP/TestRail.
// Opcional ?status=<nombre> para devolver solo issues compatibles con ese estado Jira.
router.get('/projects/:key/sprint/:sprintId/issues', async (req: Request, res: Response) => {
  const projectKey = String(req.params.key);
  const sprintId = String(req.params.sprintId);
  const status = String(req.query.status ?? '').trim() || undefined;
  console.log(`[jira-api] sprint_issues request project=${projectKey} sprintId=${sprintId} status=${status ?? 'none'}`);

  try {
    const issues = await client.getSprintIssues(sprintId, status);
    console.log(`[jira-api] sprint_issues response project=${projectKey} sprintId=${sprintId} status=${status ?? 'none'} count=${issues.length}`);
    res.json({ ok: true, issues });
  } catch (err: any) {
    console.log(`[jira-api] sprint_issues error project=${projectKey} sprintId=${sprintId}: ${err.message}`);
    sendError(res, err.status ?? 503, err.message ?? 'Failed to fetch sprint issues');
  }
});


// GET /api/jira/users/search?query=<text>&projectKey=<key>
router.get('/users/search', async (req: Request, res: Response) => {
  const query = String(req.query.query ?? '').trim();
  const projectKey = (String(req.query.projectKey ?? '') || process.env.JIRA_DEFECT_PROJECT_KEY || process.env.JIRA_PROJECT_KEY || '').trim();

  if (query.length < 2) {
    sendError(res, 400, 'Query must be at least 2 characters');
    return;
  }
  if (!projectKey) {
    sendError(res, 400, 'projectKey is required');
    return;
  }

  console.log(`[jira-api] users search query=${query} projectKey=${projectKey}`);

  try {
    const users = await client.searchUsers(query, projectKey);
    console.log(`[jira-api] users search results count=${users.length}`);
    res.json({ ok: true, users });
  } catch (err: any) {
    console.log(`[jira-api] users search error: ${err.message}`);
    sendError(res, err.status ?? 503, err.message ?? 'Failed to search Jira users');
  }
});

// POST /api/jira/issues/upload-defects
router.post('/issues/upload-defects', async (req: Request, res: Response) => {
  const { appSlug, sourceIssueKey, jiraProjectKey, defects, assigneeAccountId } = req.body ?? {};

  const projectKey = jiraProjectKey || process.env.JIRA_DEFECT_PROJECT_KEY || process.env.JIRA_PROJECT_KEY || '';
  if (!projectKey) {
    sendError(res, 400, 'jiraProjectKey is required');
    return;
  }
  if (!Array.isArray(defects) || defects.length === 0) {
    sendError(res, 400, 'defects array is required and must not be empty');
    return;
  }

  const count = defects.length;
  const issueType = process.env.JIRA_DEFECT_ISSUE_TYPE || 'Bug';
  console.log(`[jira-defects] config targetProjectKey=${projectKey} envIssueType=${process.env.JIRA_DEFECT_ISSUE_TYPE ?? 'unset'} effectiveIssueType=${issueType}`);
  console.log(`[jira-defects] upload requested count=${count} sourceIssueKey=${sourceIssueKey ?? 'N/A'} targetProjectKey=${projectKey} issueType=${issueType} assignee=${assigneeAccountId ? 'yes' : 'no'}`);

  // Diagnostic: discover valid issue types for this project — abort if invalid
  let availableIssueTypes: string[] = [];
  try {
    const meta = await client.request<any>(`/rest/api/2/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes.fields`);
    availableIssueTypes = meta?.projects?.[0]?.issuetypes?.map((t: any) => t.name) ?? [];
    console.log(`[jira-api] createmeta projectKey=${projectKey} issueTypes=[${availableIssueTypes.join(', ')}]`);
  } catch (metaErr: any) {
    console.log(`[jira-api] createmeta unavailable reason=${metaErr.message}`);
  }

  if (availableIssueTypes.length > 0 && !availableIssueTypes.includes(issueType)) {
    console.log(`[jira-defects] invalid issueType requested=${issueType} available=${availableIssueTypes.join(', ')}`);
    console.log(`[jira-defects] upload aborted reason=invalid_issue_type`);
    const failedAll = defects.map(d => ({
      defectId: d.id || d.scenarioId || '',
      reason: `Issue type '${issueType}' no es válido para ${projectKey}. Disponibles: ${availableIssueTypes.join(', ')}`,
    }));
    return res.json({ ok: true, created: [], failed: failedAll, skipped: [] });
  }

  if (availableIssueTypes.includes(issueType)) {
    console.log(`[jira-defects] using issueType=${issueType}`);
  }

  // Resolve custom fields by name from createmeta for the target issue type
  const normField = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const fieldMappings: Record<string, { id: string; name: string; type: string } | undefined> = {};
  try {
    const meta = await client.request<any>(`/rest/api/2/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes.fields`);
    const issueTypeMeta = meta?.projects?.[0]?.issuetypes?.find((t: any) => t.name === issueType);
    const rawFields = (issueTypeMeta?.fields ?? {}) as Record<string, any>;

    // createmeta returns fields as object { customfield_X: { name, required, schema } }, not array
    const allFields: Array<{ id: string; name: string; schema?: { type: string }; required: boolean }> =
      Array.isArray(rawFields)
        ? rawFields.map((f: any) => ({
            id: f.fieldId ?? f.id ?? f.key,
            name: f.name,
            schema: f.schema,
            required: f.required,
          }))
        : Object.entries(rawFields).map(([id, f]: [string, any]) => ({
            id,
            name: f.name,
            schema: f.schema,
            required: f.required,
          }));

    const fieldNames = allFields.map(f => `${f.name}(${f.id},type=${f.schema?.type ?? 'string'})`).join(', ');
    console.log(`[jira-api] createmeta fields issueType=${issueType} count=${allFields.length} fields=${fieldNames.substring(0, 500)}`);

    // Match fields by normalized name
    const wantedNames = ['Descripción del defecto', 'Resultado esperado', 'Resultado real'];
    for (const wanted of wantedNames) {
      const nw = normField(wanted);
      const match = allFields.find(f => normField(f.name) === nw);
      if (match) {
        fieldMappings[wanted] = { id: match.id, name: match.name, type: match.schema?.type ?? 'string' };
        console.log(`[jira-defects] fieldMapping description="${wanted}" id=${match.id} type=${fieldMappings[wanted]!.type}`);
      } else {
        console.log(`[jira-defects] fieldMapping description="${wanted}" not found`);
      }
    }
  } catch (metaErr: any) {
    console.log(`[jira-api] createmeta fields lookup failed reason=${metaErr.message}`);
  }

  const created: Array<{ defectId: string; jiraIssueKey: string; jiraIssueUrl: string }> = [];
  const failed: Array<{ defectId: string; reason: string }> = [];
  const skipped: Array<{ defectId: string; reason: string; jiraIssueKey?: string }> = [];
  const warnings: Array<{ defectId: string; jiraIssueKey: string; type: string; reason: string }> = [];

  for (const d of defects) {
    const defectId = d.id || d.scenarioId || '';
    // Skip already uploaded defects
    if (d.jiraIssueKey) {
      skipped.push({ defectId, reason: 'already_uploaded', jiraIssueKey: d.jiraIssueKey });
      console.log(`[jira-defects] skipped defectId=${defectId} reason=already_uploaded existingKey=${d.jiraIssueKey}`);
      continue;
    }

    // Build description: defect description first, QA context below
    // Strip MCP runner prefixes (e.g., "Escenario: Visualizar listado...")
    const rawDesc = String(d.description || '').trim();
    const defectDesc = rawDesc
      .replace(/^Escenario:\s*[^\r\n]*[\r\n]*/i, '')
      .replace(/^Acci[oó]n sugerida:\s*[^\r\n]*[\r\n]*/i, '')
      .replace(/^dedupeKey:\s*[^\r\n]*[\r\n]*/i, '')
      .replace(/^key:\s*[^\r\n]*[\r\n]*/i, '')
      .replace(/^[\r\n]+/, '')
      .trim() || 'Sin descripción.';
    const contextLines = [
      `**HU origen:** ${sourceIssueKey || 'N/A'}`,
      `**Scenario ID:** ${d.scenarioId || 'N/A'}`,
      d.scenarioTitle ? `**Título escenario:** ${d.scenarioTitle}` : '',
      `**Severidad:** ${d.severity || 'N/A'}`,
      `**Estado:** ${d.status || 'Pendiente'}`,
      d.title ? `**Título defecto:** ${d.title}` : '',
      d.failureReason ? `**Razón del fallo:** ${d.failureReason}` : '',
      d.evidenceUrl ? `**Evidencia:** ${d.evidenceUrl}` : '**Evidencia:** No adjunta',
      `**AppSlug:** ${appSlug || 'N/A'}`,
      d.updatedAt ? `**Actualizado:** ${d.updatedAt}` : '',
    ].filter(Boolean);

    const description = [
      defectDesc,
      ``,
      `Contexto QA Lab:`,
      ...contextLines,
    ].join('\n');

    console.log(`[jira-defects] creating defectId=${defectId} sourceIssueKey=${sourceIssueKey ?? 'N/A'} targetProjectKey=${projectKey} issueType=${issueType} summary="${(d.title || d.scenarioTitle || d.scenarioId || 'Defecto QA Lab').substring(0, 70)}" descPreview="${defectDesc.substring(0, 120)}"`);

    try {
      // Build custom fields from createmeta mappings
      const customFields: Record<string, string> = {};
      const descField = fieldMappings['Descripción del defecto'];
      const expectedField = fieldMappings['Resultado esperado'];
      const actualField = fieldMappings['Resultado real'];

      if (descField) {
        customFields[descField.id] = defectDesc;
      }
      if (expectedField) {
        customFields[expectedField.id] = d.expectedResult || d.validationMessage || 'Validación esperada no encontrada. Requiere revisión funcional.';
      }
      if (actualField) {
        customFields[actualField.id] = d.failureReason || 'El escenario falló durante la ejecución automatizada y requiere revisión.';
      }

      if (Object.keys(customFields).length > 0) {
        const applied = Object.entries(fieldMappings).filter(([, v]) => v && customFields[v.id]).map(([k]) => k).join(',');
        console.log(`[jira-defects] customFields applied=${applied} ids=${Object.keys(customFields).join(',')}`);
      }

      const issue = await client.createIssue({
        projectKey,
        summary: d.title || d.scenarioTitle || d.scenarioId || 'Defecto QA Lab',
        description,
        issueType,
        labels: d.scenarioId ? [d.scenarioId.toLowerCase().replace(/[^a-z0-9-]/g, '-')] : [],
        assigneeAccountId,
        customFields,
      });

      const issueUrl = `${process.env.JIRA_BASE_URL?.replace(/\/+$/, '')}/browse/${issue.key}`;
      created.push({ defectId, jiraIssueKey: issue.key, jiraIssueUrl: issueUrl });
      console.log(`[jira-defects] created defectId=${defectId} issueKey=${issue.key}`);

      // Add comment with QA context
      const commentBody = [
        defectDesc,
        '',
        'Contexto QA Lab:',
        ...contextLines.map(l => l.replace(/^\*\*/, '*').replace(/\*\*$/, '*')),
      ].join('\n');
      try {
        await client.addComment(issue.key, commentBody);
      } catch (commentErr: any) {
        warnings.push({ defectId, jiraIssueKey: issue.key, type: 'comment_failed', reason: commentErr.message });
        console.log(`[jira-defects] comment warning defectId=${defectId} issueKey=${issue.key} reason=${commentErr.message}`);
      }

      // Assign if not already done by createIssue and assignee was selected
      if (assigneeAccountId) {
        // Transition to "Asignado" if possible
        const assignedTransition = process.env.JIRA_DEFECT_ASSIGNED_TRANSITION || 'Asignado';
        try {
          const transitions = await client.getTransitions(issue.key);
          const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          const target = norm(assignedTransition);
          const match = transitions.find(t => norm(t.name) === target);
          if (match) {
            await client.transitionIssue(issue.key, match.id);
            console.log(`[jira-api] transitionIssue success issueKey=${issue.key} status=${assignedTransition} id=${match.id}`);
          } else {
            warnings.push({
              defectId, jiraIssueKey: issue.key, type: 'transition_failed',
              reason: `No se encontró transición "${assignedTransition}". Disponibles: ${transitions.map(t => t.name).join(', ')}`,
            });
            console.log(`[jira-defects] transition warning defectId=${defectId} issueKey=${issue.key} requested=${assignedTransition} available=${transitions.map(t => t.name).join(', ')}`);
          }
        } catch (transErr: any) {
          warnings.push({ defectId, jiraIssueKey: issue.key, type: 'transition_failed', reason: transErr.message });
          console.log(`[jira-defects] transition failed defectId=${defectId} issueKey=${issue.key} reason=${transErr.message}`);
        }
      }
    } catch (err: any) {
      failed.push({ defectId, reason: err.message || 'Unknown Jira error' });
      console.log(`[jira-defects] failed defectId=${defectId} reason=${err.message}`);
    }
  }

  res.json({ ok: true, created, failed, skipped, warnings });
});

export default router;
