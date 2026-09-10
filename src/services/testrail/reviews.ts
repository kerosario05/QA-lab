const BASE_URL = import.meta.env.VITE_API_URL ?? '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

export type TestRailReviewItem = {
  key: string;
  label?: string;
  controlType?: string;
  required?: boolean;
  sensitive?: boolean;
};

export type TestRailReviewDetails = {
  status: 'pending' | 'approved' | 'rejected';
  existingRequirements: TestRailReviewItem[];
  proposals: TestRailReviewItem[];
  unresolvedPlaceholders: string[];
  conflicts: Array<{ key: string; reason: string }>;
};

export type TestRailReviewState = TestRailReviewDetails & { caseId: number };

export async function getTestRailReviewStates(caseIds: number[]): Promise<Record<number, TestRailReviewDetails>> {
  if (caseIds.length === 0) return {};
  const response = await request<{ reviews?: TestRailReviewState[] }>(
    `/api/testrail/requirement-reviews?caseIds=${encodeURIComponent(caseIds.join(','))}`,
  );
  return Object.fromEntries((response.reviews ?? []).map(review => [review.caseId, review]));
}

export function approveTestRailReview(caseId: number): Promise<void> {
  return request<void>(`/api/testrail/requirement-reviews/${caseId}/approve`, { method: 'POST', body: '{}' });
}

export function rejectTestRailReview(caseId: number): Promise<void> {
  return request<void>(`/api/testrail/requirement-reviews/${caseId}/reject`, { method: 'POST', body: '{}' });
}
