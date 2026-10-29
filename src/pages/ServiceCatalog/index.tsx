import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, RefreshCw, Settings2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { listProjects, type ProjectListItem } from '../Configuracion';
import { serviceCatalogApi, type CatalogService } from '../../services/service-catalog';
import { ServiceConfigDrawer } from './ServiceConfigDrawer';

const CATEGORY_LABEL: Record<CatalogService['category'], string> = {
  otp: 'OTP',
  token: 'Token',
  codigo: 'Código',
};

/**
 * Catálogo de servicios: reusable services (OTP first) a scenario can use to fill a
 * field it cannot know in advance. Each project enables a service and sets its own
 * values here; recordings and test designs then choose which field it fills.
 */
export function ServiceCatalog() {
  const { can } = useAuth();
  const [services, setServices] = useState<CatalogService[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [configuring, setConfiguring] = useState<CatalogService | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [catalog, projectList] = await Promise.all([serviceCatalogApi.list(), listProjects().catch(() => [])]);
      setServices(catalog);
      setProjects(projectList.filter(project => project.enabled));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el catálogo de servicios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const projectName = (slug: string) => projects.find(project => project.slug === slug)?.name ?? slug;

  return (
    <div className="p-8 max-w-[1200px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-[12px] leading-relaxed text-[#58646D]">
          Servicios reutilizables que llenan un campo del escenario en el momento de la ejecución, como el código OTP.
          Actívalos por proyecto aquí; luego, en la grabación o el diseño de pruebas, elige qué campo llena cada uno.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#E8EBEC] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#58646D] hover:border-[#1a1f2e]/40"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} /> Actualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-[#E63946]/20 bg-[#E63946]/5 px-4 py-3 text-[12px] text-[#E63946]">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading && services.length === 0 ? (
        <div className="flex items-center gap-2 text-[12px] text-[#8B999D]"><Loader2 size={14} className="animate-spin" /> Cargando servicios…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.map(service => (
            <article key={service.key} className="flex flex-col rounded-2xl border border-[#E8EBEC] bg-white p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#104B99]/8 text-[#104B99]">
                  <KeyRound size={18} />
                </div>
                <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-[#F4F1EA] text-[#58646D]">
                  {CATEGORY_LABEL[service.category]}
                </span>
              </div>

              <h2 className="text-[16px] font-semibold text-[#1a1f2e]">{service.name}</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-[#58646D]">{service.description}</p>

              <dl className="mt-4 space-y-2 text-[11px]">
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold">Origen</dt>
                  <dd className="font-mono text-[11px] text-[#1a1f2e] break-words">{service.source}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold">Entrega</dt>
                  <dd className="text-[#1a1f2e]">
                    Código{service.output.length ? ` de ${service.output.length} dígitos` : ''}
                    {service.output.segmented ? ' · se escribe dígito por dígito' : ''}
                  </dd>
                </div>
              </dl>

              <div className="mt-4">
                {service.availability.available ? (
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-[#48A157]/10 px-2.5 py-1 text-[11px] font-semibold text-[#48A157]">
                    <CheckCircle2 size={12} /> Disponible ({service.availability.environment})
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#E9A23B]/30 bg-[#E9A23B]/8 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#B7791F]">
                      <AlertTriangle size={12} /> No disponible en este servidor
                    </div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-[#58646D]">
                      {service.availability.reasons.map(reason => <li key={reason}>{reason}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold">Usado en</div>
                {service.projects.length === 0 ? (
                  <div className="text-[11px] text-[#8B999D]">Ningún proyecto lo tiene activo todavía.</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {service.projects.map(project => (
                      <span
                        key={project.slug}
                        title={project.legacy ? 'Configurado en la tabla anterior de OTP; al guardarlo aquí pasa al catálogo.' : undefined}
                        className={
                          'rounded-full px-2 py-0.5 text-[11px] ' +
                          (project.enabled ? 'bg-[#104B99]/8 text-[#104B99]' : 'bg-[#F4F1EA] text-[#8B999D] line-through')
                        }
                      >
                        {projectName(project.slug)}{project.legacy ? ' *' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {can('services.edit') && (
                <div className="mt-5 flex justify-end border-t border-[#E8EBEC] pt-4">
                  <button
                    type="button"
                    onClick={() => setConfiguring(service)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#1a1f2e] px-4 py-2 text-[11px] font-semibold text-white hover:bg-black"
                  >
                    <Settings2 size={12} /> Configurar y probar
                  </button>
                </div>
              )}
            </article>
          ))}
          {!loading && services.length === 0 && !error && (
            <div className="text-[12px] text-[#8B999D]">El catálogo no tiene servicios.</div>
          )}
        </div>
      )}

      {configuring && (
        <ServiceConfigDrawer
          service={configuring}
          projects={projects}
          onClose={() => setConfiguring(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
