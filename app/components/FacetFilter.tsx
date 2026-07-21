'use client'

// Multi-select facet filter — click multiple values, they AND together with
// whatever else is filtering the list. Used for tag-style facets (creator
// type, country) where more than one value can be true at once, unlike a
// status field which is a single state machine. Shared between Creators
// today and intended for Research board keyword/platform filters later.

export type FacetOption = { key: string; label: string; count?: number }

export function FacetFilter({
  title, options, selected, onChange,
}: {
  title: string
  options: FacetOption[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  if (options.length === 0) return null

  function toggle(key: string) {
    onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key])
  }

  return (
    <div>
      <div className="flex items-center justify-between px-3 mb-1.5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93]">{title}</p>
        {selected.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="font-mono text-[10px] text-[#8e8e93] hover:text-[#1c1c1e] transition-colors"
          >
            clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 px-3">
        {options.map(o => {
          const active = selected.includes(o.key)
          return (
            <button
              key={o.key}
              onClick={() => toggle(o.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all active:scale-[0.97] ${
                active
                  ? 'bg-[#EF22DA] text-black border-[#EF22DA]'
                  : 'bg-white text-[#6c6c70] border-black/[0.07] hover:border-black/[0.14]'
              }`}
            >
              {o.label}
              {o.count !== undefined && (
                <span className={active ? 'text-black/50' : 'text-[#8e8e93]'}>{o.count}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
