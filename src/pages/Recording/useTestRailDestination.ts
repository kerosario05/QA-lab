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

export function useTestRailDestination(seed: TestRailSeed | null | undefined) {
  const [projects, setProjects] = useState<TestRailProject[]>([]);
  const [suites, setSuites] = useState<{ id: number; name: string }[]>([]);
  const [sections, setSections] = useState<TRSection[]>([]);

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
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchProjectSuites(Number(projectId))
      .then((list) => {
        if (cancelled) return;
        setSuites(list);
        // A single-suite project has nothing to choose: picking it keeps the section list
        // one step away instead of stalling on a dropdown with one entry.
        if (list.length === 1) setSuiteId(String(list[0].id));
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

  useEffect(() => {
    if (!projectId || !suiteId) {
      setSections([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    trSectionsProxy
      .getSections(Number(projectId), Number(suiteId))
      .then((list) => {
        if (!cancelled) setSections(list);
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
  }, [projectId, suiteId]);

  const chooseProject = useCallback((value: string) => {
    setProjectId(value);
    setSuiteId('');
    setSectionId('');
  }, []);

  const chooseSuite = useCallback((value: string) => {
    setSuiteId(value);
    setSectionId('');
  }, []);

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
    chooseSuite,
    setSectionId,
    destination,
    loading,
    error,
  };
}
