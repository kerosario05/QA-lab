import { describe, expect, it } from 'vitest';
import { cleanTestRailDetail, normalizeTestRailStep } from './index';

describe('TestRail case detail formatting', () => {
  it('T1: cleans preconditions into individual items', () => {
    expect(cleanTestRailDetail('<ul><li>Sesión cerrada</li><li>App disponible</li></ul>')).toEqual(['Sesión cerrada', 'App disponible']);
  });

  it('T2: separates and preserves ordered steps', () => {
    expect(cleanTestRailDetail('<ol><li>Abrir menú</li><li>Seleccionar opción</li></ol>')).toEqual(['Abrir menú', 'Seleccionar opción']);
  });

  it('T3: preserves the received expected result', () => {
    expect(cleanTestRailDetail('<p>Se muestra el catálogo.</p>')).toEqual(['Se muestra el catálogo.']);
  });

  it('T4: removes basic HTML markup', () => {
    expect(cleanTestRailDetail('<p>Uno<br>Dos</p>')).toEqual(['Uno', 'Dos']);
  });

  it('T5: removes technical metadata from functional content', () => {
    expect(cleanTestRailDetail('<p>Resultado</p>[automationScenarioId: internal-1][appSlug: app-a]')).toEqual(['Resultado']);
  });

  it('T6: returns no section content when the field is absent', () => {
    expect(cleanTestRailDetail(null)).toEqual([]);
  });

  it('T7: keeps the section source order for the caller', () => {
    const sections = [
      cleanTestRailDetail('Precondición'),
      cleanTestRailDetail('Paso'),
      cleanTestRailDetail('Resultado'),
    ];
    expect(sections.flat()).toEqual(['Precondición', 'Paso', 'Resultado']);
  });
});

describe('TestRail step numbering', () => {
  it('T1: removes one dot-number prefix before frontend numbering', () => {
    expect(normalizeTestRailStep('1. Validar pantalla')).toBe('Validar pantalla');
  });

  it('T2: removes one parenthesis-number prefix', () => {
    expect(normalizeTestRailStep('2) Hacer clic')).toBe('Hacer clic');
  });

  it('T3: keeps an unprefixed step unchanged', () => {
    expect(normalizeTestRailStep('Seleccionar opción')).toBe('Seleccionar opción');
  });

  it('T4: preserves numbers that are part of the content', () => {
    expect(normalizeTestRailStep('Validar código 1234')).toBe('Validar código 1234');
    expect(normalizeTestRailStep('Esperar 30 segundos')).toBe('Esperar 30 segundos');
    expect(normalizeTestRailStep('Seleccionar opción 2FA')).toBe('Seleccionar opción 2FA');
  });

  it('T5: preserves the original step order', () => {
    expect(['1. Primero', '2) Segundo', 'Tercero'].map(normalizeTestRailStep))
      .toEqual(['Primero', 'Segundo', 'Tercero']);
  });
});
