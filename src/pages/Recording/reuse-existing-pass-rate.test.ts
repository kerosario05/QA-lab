import { describe, expect, it } from 'vitest';
import { computeFunctionalPassRatePercent, computeLiveExecutionMetrics } from '../LiveExecution/state';

/**
 * Proves the reuse_existing job's summary shape (built in the backend by
 * startReuseExistingPromotedSpecRun — see scenario-preview-runner.reuse-existing-job.test.ts
 * on the backend side) is read correctly by the SAME Pass Rate math every other execution
 * uses. No frontend-specific reuse logic exists here by design — a reuse_existing job is
 * just a job like any other by the time it reaches this screen.
 */
describe('reuse_existing job summary -> Pass Rate', () => {
  // CASE 5: single scenario, case_finished PASS -> pass rate 100%
  it('a single passing scenario reports 1 passed / 0 failed / 100% pass rate', () => {
    const metrics = computeLiveExecutionMetrics(null, {
      status: 'done',
      passed: 1,
      failed: 0,
      completed: 1,
      summary: { total: 1, passed: 1, failed: 0, completed: 1, scenarioCount: 1 },
    });
    expect(metrics.passed).toBe(1);
    expect(metrics.failed).toBe(0);
    expect(computeFunctionalPassRatePercent(metrics.passed, metrics.failed)).toBe(100);
  });

  // CASE 6: single scenario, case_finished FAIL -> pass rate 0%
  it('a single failing scenario reports 0 passed / 1 failed / 0% pass rate', () => {
    const metrics = computeLiveExecutionMetrics(null, {
      status: 'failed',
      passed: 0,
      failed: 1,
      completed: 1,
      summary: { total: 1, passed: 0, failed: 1, completed: 1, scenarioCount: 1 },
    });
    expect(metrics.passed).toBe(0);
    expect(metrics.failed).toBe(1);
    expect(computeFunctionalPassRatePercent(metrics.passed, metrics.failed)).toBe(0);
  });
});
