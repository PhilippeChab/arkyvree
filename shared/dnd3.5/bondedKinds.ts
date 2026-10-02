/**
 * The creatures a character can be bonded to. `className` is the seeded class a bonded creature levels in, kept apart
 * from `label` so renaming one in the UI ("Special Mount" → "Mount") doesn't break the reconciler's class lookup.
 */
export const BONDED_KINDS = [
  { slug: "familiar", label: "Familiar", className: "Familiar" },
  { slug: "animalcompanion", label: "Animal Companion", className: "Animal Companion" },
  { slug: "mount", label: "Special Mount", className: "Special Mount" },
] as const;

export type BondedKind = (typeof BONDED_KINDS)[number]["slug"];

export const BONDED_KIND_SLUGS = BONDED_KINDS.map((kind) => kind.slug);

/** Each bonded kind's definition, by its slug (typed by hand: `Object.fromEntries` loses its keys' type). */
export const BONDED_KIND_BY_SLUG = Object.fromEntries(BONDED_KINDS.map((kind) => [kind.slug, kind])) as Record<
  BondedKind,
  (typeof BONDED_KINDS)[number]
>;
