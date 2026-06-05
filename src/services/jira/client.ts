const PROXY = import.meta.env.VITE_API_URL ?? '';

export async function jiraRequest<T>(path: string): Promise<T> {
  const res = await fetch(`${PROXY}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
