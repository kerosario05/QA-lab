import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ClipboardList, ExternalLink, Loader2, Minus } from 'lucide-react';
import { cn } from '../../constants/theme';
import { BentoCard } from '../../components/ui/BentoCard';
import { testDesignApi, type TestDesignMetrics } from '../../services/test-design';

/**
 * "Diseño de pruebas" on the Panorama: what reached TestRail and what the AI
 * contributed. Data comes from /api/test-design/metrics, already narrowed to the
 * user's projects (or to `projectSlug` in a project's own dashboard).
 *
 * Colors follow the dataviz palette (validated: lightness, chroma and CVD pass):
 * one hue for single-series bars, three categorical hues for AI contribution in a
 * fixed order. Text always stays in ink tokens; color only marks identity.
 */

const SERIES = '#2a78d6';
const ORIGIN = [
  { key: 'unchanged', label: 'IA sin cambios', color: '#2a78d6' },
  { key: 'edited', label: 'IA ajustada', color: '#eb6834' },
  { key: 'manual', label: 'Escritos a mano', color: '#1baf7a' },
] as const;

const TYPE_LABELS: Record<string, string> = {
  functional: 'Funcional',
  negative: 'Negativo',
  edge: 'Borde',
  regression: 'Regresión',
  other: 'Otro',
};

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
        <h3 className="text-[20px] font-medium leading-tight text-[#1a1f2e]">Escenarios llevados a TestRail</h3>
      </div>
    </div>
  );
}

function Trend({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    return <span className="text-[10px] text-white/60">{current > 0 ? 'Sin datos del periodo anterior' : 'Sin actividad'}</span>;
  }
  const change = Math.round(((current - previous) / previous) * 100);
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-white/85">
      <Icon size={13} /> {change > 0 ? '+' : ''}
      {change}% vs. periodo anterior ({fmt(previous)})
    </span>
  );
}

/** Weekly new cases: one series, thin bars with rounded tops, hover tooltip. */
function WeeklyBars({ weeks }: { weeks: TestDesignMetrics['testRail']['weekly'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.casesNew));
  return (
    <div className="relative" role="img" aria-label={`Casos nuevos por semana: ${weeks.map((w) => `${shortDate(w.weekStart)} ${w.casesNew}`).join(', ')}`}>
      <div className="flex h-[72px] items-end gap-1.5">
        {weeks.map((w, i) => (
          <div
            key={w.weekStart}
            className="flex h-full flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div
              className={cn('w-full rounded-t-[4px] transition-opacity', hover !== null && hover !== i && 'opacity-50')}
              style={{ height: `${Math.max(w.casesNew > 0 ? 6 : 2, (w.casesNew / max) * 100)}%`, background: w.casesNew > 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {weeks.map((w) => (
          <div key={w.weekStart} className="flex-1 text-center text-[9px] text-white/55">{shortDate(w.weekStart)}</div>
        ))}
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -top-9 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-white px-2.5 py-1.5 text-[10px] text-[#1a1f2e] shadow-lg"
          style={{ left: `${((hover + 0.5) / weeks.length) * 100}%` }}
        >
          Semana del {shortDate(weeks[hover].weekStart)}: <strong>{fmt(weeks[hover].casesNew)}</strong> nuevos ·{' '}
          {fmt(weeks[hover].casesUpdated)} actualizados
        </div>
      )}
    </div>
  );
}

/** AI contribution: one stacked bar (2px gaps between segments) + a legend with counts. */
function Contribution({ ai, total }: { ai: TestDesignMetrics['ai']; total: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const published = ai.unchanged + ai.edited;
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-[#F4F1EA]">
        {total > 0 &&
          ORIGIN.map((o) => {
            const value = ai[o.key];
            if (value === 0) return null;
            return (
              <div
                key={o.key}
                className={cn('h-full transition-opacity', hover && hover !== o.key && 'opacity-40')}
                style={{ width: `${(value / total) * 100}%`, background: o.color }}
                onMouseEnter={() => setHover(o.key)}
                onMouseLeave={() => setHover(null)}
                title={`${o.label}: ${fmt(value)} (${pct(value, total)}%)`}
              />
            );
          })}
      </div>
      <div className="mt-4 space-y-2.5">
        {ORIGIN.map((o) => (
          <div
            key={o.key}
            className={cn('flex items-center gap-2.5 text-[11px]', hover && hover !== o.key && 'opacity-50')}
            onMouseEnter={() => setHover(o.key)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: o.color }} />
            <span className="flex-1 text-[#58646D]">{o.label}</span>
            <strong className="text-[12px] text-[#1a1f2e]">{fmt(ai[o.key])}</strong>
            <span className="w-9 text-right text-[10px] text-[#8B999D]">{pct(ai[o.key], total)}%</span>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-[#F0F1EF] pt-3 text-[10px] leading-relaxed text-[#687680]">
        {ai.generated > 0 ? (
          <>
            La IA propuso <strong className="text-[#1a1f2e]">{fmt(ai.generated)}</strong> escenarios;{' '}
            <strong className="text-[#1a1f2e]">{fmt(published)}</strong> llegaron a TestRail
            {ai.discarded > 0 && (
              <>
                {' '}y <strong className="text-[#1a1f2e]">{fmt(ai.discarded)}</strong> se descartaron
              </>
            )}
            .
          </>
        ) : (
          'Sin generaciones con IA en el periodo.'
        )}
      </p>
    </div>
  );
}

/** Horizontal bars, one hue, value labels in ink. */
function BarList({ rows }: { rows: Array<{ key: string; label: string; value: number; detail?: string }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key} title={`${r.label}: ${fmt(r.value)}${r.detail ? ` · ${r.detail}` : ''}`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
            <span className="truncate text-[#1a1f2e]">{r.label}</span>
            <span className="shrink-0">
              <strong className="text-[12px] text-[#1a1f2e]">{fmt(r.value)}</strong>
              {r.detail && <span className="ml-1.5 text-[10px] text-[#8B999D]">{r.detail}</span>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#F4F1EA]">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: SERIES }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function OriginBadge({ origin, edited }: { origin: 'ai' | 'manual'; edited: boolean }) {
  const o = origin === 'manual' ? ORIGIN[2] : edited ? ORIGIN[1] : ORIGIN[0];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#F4F1EA] px-2 py-0.5 text-[9px] font-medium text-[#58646D]">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: o.color }} />
      {o.label}
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
      .metrics({ days: 30, projectSlug })
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
        <p className="mt-4 text-[11px] text-[#8B6A20]">No se pudieron cargar las métricas de diseño de pruebas: {error}</p>
      </BentoCard>
    );
  }

  if (!metrics) {
    return (
      <BentoCard>
        <Header days={30} />
        <div className="mt-6 flex items-center gap-2 text-[11px] text-[#8B999D]">
          <Loader2 size={13} className="animate-spin" /> Cargando…
        </div>
      </BentoCard>
    );
  }

  const { testRail, ai, usage } = metrics;
  const total = testRail.casesNew;

  if (total === 0 && usage.drafts === 0 && ai.generated === 0) {
    return (
      <BentoCard>
        <Header days={metrics.period.days} />
        <div className="mt-5 rounded-xl border border-dashed border-[#D9DEDF] p-8 text-center text-[11px] text-[#8B999D]">
          Todavía no hay diseños de prueba en este periodo. Créalos desde <strong className="text-[#58646D]">Diseño de pruebas</strong> y
          publícalos en TestRail para verlos aquí.
        </div>
      </BentoCard>
    );
  }

  const typeRows = Object.entries(metrics.types)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({ key, label: TYPE_LABELS[key] ?? key, value, detail: `${pct(value, total)}%` }));

  return (
    <section className="space-y-4" aria-label="Diseño de pruebas">
      <div className="grid grid-cols-12 gap-4">
        {/* Hero: new cases in TestRail, trend and weekly bars. */}
        <BentoCard className="col-span-12 border-0 bg-gradient-to-br from-[#0a2547] via-[#104B99] to-[#0a2547] text-white lg:col-span-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/60">
            Diseño de pruebas · últimos {metrics.period.days} días
          </div>
          <div className="mt-2 text-[13px] text-white/80">Casos nuevos llevados a TestRail</div>
          <div className="mt-1 flex items-end gap-3">
            <div className="text-[44px] font-semibold leading-none tracking-tight">{fmt(total)}</div>
            <div className="pb-1.5"><Trend current={total} previous={testRail.previousCasesNew} /></div>
          </div>
          <div className="mt-2 text-[11px] text-white/70">
            {fmt(testRail.casesUpdated)} actualizados
            {testRail.casesFailed > 0 && ` · ${fmt(testRail.casesFailed)} no se pudieron subir`}
          </div>
          <div className="mt-6"><WeeklyBars weeks={testRail.weekly} /></div>
        </BentoCard>

        {/* AI contribution on new cases. */}
        <BentoCard className="col-span-12 sm:col-span-7 lg:col-span-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Aporte de la IA</div>
          <h3 className="mb-4 text-[15px] font-medium text-[#1a1f2e]">
            {total > 0 ? `${pct(ai.unchanged + ai.edited, total)}% de los casos nuevos vino de la IA` : 'Sin casos nuevos en el periodo'}
          </h3>
          <Contribution ai={ai} total={total} />
        </BentoCard>

        {/* Usage. */}
        <BentoCard className="col-span-12 sm:col-span-5 lg:col-span-3">
          <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Uso</div>
          <div className="grid grid-cols-2 gap-4">
            <Tiny label="Diseños" value={usage.drafts} />
            <Tiny label="Historias" value={usage.storiesCovered} />
            <Tiny label="Personas" value={usage.people} />
            <Tiny label={projectSlug ? 'Casos por historia' : 'Proyectos'} value={projectSlug ? (usage.storiesCovered ? Math.round(total / usage.storiesCovered) : 0) : usage.projects} />
          </div>
          {total > 0 && (
            <div className="mt-5 border-t border-[#F0F1EF] pt-3 text-[10px] text-[#687680]">
              Datos de prueba completos en <strong className="text-[#1a1f2e]">{pct(metrics.data.complete, total)}%</strong> de los casos
              {metrics.data.pending > 0 && ` · ${fmt(metrics.data.pending)} con datos pendientes`}
            </div>
          )}
        </BentoCard>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {!projectSlug && (
          <BentoCard className="col-span-12 lg:col-span-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Por proyecto</div>
            <h3 className="mb-4 text-[15px] font-medium text-[#1a1f2e]">Casos nuevos en TestRail</h3>
            {metrics.byProject.length ? (
              <BarList
                rows={metrics.byProject.map((p) => ({
                  key: p.projectSlug,
                  label: p.projectName,
                  value: p.casesNew,
                  detail: `${p.stories} ${p.stories === 1 ? 'historia' : 'historias'} · ${Math.round(p.aiShare * 100)}% IA`,
                }))}
              />
            ) : (
              <p className="text-[11px] text-[#8B999D]">Sin casos publicados.</p>
            )}
          </BentoCard>
        )}

        <BentoCard className={cn('col-span-12', projectSlug ? 'lg:col-span-4' : 'lg:col-span-3')}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Cobertura</div>
          <h3 className="mb-4 text-[15px] font-medium text-[#1a1f2e]">Tipos de caso</h3>
          {typeRows.length ? <BarList rows={typeRows} /> : <p className="text-[11px] text-[#8B999D]">Sin casos publicados.</p>}
          {metrics.byPerson.length > 0 && (
            <div className="mt-5 border-t border-[#F0F1EF] pt-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Quién más publica</div>
              {metrics.byPerson.slice(0, 3).map((p) => (
                <div key={p.name} className="flex items-center justify-between py-0.5 text-[11px]">
                  <span className="truncate text-[#58646D]">{p.name}</span>
                  <span className="text-[#1a1f2e]">
                    <strong>{fmt(p.casesNew)}</strong> <span className="text-[10px] text-[#8B999D]">casos</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </BentoCard>

        <BentoCard className={cn('col-span-12', projectSlug ? 'lg:col-span-8' : 'lg:col-span-5')}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B999D]">Actividad reciente</div>
          <h3 className="mb-3 text-[15px] font-medium text-[#1a1f2e]">Últimos casos publicados</h3>
          {metrics.recent.length ? (
            <div className="divide-y divide-[#F0F1EF]">
              {metrics.recent.map((r) => (
                <div key={`${r.caseId}-${r.publishedAt}`} className="flex items-center gap-3 py-2.5">
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
                      {[r.issueKey, !projectSlug ? r.projectName : null, shortDate(r.publishedAt)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <OriginBadge origin={r.origin} edited={r.edited} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-[#8B999D]">Sin casos publicados en el periodo.</p>
          )}
        </BentoCard>
      </div>
    </section>
  );
}
