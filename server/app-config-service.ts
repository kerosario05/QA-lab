export async function resolveTestRailProjectName(_projectId: number, _sectionName: string | null, _client: any): Promise<string | null> {
  return null;
}

export function shouldMigrateAppConfig(_appSlug: string): boolean {
  return false;
}

export function normalizeAppSlug(name: string | null | undefined): string {
  return (name || 'default').toLowerCase().replace(/[^a-z0-9-]/g, '-');
}
