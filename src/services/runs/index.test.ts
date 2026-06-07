import { describe, expect, it } from 'vitest';
import { toRunLogEntry } from './index';

describe('runs service log mapping', () => {
  it('preserva logs SSE con payload { line }', () => {
    expect(toRunLogEntry({ line: '[discovery:preview] Results: 5 passed, 2 failed out of 7' })).toEqual({
      timestamp: undefined,
      level: undefined,
      message: '[discovery:preview] Results: 5 passed, 2 failed out of 7',
    });
  });

  it('mantiene payloads que ya vienen con message', () => {
    expect(toRunLogEntry({ message: 'stdout real', level: 'info' })).toEqual({
      message: 'stdout real',
      level: 'info',
    });
  });

  it('maneja payload con { log }', () => {
    expect(toRunLogEntry({ log: 'texto desde log' })).toEqual({
      timestamp: undefined,
      level: undefined,
      message: 'texto desde log',
    });
  });

  it('maneja payload con { text }', () => {
    expect(toRunLogEntry({ text: 'texto plano' })).toEqual({
      timestamp: undefined,
      level: undefined,
      message: 'texto plano',
    });
  });

  it('maneja string directo', () => {
    expect(toRunLogEntry('linea directa')).toEqual({
      message: 'linea directa',
    });
  });

  it('retorna null para string vacío', () => {
    expect(toRunLogEntry('')).toBeNull();
  });

  it('retorna null para objeto con línea vacía', () => {
    expect(toRunLogEntry({ line: '' })).toBeNull();
  });

  it('retorna null para objeto vacío', () => {
    expect(toRunLogEntry({})).toBeNull();
  });
});
