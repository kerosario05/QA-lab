import { useEffect, useState } from 'react';
import { GitBranch, Loader2 } from 'lucide-react';
import { BentoCard } from '../../components/ui/BentoCard';
import { testPlanning, type TestPlanningMetrics } from '../../services/test-planning';

/**
 * "Planificación de pruebas" on the Panorama: how many test plans QA reviewed,
 * how many were valid as written, and what QA added. Data comes from
 * /api/test-planning/metrics, already narrowed to the user's projects.
 *
 * Two categorical hues (validated: lightness, chroma, CVD, contrast), always
 * paired with a direct label so identity is never color alone.
 */

const OUTCOMES = [
  { key: 'acceptedAsIs', label: 'Válidos sin cambios', color: '#2a78d6' },
  { key: 'withChanges', label: 'Completados por QA', color: '#eb6834' },
] as const;

const fmt = (n: number) => n.toLocaleString('es-DO');

function shortDate(iso: string) {
  return new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

function Header({ days }: { days: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#104B99]/10">
        <GitBranch size={13} className="text-[#104B99]" />
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Planificación de pruebas · últimos {days} días</div>
        <h3 className="text-[20px] font-medium leading-tight text-[#1a1f2e]">Revisión de test-plans</h3>
      </div>
    </div>
  );
}

/** Part-to-whole bar: accepted as written vs completed by QA, 2px gap, hover title per segment. */
function OutcomeBar({ metrics }: { metrics: TestPlanningMetrics }) {
  const total = metrics.plansReviewed;
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded" role="img" aria-label={OUTCOMES.map((o) => `${o.label}: ${metrics[o.key]}`).join(', ')}>
        {OUTCOMES.map((o) =>
          metrics[o.key] > 0 ? (
            <div
              key={o.key}
              title={`${o.label}: ${fmt(metrics[o.key])} (${Math.round((metrics[o.key] / total) * 100)}%)`}
              style={{ width: `${(metrics[o.key] / total) * 100}%`, background: o.color }}
              className="first:rounded-l last:rounded-r"
            />
          ) : null,
        )}
      </div>
      <div className="mt-3 space-y-1.5">
        {OUTCOMES.map((o) => (
          <div key={o.key} className="flex items-center gap-2 text-[11px]">
            <span className="h-2 w-2 rounded-sm" style={{ background: o.color }} />
            <span className="text-[#58646D]">{o.label}</span>
            <span className="ml-auto font-medium text-[#1a1f2e]">{fmt(metrics[o.key])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tiny({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-[#8B999D]">{label}</div>
      <div className="mt-0.5 text-[18px] font-medium text-[#1a1f2e]">{fmt(value)}</div>
    </div>
  );
}

interface TestPlanningSectionProps {
  projectSlug?: string;
  refreshKey?: string;
}

export function TestPlanningSection({ projectSlug, refreshKey }: TestPlanningSectionProps) {
  const [metrics, setMetrics] = useState<TestPlanningMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    testPlanning
      .metrics(30, projectSlug)
      .then((m) => {
        if (cancelled) return;
        setMetrics(m);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [projectSlug, refreshKey]);

  if (error && !metrics) {
    return (
      <BentoCard>
        <Header days={30} />
        <p className="mt-4 text-[11px] text-[#8B6A20]">No se pudieron cargar las métricas de planificación de pruebas: {error}</p>
      </BentoCard>
    );
  }

  if (!metrics) {
    return (
      <BentoCard>
        <Header days={30} />
        <div className="mt-6 flex items-center gap-2 text-[11px] text-[#8B999D]"><Loader2 size={13} className="animate-spin" /> Cargando…</div>
      </BentoCard>
    );
  }

  if (metrics.plansReviewed === 0) {
    return (
      <BentoCard>
        <Header days={metrics.days} />
        <div className="mt-5 rounded-xl border border-dashed border-[#D9DEDF] p-8 text-center text-[11px] text-[#8B999D]">
          Todavía no se han revisado test-plans en este periodo. Revísalos desde <strong className="text-[#58646D]">Planificación de pruebas</strong>:
          acéptalos como válidos o complétalos y haz commit.
        </div>
      </BentoCard>
    );
  }

  const rate = Math.round((metrics.acceptanceRate ?? 0) * 100);

  return (
    <section className="grid grid-cols-12 gap-4" aria-label="Planificación de pruebas">
      <BentoCard className="col-span-12 lg:col-span-4">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Planificación de pruebas · últimos {metrics.days} días</div>
        <div className="mt-1 text-[13px] text-[#58646D]">Test-plans revisados por QA</div>
        <div className="mt-1 flex items-end gap-3">
          <div className="text-[44px] font-semibold leading-none tracking-tight text-[#1a1f2e]">{fmt(metrics.plansReviewed)}</div>
          <div className="pb-1.5 text-[11px] text-[#58646D]">{rate}% válidos tal como vinieron</div>
        </div>
        <div className="mt-5"><OutcomeBar metrics={metrics} /></div>
      </BentoCard>

      <BentoCard className="col-span-12 sm:col-span-6 lg:col-span-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Aporte de QA</div>
        <h3 className="mb-4 text-[15px] font-medium text-[#1a1f2e]">{fmt(metrics.commits)} {metrics.commits === 1 ? 'commit' : 'commits'} a las ramas</h3>
        <div className="grid grid-cols-2 gap-4">
          <Tiny label="Escenarios revisados" value={metrics.scenariosReviewed} />
          <Tiny label="Agregados" value={metrics.scenariosAdded} />
          <Tiny label="Editados" value={metrics.scenariosEdited} />
          <Tiny label="Eliminados" value={metrics.scenariosRemoved} />
        </div>
        {metrics.byReviewer.length > 0 && (
          <div className="mt-5 border-t border-[#F0F1EF] pt-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Quién más revisa</div>
            {metrics.byReviewer.slice(0, 3).map((r) => (
              <div key={r.userName} className="flex items-center justify-between py-0.5 text-[11px]">
                <span className="truncate text-[#58646D]">{r.userName}</span>
                <span className="text-[#1a1f2e]"><strong>{fmt(r.reviews)}</strong> <span className="text-[10px] text-[#8B999D]">revisiones</span></span>
              </div>
            ))}
          </div>
        )}
      </BentoCard>

      <BentoCard className="col-span-12 sm:col-span-6 lg:col-span-5">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Actividad reciente</div>
        <h3 className="mb-3 text-[15px] font-medium text-[#1a1f2e]">Últimas revisiones</h3>
        <div className="divide-y divide-[#F0F1EF]">
          {metrics.recent.map((r) => (
            <div key={`${r.projectSlug}-${r.issueKey}-${r.reviewedAt}`} className="flex items-center gap-3 py-2">
              <span className="w-[72px] shrink-0 font-mono text-[11px] font-semibold text-[#104B99]">{r.issueKey}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-[#1a1f2e]">
                  {r.outcome === 'accepted' ? 'Aceptado sin cambios' : `+${r.added} nuevos · ${r.edited} editados${r.removed ? ` · −${r.removed}` : ''}`}
                </div>
                <div className="truncate text-[10px] text-[#8B999D]">
                  {[r.userName, !projectSlug ? r.projectSlug : null, shortDate(r.reviewedAt), r.commitSha ? r.commitSha.slice(0, 8) : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold text-[#1a1f2e]"
                style={{ background: `${r.outcome === 'accepted' ? OUTCOMES[0].color : OUTCOMES[1].color}1f` }}
              >
                {r.outcome === 'accepted' ? 'Válido' : 'Con cambios'}
              </span>
            </div>
          ))}
        </div>
      </BentoCard>
    </section>
  );
}
