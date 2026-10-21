import { useCallback, useEffect, useState } from 'react';
import { testDesignApi } from '../../services/test-design';
import type { TestRailProject } from '../../types';
import type { TestRailDestination, TestRailSeed, TestRailSectionOption } from '../Recording/useTestRailDestination';

/** Test Design's isolated catalog endpoints keep its access scoped to testdesign.view. */
export function useTestDesignTestRailDestination(seed: TestRailSeed | null | undefined) {
  const [projects, setProjects] = useState<TestRailProject[]>([]);
  const [suites, setSuites] = useState<{ id: number; name: string }[]>([]);
  const [sections, setSections] = useState<TestRailSectionOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [suiteId, setSuiteId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seedProject = seed?.projectId ? String(seed.projectId) : '';
  const seedSuite = seed?.suiteId ? String(seed.suiteId) : '';
  const seedSection = seed?.sectionId ? String(seed.sectionId) : '';

  useEffect(() => {
    setProjectId(seedProject);
    setSuiteId(seedSuite);
    setSectionId(seedSection);
  }, [seedProject, seedSuite, seedSection]);

  useEffect(() => {
    let cancelled = false;
    testDesignApi.listTestRailProjects()
      .then((list) => {
        if (cancelled) return;
        setProjects(list.map((project) => ({
          ...project,
          totalCaseCount: 0,
          suites: [],
        })));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
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
    testDesignApi.listTestRailSuites(Number(projectId))
      .then(async (list) => {
        if (cancelled) return;
        setSuites(list.map(({ id, name }) => ({ id, name })));
        setSuiteId((current) => list.some((suite) => String(suite.id) === current)
          ? current
          : list.length === 1 ? String(list[0].id) : '');
        const groups = await Promise.all(list.map(async (suite) => ({
          suite,
          sections: await testDesignApi.listTestRailSections(Number(projectId), suite.id),
        })));
        if (cancelled) return;
        setSections(groups.flatMap(({ suite, sections: suiteSections }) =>
          suiteSections.map((section) => ({
            ...section,
            description: section.description ?? null,
            display_order: section.display_order ?? 0,
            suiteName: suite.name,
          } as TestRailSectionOption)),
        ));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectId]);

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

  return {
    projects,
    suites,
    sections,
    projectId,
    suiteId,
    sectionId,
    sectionName: sections.find((section) => String(section.id) === sectionId)?.name,
    chooseProject,
    chooseSection,
    destination,
    loading,
    error,
  };
}
