import { describe, expect, it } from 'vitest';
import { isNeutralChecklistIdentity, parseChecklistRoute } from './route';

describe('DefectChecklist route parsing', () => {
  it('acepta identidad neutral launch:<uuid> con jobId', () => {
    const parsed = parseChecklistRoute(
      '/checklist/launch:dc68fbee-cac7-4461-90fb-227f66818a1b',
      '?jobId=6de8670f-4531-405c-88b4-ee66892b9c5a',
    );

    expect(parsed).toEqual({
      checklistIdentity: 'launch:dc68fbee-cac7-4461-90fb-227f66818a1b',
      jobId: '6de8670f-4531-405c-88b4-ee66892b9c5a',
    });
  });

  it('acepta identidad codificada y la decodifica', () => {
    const parsed = parseChecklistRoute('/checklist/launch%3Aabc-123', '');
    expect(parsed).toEqual({
      checklistIdentity: 'launch:abc-123',
      jobId: undefined,
    });
  });

  it('rechaza rutas con segmentos extra', () => {
    const parsed = parseChecklistRoute('/checklist/launch:abc/extra', '?jobId=1');
    expect(parsed).toBeNull();
  });

  it('detecta identidades neutrales launch/job', () => {
    expect(isNeutralChecklistIdentity('launch:abc')).toBe(true);
    expect(isNeutralChecklistIdentity('job:abc')).toBe(true);
    expect(isNeutralChecklistIdentity('QA-123')).toBe(false);
  });
});
