import { describe, it, expect } from 'vitest';
import { normalizeTestRailCasesResponse, parseInputRequirements } from './testrail-client';

describe('parseInputRequirements', () => {
  it('parses a valid JSON array into normalized input requirements', () => {
    const raw = JSON.stringify([
      { key: 'auth.username', label: 'Usuario', controlType: 'text', required: true, sensitive: false, allowedValues: ['a', 'b'], unknown: 'ignored' },
      { key: 'auth.password', label: 'Contraseña', controlType: 'password', required: true, sensitive: true },
    ]);
    const result = parseInputRequirements(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      key: 'auth.username',
      label: 'Usuario',
      controlType: 'text',
      required: true,
      sensitive: false,
      allowedValues: ['a', 'b'],
    });
    expect(result[1]).toEqual({
      key: 'auth.password',
      label: 'Contraseña',
      controlType: 'password',
      required: true,
      sensitive: true,
    });
  });

  it('returns an empty array when the field is missing, null, or empty', () => {
    expect(parseInputRequirements(undefined)).toEqual([]);
    expect(parseInputRequirements(null)).toEqual([]);
    expect(parseInputRequirements('')).toEqual([]);
  });

  it('returns an empty array for invalid JSON without throwing', () => {
    expect(parseInputRequirements('{ not valid json')).toEqual([]);
    expect(parseInputRequirements('[]')).toEqual([]);
    expect(parseInputRequirements('[{"key":123}]')).toEqual([]);
    expect(parseInputRequirements('[{"label":"no key"}]')).toEqual([]);
  });

  it('does not break case normalization when the custom field is invalid or absent', () => {
    const input = [
      { id: 1, title: 'C1', custom_input_requirements_json: '{ broken' },
      { id: 2, title: 'C2' },
      { id: 3, title: 'C3', custom_input_requirements_json: '[{"key":"ok","label":"Ok"}]' },
    ];
    const result = normalizeTestRailCasesResponse(input);
    expect(result.cases).toHaveLength(3);
    expect(result.cases[0].inputRequirements).toEqual([]);
    expect(result.cases[1].inputRequirements).toBeUndefined();
    expect(result.cases[2].inputRequirements).toEqual([{ key: 'ok', label: 'Ok' }]);
  });
});