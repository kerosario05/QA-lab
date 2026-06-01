import { cn } from '../../constants/theme';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const styles: Record<string, { bg: string; label: string }> = {
  success: { bg: '#48A157', label: 'OK' },
  partial: { bg: '#F4A261', label: 'Parcial' },
  failed: { bg: '#E63946', label: 'Fallo' },
  running: { bg: '#104B99', label: 'Activo' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const s = styles[status] ?? styles.success;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium" style={{ color: s.bg }}>
      <span
        className={cn('w-1.5 h-1.5 rounded-full', status === 'running' && 'animate-pulse')}
        style={{ background: s.bg, boxShadow: `0 0 0 3px ${s.bg}20` }}
      />
      {s.label}
    </span>
  );
}
