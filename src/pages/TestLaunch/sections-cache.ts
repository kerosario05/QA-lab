export function shouldSkipSectionsFetch(params: {
  currentKey: string;
  lastFetchedKey: string | null;
  loading: boolean;
  hasSections: boolean;
}): boolean {
  const { currentKey, lastFetchedKey, loading, hasSections } = params;
  if (!currentKey) return true;
  if (lastFetchedKey === currentKey && hasSections) return true;
  if (loading && lastFetchedKey === currentKey) return true;
  return false;
}

export function getSectionsCacheWarning(retryAfterSeconds: number): string {
  return `Mostrando secciones en caché. TestRail está limitando solicitudes. Reintenta en ${retryAfterSeconds} segundos.`;
}
