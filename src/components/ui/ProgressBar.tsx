import { cn } from '../../constants/theme';

export type ProgressBarStatus = 'idle' | 'running' | 'success' | 'error';

interface ProgressBarProps {
  value?: number;
  max?: number;
  label?: string;
  status?: ProgressBarStatus;
  indeterminate?: boolean;
  showPercentage?: boolean;
  className?: string;
}

export function ProgressBar({
  value = 0,
  max = 100,
  label,
  status = 'idle',
  indeterminate = false,
  showPercentage = true,
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(max, value));
  const percent = max > 0 ? Math.round((clamped / max) * 100) : 0;
  const isRunning = status === 'running';
  const displayPercent = showPercentage ? `${percent}%` : null;

  return (
    <div className={cn('w-full', className)}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className={cn('text-[11px] font-medium', status === 'error' ? 'text-[#E63946]' : status === 'success' ? 'text-[#48A157]' : 'text-white/70')}>
            {label ?? ''}
          </span>
          {showPercentage && (
            <span className={cn('text-[11px] font-mono font-semibold', status === 'error' ? 'text-[#E63946]' : status === 'success' ? 'text-[#5EC470]' : 'text-white/80')}>
              {displayPercent}
            </span>
          )}
        </div>
      )}
      <div
        className={cn(
          'relative h-3.5 rounded-full overflow-hidden bg-white/10',
          status === 'success' && 'bg-[#5EC470]/20',
          status === 'error' && 'bg-[#E63946]/15',
        )}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={max}
        role="progressbar"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300 ease-out',
            status === 'success' && 'bg-[#5EC470]',
            status === 'error' && 'bg-[#E63946]',
            status === 'idle' && 'bg-[#5EC470]/35',
            isRunning && 'bg-[repeating-linear-gradient(45deg,#5EC470_0,#5EC470_10px,#8be28d_10px,#8be28d_20px)]',
          )}
          style={{
            width: indeterminate ? '100%' : `${percent}%`,
            transformOrigin: 'left center',
            animation: indeterminate && isRunning ? 'progress-indeterminate 1.6s ease-in-out infinite' : undefined,
          }}
        >
          {isRunning && (
            <div
              className="absolute inset-0 opacity-70"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                animation: indeterminate ? 'progress-shimmer 1.4s linear infinite' : undefined,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
