import { Database, Loader2 } from 'lucide-react';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import type { useTestRailDestination } from './useTestRailDestination';

/**
 * Where the cases will be filed.
 *
 * Extracted so it can be reused by any screen that needs to pick a TestRail
 * project/section, instead of living only inside the Recording page. The state and
 * data fetching stay in `useTestRailDestination` — this component only renders it.
 *
 * Proyecto and Sección use the real TestRail selector (`SearchableSelect`) — the same
 * search/counter/scroll/badge popup already used in TestLaunch's "¿De dónde vienen los
 * casos?" step, not a native `<select>` or a hand-built lookalike. Suite and Suite ID remain
 * internal TestRail routing details; choosing a section also resolves the suite that owns it.
 */
export function TestRailDestinationPicker({ testRail }: { testRail: ReturnType<typeof useTestRailDestination> }) {
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

      <SearchableSelect
        label="Sección"
        placeholder="Selecciona una sección…"
        searchPlaceholder="Buscar sección..."
        itemsNounPlural="secciones"
        items={testRail.sections}
        selectedId={testRail.sectionId || undefined}
        onSelect={(s) => testRail.chooseSection(String(s.id))}
        getId={(s) => String(s.id)}
        getLabel={(s) => s.name}
        getSecondaryText={(s) => testRail.suites.length > 1
          ? s.suiteName
          : (s.depth > 0 ? `niv. ${s.depth}` : undefined)}
        disabled={!testRail.projectId}
        loading={testRail.loading && Boolean(testRail.projectId)}
        emptyText={testRail.projectId ? 'Este proyecto no tiene secciones disponibles' : 'Selecciona un proyecto primero'}
      />

      {!testRail.sectionId && (
        <p className="text-[11px] text-[#8B999D]">
          Sin selección se usa la sección configurada en el proyecto.
        </p>
      )}
    </div>
  );
}
