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
});
