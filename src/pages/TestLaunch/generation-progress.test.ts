import { describe, expect, it } from 'vitest';
import { computeGenerationProgress } from './generation-progress';

describe('generation progress', () => {
  it('renders 0% when idle', () => {
    const result = computeGenerationProgress({
      storiesLoading: false,
      storiesError: null,
      storiesLoaded: false,
      currentStep: 3,
      now: 0,
      startedAt: 0,
    });
    expect(result.status).toBe('idle');
    expect(result.percent).toBe(0);
  });

  it('advances by phase while running', () => {
    const consulting = computeGenerationProgress({
      storiesLoading: true,
      storiesError: null,
      storiesLoaded: false,
      currentStep: 3,
      startedAt: 0,
      now: 1200,
    });
    expect(consulting.status).toBe('running');
    expect(consulting.percent).toBeGreaterThanOrEqual(20);

    const generating = computeGenerationProgress({
      storiesLoading: true,
      storiesError: null,
      storiesLoaded: false,
      currentStep: 3,
      startedAt: 0,
      now: 4200,
    });
    expect(generating.percent).toBeGreaterThanOrEqual(70);
    expect(generating.indeterminate).toBe(true);
  });

  it('fills to 100 on success', () => {
    const result = computeGenerationProgress({
      storiesLoading: false,
      storiesError: null,
      storiesLoaded: true,
      currentStep: 3,
      startedAt: 0,
      now: 5000,
    });
    expect(result.status).toBe('success');
    expect(result.percent).toBe(100);
  });

  it('returns error state when story generation fails', () => {
    const result = computeGenerationProgress({
      storiesLoading: false,
      storiesError: 'boom',
      storiesLoaded: false,
      currentStep: 3,
      startedAt: 0,
      now: 5000,
    });
    expect(result.status).toBe('error');
    expect(result.percent).toBe(0);
  });
});
