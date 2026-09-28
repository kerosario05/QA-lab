import { Loader2 } from 'lucide-react';
import { describeGenerationProgress, type GenerationProgress } from './generation-progress';

/**
 * Loading indicator for the two waits after a recording: Stop finishing the queued captures, and
 * the engine generating the steps. Shows the stage and counts instead of a silent spinner.
 */
export function GenerationProgressIndicator({ progress, testId }: { progress: GenerationProgress | null; testId?: string }) {
  if (!progress) {
    return (
      <div aria-live="polite" data-testid={testId} className="mt-4 flex items-center gap-2 text-[12px] text-[#58646D]">
        <Loader2 size={14} className="animate-spin" />
        Generando escenarios…
      </div>
    );
  }
  const view = describeGenerationProgress(progress);
  return (
    <div aria-live="polite" data-testid={testId} className="mt-4 rounded-xl border border-[#E3E8EC] bg-[#F7F9FA] px-4 py-3">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-[#1a1f2e]">
        <Loader2 size={14} className="animate-spin shrink-0" />
        <span>{view.title}</span>
      </div>
      {view.detail && <p className="mt-1 pl-[22px] text-[11px] text-[#58646D]">{view.detail}</p>}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={view.percent}
        aria-label={view.title}
        className="mt-2 ml-[22px] h-1.5 overflow-hidden rounded-full bg-[#E3E8EC]"
      >
        <div className="h-full rounded-full bg-[#48A157] transition-all duration-500" style={{ width: `${view.percent}%` }} />
      </div>
    </div>
  );
}
