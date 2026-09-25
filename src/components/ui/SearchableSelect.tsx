import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { cn } from '../../constants/theme';

/**
 * The real TestRail selector — extracted.
 *
 * This is the same popup pattern TestLaunch's "¿De dónde vienen los casos?" step already
 * uses for its project/section pickers (search box, "N de N" counter, scrollable portal
 * list, green selected state, badges): a trigger button, a portal-rendered panel positioned
 * against it, a search filter, and a self-contained outside-click listener. It was inline
 * and duplicated across more than one place in TestLaunch; this is the one implementation,
 * generic over whatever list of items it is given — never a second "similar-looking" select
 * built by hand.
 */

export interface SearchableSelectProps<T> {
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  /** Plural noun for the "N de N …" counter, e.g. "proyectos", "secciones". */
  itemsNounPlural: string;
  items: T[];
  selectedId: string | undefined;
  onSelect: (item: T) => void;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  /** e.g. "42 TCs" — rendered as a small pill on the right of each row when present. */
  getBadge?: (item: T) => string | undefined;
  /** e.g. "niv. 2" — rendered next to the badge, for hierarchy depth. */
  getSecondaryText?: (item: T) => string | undefined;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  emptyText?: string;
  errorText?: string;
}

export function SearchableSelect<T>({
  label,
  placeholder,
  searchPlaceholder,
  itemsNounPlural,
  items,
  selectedId,
  onSelect,
  getId,
  getLabel,
  getBadge,
  getSecondaryText,
  disabled,
  loading,
  loadingText = 'Cargando…',
  emptyText,
  errorText,
}: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const current = items.find((item) => getId(item) === selectedId);

  const filtered = useMemo(() => {
    if (!search) return items;
    const s = search.toLowerCase();
    return items.filter((item) => getLabel(item).toLowerCase().includes(s));
  }, [items, search, getLabel]);

  const openDropdown = () => {
    if (loading || disabled) return;
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left, width: r.width });
    }
    setOpen((o) => !o);
  };

  const isEmptyList = items.length === 0 && !loading;

  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-[#8B999D] font-semibold mb-1.5 block">{label}</label>
      {isEmptyList && emptyText ? (
        <div className="text-[11px] text-[#8B999D] bg-white rounded-xl px-3 py-2.5 border border-[#E8EBEC]">{emptyText}</div>
      ) : (
        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={openDropdown}
            disabled={disabled || loading}
            className={cn(
              'w-full flex items-center justify-between bg-white border rounded-xl px-3 py-2.5 text-left transition-all',
              open ? 'border-[#48A157] ring-4 ring-[#48A157]/10' : 'border-[#E8EBEC] hover:border-[#BABEC3]',
              (disabled || loading) && 'opacity-60 cursor-wait',
            )}
          >
            <span className={cn('text-[13px] truncate', current ? 'font-medium text-[#1a1f2e]' : 'text-[#8B999D]')}>
              {loading ? loadingText : (current ? getLabel(current) : placeholder)}
            </span>
            <div className="flex-shrink-0 ml-2">
              {loading ? <Loader2 size={14} className="text-[#48A157] animate-spin" /> : <ChevronDown size={14} className={cn('text-[#8B999D] transition-transform duration-200', open && 'rotate-180')} />}
            </div>
          </button>
          {open && pos && createPortal(
            <div
              ref={panelRef}
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
              className="bg-white border border-[#E8EBEC] rounded-2xl shadow-[0_12px_40px_-8px_rgba(72,161,87,0.22)] z-[9999] overflow-hidden"
            >
              <div className="p-2 border-b border-[#F4F1EA]">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8B999D]" />
                  <input
                    autoFocus
                    placeholder={searchPlaceholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-[#FAFAF7] rounded-lg pl-8 pr-8 py-2 text-[12px] outline-none placeholder:text-[#BABEC3]"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8B999D] hover:text-[#1a1f2e]">
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="text-[10px] text-[#8B999D] mt-1.5 px-0.5">
                  {filtered.length} de {items.length} {itemsNounPlural}
                </div>
              </div>
              <div className="max-h-[220px] overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[12px] text-[#8B999D]">Sin resultados para "{search}"</div>
                ) : (
                  filtered.map((item) => {
                    const id = getId(item);
                    const isSel = id === selectedId;
                    const badge = getBadge?.(item);
                    const secondary = getSecondaryText?.(item);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          onSelect(item);
                          setOpen(false);
                          setSearch('');
                        }}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-[#F4F1EA] last:border-b-0',
                          isSel ? 'bg-[#48A157]/5' : 'hover:bg-[#FAFAF7]',
                        )}
                      >
                        <div className={cn('w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 border-2', isSel ? 'border-[#48A157] bg-[#48A157]' : 'border-[#E8EBEC]')}>
                          {isSel && <Check size={9} className="text-white" strokeWidth={3} />}
                        </div>
                        <span className={cn('text-[12px] truncate flex-1', isSel ? 'font-semibold text-[#48A157]' : 'font-medium text-[#1a1f2e]')}>{getLabel(item)}</span>
                        {secondary && <span className="text-[10px] text-[#8B999D] font-mono bg-[#F4F1EA] px-1.5 py-0.5 rounded flex-shrink-0 ml-auto">{secondary}</span>}
                        {badge && <span className="text-[10px] font-mono text-[#8B999D] bg-[#F4F1EA] px-1.5 py-0.5 rounded flex-shrink-0 ml-2">{badge}</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body,
          )}
        </div>
      )}
      {errorText && (
        <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-[#E63946]">
          <AlertCircle size={12} /> {errorText}
        </div>
      )}
    </div>
  );
}
