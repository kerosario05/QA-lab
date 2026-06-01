import { cn } from '../../constants/theme';

interface BentoCardProps {
  children: React.ReactNode;
  className?: string;
  accent?: string;
}

export function BentoCard({ children, className, accent }: BentoCardProps) {
  return (
    <div className={cn(
      'bg-white rounded-2xl border border-[#E8EBEC] p-5 relative overflow-hidden transition-all hover:border-[#BABEC3] hover:shadow-[0_2px_24px_-12px_rgba(16,75,153,0.18)]',
      className
    )}>
      {accent && <div className="absolute top-0 left-5 right-5 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />}
      {children}
    </div>
  );
}
