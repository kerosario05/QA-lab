import { ApiError } from '../../services/scenarios/client';

export interface PreviewRequestContext {
  jiraIssueKey: string;
  jiraSummary: string;
  jiraDescription: string;
  sourceMode: string;
  testRailProjectId: number | null;
  suiteId: number | null;
  sectionId: number | null;
  sectionName: string | null;
  appSlug: string;
  effectiveTargetAppSlug: string;
  functionalAppSlug?: string;
  endpoint: string;
}

function buildContextParts(context: PreviewRequestContext | null): string[] {
  if (!context) return [];
  return [
    `jiraIssueKey=${context.jiraIssueKey || '—'}`,
    `sourceMode=${context.sourceMode}`,
    `sectionId=${context.sectionId ?? '—'}`,
    `sectionName=${context.sectionName || '—'}`,
    `testRailProjectId=${context.testRailProjectId ?? '—'}`,
    `suiteId=${context.suiteId ?? '—'}`,
    `appSlug=${context.appSlug || '—'}`,
    `effectiveTargetAppSlug=${context.effectiveTargetAppSlug || '—'}`,
    context.functionalAppSlug ? `functionalAppSlug=${context.functionalAppSlug}` : '',
  ];
}

export function formatScenarioPreviewError(error: unknown, context: PreviewRequestContext | null): string {
  const contextParts = buildContextParts(context);

  if (error instanceof ApiError) {
    return [
      `HTTP ${error.status}`,
      `endpoint=${context?.endpoint ?? '/api/scenarios/preview'}`,
      `errorCode=${error.errorCode}`,
      `message=${error.detail}`,
      contextParts.length > 0 ? `context=${contextParts.join(' | ')}` : '',
    ].filter(Boolean).join(' · ');
  }

  if (error instanceof Error) {
    return [
      'HTTP unknown',
      `endpoint=${context?.endpoint ?? '/api/scenarios/preview'}`,
      `message=${error.message}`,
      contextParts.length > 0 ? `context=${contextParts.join(' | ')}` : '',
    ].filter(Boolean).join(' · ');
  }

  return [
    'HTTP unknown',
    `endpoint=${context?.endpoint ?? '/api/scenarios/preview'}`,
    'message=Error desconocido al generar escenarios',
    contextParts.length > 0 ? `context=${contextParts.join(' | ')}` : '',
  ].filter(Boolean).join(' · ');
}
