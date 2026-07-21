// Closed vocabularies for creator tagging. Keeping these fixed (instead of
// letting the AI invent whatever it wants per creator) is what makes the
// Creators page filters usable — a growing pile of near-duplicate freeform
// tags ("comedy" / "comedic" / "funny content") isn't filterable, a fixed
// list is. AI filing (import route, Lightreel discovery routes) is
// constrained to pick from these; anything it returns that doesn't match
// gets dropped rather than silently becoming a new filter option.

export const CREATOR_TYPES = [
  'Home & Renovation',
  'Lifestyle',
  'Food & Travel',
  'Fashion & Beauty',
  'Fitness',
  'Comedy',
  'Parenting',
  'Business',
  'Gaming',
  'Tech',
  'Podcast',
  'Pets & Animals',
] as const

export const COUNTRIES = [
  'Australia',
  'United States',
  'United Kingdom',
  'Canada',
  'New Zealand',
  'Other',
] as const

export type CreatorType = (typeof CREATOR_TYPES)[number]
export type Country = (typeof COUNTRIES)[number]

// Case/whitespace-insensitive match against a closed list. Returns the
// canonical list value (correct casing) or null if nothing matches closely
// enough — callers should drop non-matches rather than pass through
// whatever the AI invented.
export function normalizeToList(value: string | null | undefined, list: readonly string[]): string | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  if (!v || v === 'unknown') return null
  const exact = list.find(l => l.toLowerCase() === v)
  if (exact) return exact
  // Loose contains-match both ways so "US" / "USA" / "the United States" all
  // land on "United States" instead of getting dropped.
  const partial = list.find(l => l.toLowerCase().includes(v) || v.includes(l.toLowerCase()))
  return partial ?? null
}

export function normalizeCategories(values: string[] | null | undefined): string[] {
  if (!values?.length) return []
  const out = new Set<string>()
  for (const v of values) {
    const match = normalizeToList(v, CREATOR_TYPES)
    if (match) out.add(match)
  }
  return [...out]
}
