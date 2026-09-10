import { describe, expect, it } from 'vitest';
import { mapLaunchProject } from './index';

describe('selected project identity', () => {
  it('preserves UUID and slug as distinct responsibilities', () => {
    expect(mapLaunchProject({ id: 'uuid-a', slug: 'project-a', name: 'Project A', projectType: 1, status: 1, enabled: true })).toMatchObject({
      id: 'uuid-a',
      slug: 'project-a',
    });
    expect(mapLaunchProject({ id: 'uuid-b', slug: 'project-b', name: 'Project B', projectType: 1, status: 1, enabled: true })).toMatchObject({
      id: 'uuid-b',
      slug: 'project-b',
    });
  });
});
