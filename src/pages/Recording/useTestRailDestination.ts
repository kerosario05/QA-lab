import { useCallback, useEffect, useState } from 'react';
import { fetchProjectSuites, trProjectsProxy } from '../../services/testrail/projects';
import { trSectionsProxy } from '../../services/testrail/sections';
import type { TRSection } from '../../services/testrail/types';
import type { TestRailProject } from '../../types';

/**
 * Where a recording's cases will be filed in TestRail.
 *
 * Seeded from the project's own configuration, so the panel is usable without touching it —
 * a recorded case landing where the rest of that project's cases land is the right default.
 * What it adds is the ability to override that per recording, which the panel had no way to
 * express before: exploratory walkthroughs often belong in a different section than the
 * suite's regular cases.
 *
 * The lists come from the same proxies TestLaunch uses, cache and rate-limit handling
 * included, so the two screens can never disagree about what TestRail contains.
 */

export interface TestRailSeed {
  projectId?: string | null;
  suiteId?: string | null;
  sectionId?: string | null;
}

export interface TestRailDestination {
  projectId?: string;
  suiteId?: string;
  sectionId?: string;
}

export type TestRailSectionOption = TRSection & { suiteName?: string };

export function useTestRailDestination(seed: TestRailSeed | null | undefined) {
  const [projects, setProjects] = useState<TestRailProject[]>([]);
  const [suites, setSuites] = useState<{ id: number; name: string }[]>([]);
  const [sections, setSections] = useState<TestRailSectionOption[]>([]);

  const [projectId, setProjectId] = useState<string>('');
  const [suiteId, setSuiteId] = useState<string>('');
  const [sectionId, setSectionId] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seedProject = seed?.projectId ? String(seed.projectId) : '';
  const seedSuite = seed?.suiteId ? String(seed.suiteId) : '';
  const seedSection = seed?.sectionId ? String(seed.sectionId) : '';

  // The seed follows the selected project, so switching projects re-reads its configuration
  // instead of leaving the previous project's section selected.
  useEffect(() => {
    setProjectId(seedProject);
    setSuiteId(seedSuite);
    setSectionId(seedSection);
  }, [seedProject, seedSuite, seedSection]);

  useEffect(() => {
    let cancelled = false;
    trProjectsProxy
      .getAll()
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!projectId) {
      setSuites([]);
      setSections([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchProjectSuites(Number(projectId))
      .then(async (list) => {
        if (cancelled) return;
        setSuites(list);
        // Suite stays an internal TestRail detail. Load sections from every suite so the
        // visible project/section controls still work for projects with multiple suites.
        setSuiteId((current) => list.some((suite) => String(suite.id) === current)
          ? current
          : list.length === 1 ? String(list[0].id) : '');
        const groups = await Promise.all(list.map(async (suite) => ({
          suite,
          sections: await trSectionsProxy.getSections(Number(projectId), Number(suite.id)),
        })));
        if (cancelled) return;
        setSections(groups.flatMap(({ suite, sections: suiteSections }) =>
          suiteSections.map((section) => ({ ...section, suiteName: suite.name })),
        ));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // A saved destination may contain a section without its suite. Resolve the hidden suite
  // from the fetched section metadata so seeded destinations remain executable.
  useEffect(() => {
    if (suiteId || !sectionId) return;
    const section = sections.find((candidate) => String(candidate.id) === sectionId);
    if (section?.suite_id) setSuiteId(String(section.suite_id));
  }, [sectionId, sections, suiteId]);

  const chooseProject = useCallback((value: string) => {
    setProjectId(value);
    setSuiteId('');
    setSectionId('');
  }, []);

  const chooseSection = useCallback((value: string) => {
    const section = sections.find((candidate) => String(candidate.id) === value);
    setSectionId(value);
    if (section?.suite_id) setSuiteId(String(section.suite_id));
  }, [sections]);

  const destination: TestRailDestination = {
    projectId: projectId || undefined,
    suiteId: suiteId || undefined,
    sectionId: sectionId || undefined,
  };

  const sectionName = sections.find((s) => String(s.id) === sectionId)?.name;

  return {
    projects,
    suites,
    sections,
    projectId,
    suiteId,
    sectionId,
    sectionName,
    chooseProject,
    chooseSection,
    destination,
    loading,
    error,
  };
}
