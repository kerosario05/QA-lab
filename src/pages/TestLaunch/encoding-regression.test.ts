import { describe, expect, it } from 'vitest';

import testLaunchSource from './index.tsx?raw';

function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('TestLaunch encoding regression', () => {
  it('does not contain common mojibake sequences in visible source text', () => {
    const source = stripComments(testLaunchSource);
    const mojibakePatterns = [
      'Â¿',
      'Ã¡',
      'Ã©',
      'Ã­',
      'Ã³',
      'Ãº',
      'Ã±',
      'Ã',
      'Â·',
      'â€”',
    ];

    for (const pattern of mojibakePatterns) {
      expect(source).not.toContain(pattern);
    }
  });
});
