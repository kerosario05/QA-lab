import { useCallback, useState } from 'react';
import { mobileProxy } from '../../services/mobile';
import type { MobileScenario, MobileStep } from '../../services/mobile/types';
import type { RecordedScenario } from '../../services/recordings/types';

/**
 * Publishes recorded scenarios and runs them.
 *
 * This deliberately reuses the mobile launch/execute chain rather than growing a second one:
 * publishing creates the TestRail run, executing reports results back into it, and a
 * recorded scenario has no reason to travel a different road than a generated one once it
 * has real steps.
 *
 * Only scenarios carrying executable steps AND walked during the recording are sent. A
 * derived scenario — the negative behind an observed gate, the control that was on screen but
 * never pressed — is valuable as a TestRail case, but its expected result is a proposal
 * nobody has confirmed yet. Some of them do carry runnable steps, which is exactly why the
 * filter reads `provenance` rather than "does it have steps": running one would assert
 * something the recording never established.
 */

export interface RecordingProjectDetail {
  slug: string;
  name: string;
  type: 'web' | 'mobile';
  appPackage?: string;
  apkPath?: string;
  testRail?: { projectIdTr?: string; suiteId?: string | null; sectionId?: string | null } | null;
}

export interface ExecutionLaunch {
  jobId: string;
  issueKey?: string;
  checklistUrl?: string;
  scenarioCount: number;
}

/** Recorded scenarios become MobileScenario without inventing anything the trace lacked. */
export function toMobileScenarios(scenarios: RecordedScenario[]): MobileScenario[] {
  return scenarios
    .filter((s) => s.mobileSteps.length > 0 && s.provenance !== 'derived')
    .map((s) => ({
      scenarioId: s.scenarioId,
      sourceIssueKey: `REC-${s.sourceRecordingId.slice(0, 8).toUpperCase()}`,
      title: s.title,
      steps: s.mobileSteps as unknown as MobileStep[],
      expectedResult: s.testRailSteps[s.testRailSteps.length - 1]?.expected ?? '',
      preconditions: s.preconditions,
      requiredData: s.requiredData.map((d) => ({
        key: d.key,
        label: d.label,
        kind: 'text' as const,
        stepIndex: d.stepIndex,
        exampleValue: d.exampleValue,
        sensitive: d.sensitive,
      })),
    })) as MobileScenario[];
}

export function useRecordingExecution() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const execute = useCallback(
    async (
      project: RecordingProjectDetail,
      scenarios: RecordedScenario[],
      dataOverrides: Record<string, Record<number, string>>,
    ): Promise<ExecutionLaunch | null> => {
      setError(null);
      setNotice(null);

      const executable = toMobileScenarios(scenarios);
      if (executable.length === 0) {
        setError('Ninguno de los escenarios seleccionados tiene pasos ejecutables.');
        return null;
      }

      const projectIdTr = Number(project.testRail?.projectIdTr ?? 0);
      const sectionId = Number(project.testRail?.sectionId ?? 0);
      if (!projectIdTr || !sectionId) {
        setError(
          `El proyecto ${project.name} no tiene TestRail configurado (projectId y sectionId). Configúralo antes de ejecutar.`,
        );
        return null;
      }

      setRunning(true);
      try {
        // Some scenarios may already have been published on their own; asking TestRail to
        // reuse what exists keeps a second run from duplicating every case.
        const alreadyPublished = scenarios.some((s) => s.testRailCaseId);
        const launch = await mobileProxy.publishToTestRail({
          appSlug: project.slug,
          projectId: projectIdTr,
          testrailSectionId: sectionId,
          suiteId: project.testRail?.suiteId ? Number(project.testRail.suiteId) : undefined,
          publishStrategy: alreadyPublished ? 'use_existing' : 'always_create',
          scenarios: executable,
        });

        if (!launch.launchId || !launch.testRunId) {
          setError(launch.message ?? 'TestRail no devolvió una corrida ejecutable para estos escenarios.');
          return null;
        }

        const run = await mobileProxy.executeRun({
          launchId: launch.launchId,
          testRunId: launch.testRunId,
          publishedCases: launch.publishedCases,
          appSlug: project.slug,
          scenarios: executable.map((s) => ({
            scenarioId: s.scenarioId,
            title: s.title,
            steps: s.steps,
            requiredData: s.requiredData,
          })),
          ...(Object.keys(dataOverrides).length > 0 ? { dataOverrides } : {}),
        });

        const skipped = scenarios.length - executable.length;
        if (skipped > 0) {
          setNotice(
            `${skipped} escenario(s) se publicaron en TestRail pero no se ejecutan: describen un estado que la grabación no recorrió y su resultado esperado está por confirmar.`,
          );
        }

        return {
          jobId: run.jobId,
          issueKey: run.issueKey,
          checklistUrl: run.checklistUrl,
          scenarioCount: executable.length,
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setRunning(false);
      }
    },
    [],
  );

  return { execute, running, error, notice, setError };
}
