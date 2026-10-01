import { describe, expect, it } from 'vitest';
import { executionTitle, originBadge } from './index';

const base = { hu: {}, testRail: {} } as const;

describe('execution origin in "Ejecuciones"', () => {
  it('a recording run shows its goal, never as a user story', () => {
    expect(originBadge({ source: 'recording', origin: 'recording' })).toBe('GRABACIÓN');
    expect(executionTitle({ ...base, source: 'recording', origin: 'recording', recording: { id: 'r', goal: 'solicitar tarjeta' } })).toBe('Grabación: solicitar tarjeta');
  });

  it('a TestRail launch with no Jira story says so and names its section', () => {
    expect(originBadge({ source: 'launch', origin: 'testrail' })).toBe('TESTRAIL');
    expect(executionTitle({ ...base, origin: 'testrail', testRail: { sectionId: 4903, sectionName: 'REGRESION-KIOSKO' } })).toBe('Ejecución desde TestRail · REGRESION-KIOSKO');
    expect(executionTitle({ ...base, origin: 'testrail', testRail: { sectionId: 4903 } })).toBe('Ejecución desde TestRail · sección 4903');
  });

  it('a Jira launch keeps its story', () => {
    expect(originBadge({ source: 'launch', origin: 'jira', huKey: 'AA-96' })).toBe('AA-96');
    expect(executionTitle({ ...base, origin: 'jira', hu: { key: 'AA-96', title: 'Registro de cliente' } })).toBe('Registro de cliente');
  });
});
