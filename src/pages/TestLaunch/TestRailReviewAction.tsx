import { useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import type { TestRailReviewDetails, TestRailReviewItem } from '../../services/testrail/reviews';
export type { TestRailReviewDetails } from '../../services/testrail/reviews';

type Props = {
  source: 'testrail' | 'jira';
  hasProposals: boolean;
  review?: TestRailReviewDetails;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
};

function renderRequirement(requirement: TestRailReviewItem): string {
  return `${requirement.label ?? requirement.key} (${requirement.key}, ${requirement.controlType ?? 'unknown'})`;
}

export function TestRailReviewAction({ source, hasProposals, review, onApprove, onReject }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(review?.status ?? 'pending');
  if (source !== 'testrail' || !hasProposals) return null;

  const details = review ?? { status: 'pending' as const, existingRequirements: [], proposals: [], unresolvedPlaceholders: [], conflicts: [] };
  const approve = async () => { await onApprove(); setStatus('approved'); setOpen(false); };
  const reject = async () => { await onReject(); setStatus('rejected'); setOpen(false); };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[10px] font-semibold text-[#104B99] hover:text-[#0d3d7d] whitespace-nowrap">
        Revisar mejoras
      </button>
      {status !== 'pending' && <span className="text-[10px] text-[#8B999D]">{status === 'approved' ? 'Aprobado' : 'Rechazado'}</span>}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" role="dialog" aria-label="Revisión de mejoras TestRail">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#E8EBEC] shadow-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-semibold text-[#1a1f2e]">Revisión de mejoras TestRail</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={16} className="text-[#8B999D]" /></button>
            </div>
            <div className="space-y-3 text-[11px] text-[#58646D]">
              <section><div className="font-semibold text-[#1a1f2e] mb-1">Requirements existentes</div><div>{details.existingRequirements.map(renderRequirement).join(', ') || 'Ninguno'}</div></section>
              <section><div className="font-semibold text-[#1a1f2e] mb-1">Propuestas nuevas</div><div>{details.proposals.map(renderRequirement).join(', ') || 'Ninguna'}</div></section>
              <section><div className="font-semibold text-[#1a1f2e] mb-1">Unresolved placeholders</div><div>{details.unresolvedPlaceholders.join(', ') || 'Ninguno'}</div></section>
              <section><div className="font-semibold text-[#1a1f2e] mb-1 flex items-center gap-1"><AlertTriangle size={12} /> Conflictos</div><div>{details.conflicts.map(conflict => `${conflict.key}: ${conflict.reason}`).join(', ') || 'Ninguno'}</div></section>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" data-testid="reject-review" onClick={reject} className="px-3 py-1.5 rounded-lg border border-[#E8EBEC] text-[11px] font-semibold text-[#58646D]">Rechazar</button>
              <button type="button" data-testid="approve-review" onClick={approve} className="px-3 py-1.5 rounded-lg bg-[#48A157] text-white text-[11px] font-semibold flex items-center gap-1"><Check size={12} /> Aprobar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
