import { CheckCircle2, Database, Loader2 } from 'lucide-react';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import type { useTestRailDestination } from './useTestRailDestination';

/**
 * Where the cases will be filed.
 *
 * Extracted so it can be reused by any screen that needs to pick a TestRail
 * project/suite/section, instead of living only inside the Recording page. The state and
 * data fetching stay in `useTestRailDestination` — this component only renders it.
 *
 * Proyecto and Sección use the real TestRail selector (`SearchableSelect`) — the same
 * search/counter/scroll/badge popup already used in TestLaunch's "¿De dónde vienen los
 * casos?" step, not a native `<select>` or a hand-built lookalike. Suite drops to a plain
 * read-only line when the project resolves to exactly one suite (the common case — the hook
 * auto-selects it), since there is nothing to search or choose there; a project with more
 * than one suite gets the same searchable selector as the other two fields.
 */
export function TestRailDestinationPicker({ testRail }: { testRail: ReturnType<typeof useTestRailDestination> }) {
  const currentSuite = testRail.suites.find((s) => String(s.id) === testRail.suiteId);

  return (
    <div className="bg-[#FAFAF7] rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-[#48A157] flex items-center justify-center">
          <Database size={15} className="text-white" />
        </div>
        <div className="text-[14px] font-semibold text-[#1a1f2e]">TestRail</div>
        {testRail.loading && <Loader2 size={13} className="animate-spin text-[#48A157] ml-auto" />}
      </div>

      <SearchableSelect
        label="Proyecto"
        placeholder="Selecciona un proyecto…"
        searchPlaceholder="Buscar proyecto..."
        itemsNounPlural="proyectos"
        items={testRail.projects}
        selectedId={testRail.projectId || undefined}
        onSelect={(p) => testRail.chooseProject(String(p.id))}
        getId={(p) => String(p.id)}
        getLabel={(p) => p.name}
        getBadge={(p) => (typeof p.totalCaseCount === 'number' ? `${p.totalCaseCount} TCs` : undefined)}
        errorText={testRail.error ?? undefined}
      />

      <div>
        <label className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold mb-1.5 block">Suite</label>
        {!testRail.projectId ? (
          <div className="text-[11px] text-[#8B999D] bg-white rounded-xl px-3 py-2.5 border border-[#E8EBEC]">Selecciona un proyecto primero</div>
        ) : testRail.suites.length <= 1 ? (
          <div className="flex items-center gap-2 text-[13px] bg-white rounded-xl px-3 py-2.5 border border-[#E8EBEC]">
            {currentSuite ? (
              <>
                <CheckCircle2 size={13} className="text-[#48A157] flex-shrink-0" />
                <span className="font-medium text-[#1a1f2e] truncate">{currentSuite.name}</span>
              </>
            ) : (
              <span className="text-[#8B999D]">{testRail.loading ? 'Cargando…' : 'Sin suites disponibles'}</span>
            )}
          </div>
        ) : (
          <SearchableSelect
            label="Suite"
            placeholder="Selecciona una suite…"
            searchPlaceholder="Buscar suite..."
            itemsNounPlural="suites"
            items={testRail.suites}
            selectedId={testRail.suiteId || undefined}
            onSelect={(s) => testRail.chooseSuite(String(s.id))}
            getId={(s) => String(s.id)}
            getLabel={(s) => s.name}
          />
        )}
      </div>

      {testRail.suiteId && (
        <div className="bg-white rounded-xl p-4 border border-[#E8EBEC]">
          <div className="text-[10px] uppercase tracking-wider text-[#8B999D]">Suite ID</div>
          <div
            className="text-[24px] font-medium text-[#1a1f2e] mt-0.5"
            style={{ fontFamily: 'Geist, system-ui, sans-serif', letterSpacing: '-0.03em' }}
          >
            {testRail.suiteId}
          </div>
        </div>
      )}

      <SearchableSelect
        label="Sección"
        placeholder="Selecciona una sección…"
        searchPlaceholder="Buscar sección..."
        itemsNounPlural="secciones"
        items={testRail.sections}
        selectedId={testRail.sectionId || undefined}
        onSelect={(s) => testRail.setSectionId(String(s.id))}
        getId={(s) => String(s.id)}
        getLabel={(s) => s.name}
        getSecondaryText={(s) => (s.depth > 0 ? `niv. ${s.depth}` : undefined)}
        disabled={!testRail.suiteId}
        emptyText={testRail.suiteId ? 'Este proyecto no tiene secciones disponibles' : undefined}
      />

      {!testRail.sectionId && (
        <p className="text-[11px] text-[#8B999D]">
          Sin selección se usa la sección configurada en el proyecto.
        </p>
      )}
    </div>
  );
}
