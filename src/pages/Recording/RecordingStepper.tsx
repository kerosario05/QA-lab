import { Boxes, CheckCircle2, GitBranch, Layers, Rocket, Video } from 'lucide-react';
import { cn } from '../../constants/theme';

export type RecordingStepId = 'proyecto' | 'grabar' | 'escenarios' | 'fuentes' | 'lanzar';

/** The recording journey, in order. Same pill style as the test launcher's step bar. */
const STEPS: { id: RecordingStepId; label: string; icon: typeof Boxes }[] = [
  { id: 'proyecto', label: 'Proyecto', icon: Boxes },
  { id: 'grabar', label: 'Grabar', icon: Video },
  { id: 'escenarios', label: 'Escenarios', icon: Layers },
  { id: 'fuentes', label: 'Fuentes', icon: GitBranch },
  { id: 'lanzar', label: 'Lanzar', icon: Rocket },
];

/** Steps before `current` are completed, `current` is active, the rest are pending. */
export function RecordingStepper({ current }: { current: RecordingStepId }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);
  return (
    <div className="mb-5 flex items-center justify-center">
      <div className="flex items-center gap-2">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const status = index < currentIndex ? 'completed' : index === currentIndex ? 'active' : 'inactive';
          return (
            <div key={step.id} className="flex items-center gap-2">
              <div
                className={cn(
                  'flex items-center gap-2 rounded-full px-4 py-2 transition-all',
                  status === 'active' && 'bg-[#1a1f2e] text-white',
                  status === 'completed' && 'bg-[#48A157] text-white',
                  status === 'inactive' && 'border border-[#E8EBEC] bg-white text-[#8B999D]',
                )}
              >
                {status === 'completed' ? <CheckCircle2 size={13} strokeWidth={3} /> : <Icon size={13} />}
                <span className="text-[11px] font-semibold uppercase tracking-wider">{step.label}</span>
              </div>
              {index < STEPS.length - 1 && (
                <div className={cn('h-px w-6 transition-all', status === 'completed' ? 'bg-[#48A157]' : 'bg-[#E8EBEC]')} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
