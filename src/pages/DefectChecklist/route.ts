export interface ChecklistRouteContext {
  checklistIdentity: string;
  jobId?: string;
}

/**
 * Contract route: /checklist/:identity?jobId=<jobId>
 * identity can be a Jira key or neutral identities such as launch:<uuid>/job:<uuid>.
 */
export function parseChecklistRoute(pathname: string, search: string): ChecklistRouteContext | null {
  const match = pathname.match(/^\/checklist\/([^/]+)$/u);
  if (!match) return null;

  const encodedIdentity = match[1]?.trim();
  if (!encodedIdentity) return null;

  let checklistIdentity: string;
  try {
    checklistIdentity = decodeURIComponent(encodedIdentity).trim();
  } catch {
    return null;
  }
  if (!checklistIdentity || checklistIdentity.includes("/")) return null;

  const params = new URLSearchParams(search);
  const jobId = params.get("jobId")?.trim() || undefined;

  return { checklistIdentity, jobId };
}

export function isNeutralChecklistIdentity(identity: string): boolean {
  return /^(launch|job):/i.test(identity.trim());
}
