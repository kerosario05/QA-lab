import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { cn } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import { testDesignApi, type TestDesignMetrics } from '../../services/test-design';

/**
 * "Diseño de pruebas" on the Panorama: the cases authored in the module, how many
 * reached TestRail, and how those same TestRail cases did when executed. Data comes
 * from /api/test-design/metrics, already narrowed to the user's drafts (or to
 * `projectSlug` in a project's own dashboard).
 *
 * Passed/failed green and red are not separable under deuteranopia, so state never
 * relies on that pair alone: weekly bars split by lightness with a legend and a
 * tooltip, and every result badge carries an icon and a word.
 */

const SERIES = '#2a78d6';
const PASSED = '#48A157';
const FAILED = '#E63946';
const DAYS = 30;

const fmt = (n: number) => n.toLocaleString('es-DO');
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

function shortDate(iso: string) {
  return new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

function Header({ days }: { days: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#104B99]/10">
        <ClipboardList size={13} className="text-[#104B99]" />
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Diseño de pruebas · últimos {days} días</div>
        <h3 className="text-[20px] font-medium leading-tight text-[#1a1f2e]">Casos de diseño ejecutados</h3>
      </div>
    </div>
  );
}

/** Weekly executions on the hero: passed solid, failed faint, stacked with a 2px gap. */
function WeeklyBars({ weeks }: { weeks: TestDesignMetrics['weekly'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.passed + w.failed));
  return (
    <div>
      <div
        className="relative"
        role="img"
        aria-label={`Ejecuciones por semana: ${weeks.map((w) => `${shortDate(w.weekStart)} ${w.passed} aprobadas, ${w.failed} fallidas`).join('; ')}`}
      >
        <div className="flex h-[72px] items-end gap-1.5">
          {weeks.map((w, i) => {
            const total = w.passed + w.failed;
            return (
              <div
                key={w.weekStart}
                className={cn('flex h-full flex-1 cursor-default flex-col justify-end gap-[2px] transition-opacity', hover !== null && hover !== i && 'opacity-50')}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {total === 0 ? (
                  <div className="h-[2px] w-full rounded-t-[4px] bg-white/25" />
                ) : (
                  <>
                    {w.failed > 0 && <div className={cn('w-full bg-white/40', 'rounded-t-[4px]')} style={{ height: `${(w.failed / max) * 100}%` }} />}
                    {w.passed > 0 && <div className={cn('w-full bg-white/90', w.failed === 0 && 'rounded-t-[4px]')} style={{ height: `${(w.passed / max) * 100}%` }} />}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1.5">
          {weeks.map((w) => (
            <div key={w.weekStart} className="flex-1 text-center text-[9px] text-white/55">{shortDate(w.weekStart)}</div>
          ))}
        </div>
        {hover !== null && (
          <div
            className={cn(
              'pointer-events-none absolute -top-9 z-10 whitespace-nowrap rounded-lg bg-white px-2.5 py-1.5 text-[10px] text-[#1a1f2e] shadow-lg',
              // Edge bars anchor the tooltip inward so the card does not clip it.
              hover === 0 ? 'left-0' : hover === weeks.length - 1 ? 'right-0' : '-translate-x-1/2',
            )}
            style={hover === 0 || hover === weeks.length - 1 ? undefined : { left: `${((hover + 0.5) / weeks.length) * 100}%` }}
          >
            Semana del {shortDate(weeks[hover].weekStart)}: <strong>{fmt(weeks[hover].passed)}</strong> aprobadas ·{' '}
            <strong>{fmt(weeks[hover].failed)}</strong> fallidas
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-4 text-[10px] text-white/75">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-white/90" />Aprobadas</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-white/40" />Fallidas</span>
      </div>
    </div>
  );
}

/** Each stage as a share of the one before it; one hue, values in ink. */
function Funnel({ funnel }: { funnel: TestDesignMetrics['funnel'] }) {
  const stages = [
    { key: 'designed', label: 'Diseñados', value: funnel.designed, base: null as number | null },
    { key: 'published', label: 'Llevados a TestRail', value: funnel.published, base: funnel.designed },
    { key: 'executed', label: 'Ejecutados', value: funnel.executed, base: funnel.published },
    { key: 'passed', label: 'Aprobados', value: funnel.passed, base: funnel.executed },
  ];
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="space-y-3">
      {stages.map((s) => (
        <div key={s.key} title={`${s.label}: ${fmt(s.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
            <span className="truncate text-[#1a1f2e]">{s.label}</span>
            <span className="shrink-0">
              <strong className="text-[12px] text-[#1a1f2e]">{fmt(s.value)}</strong>
              {s.base !== null && <span className="ml-1.5 text-[10px] text-[#8B999D]">{pct(s.value, s.base)}%</span>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#F4F1EA]">
            <div className="h-full rounded-full" style={{ width: `${(s.value / max) * 100}%`, background: SERIES }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultBadge({ result }: { result: 'passed' | 'failed' }) {
  const passed = result === 'passed';
  const Icon = passed ? CheckCircle2 : XCircle;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#F4F1EA] px-2 py-0.5 text-[10px] font-medium text-[#58646D]">
      <Icon size={11} style={{ color: passed ? PASSED : FAILED }} />
      {passed ? 'Aprobado' : 'Fallido'}
    </span>
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

interface TestDesignSectionProps {
  /** Limits the section to one project (the project's own dashboard). */
  projectSlug?: string;
  /** Changes whenever the Panorama refreshes, so the section refreshes with it. */
  refreshKey?: string;
}

export function TestDesignSection({ projectSlug, refreshKey }: TestDesignSectionProps) {
  const [metrics, setMetrics] = useState<TestDesignMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    testDesignApi
      .metrics({ days: DAYS, projectSlug })
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
        <Header days={DAYS} />
        <p className="mt-4 text-[11px] text-[#8B6A20]">No se pudieron cargar las métricas de diseño de pruebas: {error}</p>
      </BentoCard>
    );
  }

  if (!metrics) {
    return (
      <BentoCard>
        <Header days={DAYS} />
        <div className="mt-6 flex items-center gap-2 text-[11px] text-[#8B999D]">
          <Loader2 size={13} className="animate-spin" /> Cargando…
        </div>
      </BentoCard>
    );
  }

  const { funnel } = metrics;

  if (funnel.designed === 0 && funnel.published === 0) {
    return (
      <BentoCard>
        <Header days={metrics.period.days} />
        <div className="mt-5 rounded-xl border border-dashed border-[#D9DEDF] p-8 text-center text-[11px] text-[#8B999D]">
          Todavía no hay casos de diseño. Créalos desde <strong className="text-[#58646D]">Diseño de pruebas</strong>, publícalos en
          TestRail y ejecútalos para ver aquí sus resultados.
        </div>
      </BentoCard>
    );
  }

  const rate = metrics.passRate === null ? null : Math.round(metrics.passRate * 100);

  return (
    <section className="space-y-4" aria-label="Diseño de pruebas">
      <div className="grid grid-cols-12 gap-4">
        {/* Hero: approved design cases, pass rate and weekly executions. */}
        <BentoCard className="col-span-12 border-0 bg-gradient-to-br from-[#0a2547] via-[#104B99] to-[#0a2547] text-white lg:col-span-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/60">
            Diseño de pruebas · últimos {metrics.period.days} días
          </div>
          <div className="mt-2 text-[13px] text-white/80">Casos de diseño aprobados al ejecutarse</div>
          <div className="mt-1 flex items-end gap-3">
            <div className="text-[44px] font-semibold leading-none tracking-tight">{fmt(funnel.passed)}</div>
            <div className="pb-1.5 text-[11px] text-white/80">
              {funnel.executed > 0 ? `de ${fmt(funnel.executed)} ejecutados · ${rate}% de aprobación` : 'Ningún caso de diseño ejecutado en el periodo'}
            </div>
          </div>
          <div className="mt-2 text-[11px] text-white/70">
            {fmt(funnel.failed)} fallidos · {fmt(funnel.notExecuted)} sin ejecutar · {fmt(metrics.executions)}{' '}
            {metrics.executions === 1 ? 'ejecución' : 'ejecuciones'}
          </div>
          <div className="mt-6"><WeeklyBars weeks={metrics.weekly} /></div>
        </BentoCard>

        {/* Funnel from design to an approved execution. */}
        <BentoCard className="col-span-12 sm:col-span-7 lg:col-span-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Del diseño a la ejecución</div>
          <h3 className="mb-4 text-[15px] font-medium text-[#1a1f2e]">
            {funnel.published > 0 ? `${pct(funnel.executed, funnel.published)}% de los casos en TestRail se ejecutó` : 'Ningún caso llevado a TestRail'}
          </h3>
          <Funnel funnel={funnel} />
          <p className="mt-4 border-t border-[#F0F1EF] pt-3 text-[10px] leading-relaxed text-[#687680]">
            Cuenta las ejecuciones de esos mismos casos de TestRail. Lanzar desde la HU en Jira crea casos nuevos, que no se cuentan aquí.
          </p>
        </BentoCard>

        {/* Totals, or per project on the general Panorama. */}
        <BentoCard className="col-span-12 sm:col-span-5 lg:col-span-3">
          {projectSlug || metrics.byProject.length <= 1 ? (
            <>
              <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Resumen</div>
              <div className="grid grid-cols-2 gap-4">
                <Tiny label="En TestRail" value={funnel.published} />
                <Tiny label="Ejecutados" value={funnel.executed} />
                <Tiny label="Aprobados" value={funnel.passed} />
                <Tiny label="Fallidos" value={funnel.failed} />
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Por proyecto</div>
              <div className="divide-y divide-[#F0F1EF]">
                {metrics.byProject.map((p) => (
                  <div key={p.projectSlug || 'none'} className="py-2 text-[11px]">
                    <div className="truncate font-medium text-[#1a1f2e]">{p.projectName}</div>
                    <div className="mt-0.5 text-[10px] text-[#687680]">
                      <strong className="text-[#1a1f2e]">{fmt(p.passed)}</strong> aprobados · {fmt(p.failed)} fallidos · {fmt(p.executed)} de{' '}
                      {fmt(p.published)} ejecutados
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </BentoCard>
      </div>

      <BentoCard>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Actividad reciente</div>
        <h3 className="mb-3 text-[15px] font-medium text-[#1a1f2e]">Últimas ejecuciones de casos de diseño</h3>
        {metrics.recent.length ? (
          <div className="divide-y divide-[#F0F1EF]">
            {metrics.recent.map((r) => (
              <div key={`${r.caseId}-${r.launchId}`} className="flex items-center gap-3 py-2.5">
                {r.caseUrl ? (
                  <a
                    href={r.caseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-[64px] shrink-0 items-center gap-1 font-mono text-[11px] font-semibold text-[#104B99] hover:underline"
                  >
                    C{r.caseId} <ExternalLink size={10} />
                  </a>
                ) : (
                  <span className="w-[64px] shrink-0 font-mono text-[11px] font-semibold text-[#104B99]">C{r.caseId}</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-[#1a1f2e]" title={r.title}>{r.title}</div>
                  <div className="truncate text-[10px] text-[#8B999D]">
                    {[r.issueKey, !projectSlug ? r.projectName : null, formatDateTime(r.executedAt)].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <ResultBadge result={r.result} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[#8B999D]">
            Ningún caso de diseño se ejecutó en el periodo. Ejecútalos seleccionando sus casos de TestRail en Lanzar pruebas.
          </p>
        )}
      </BentoCard>
    </section>
  );
}
