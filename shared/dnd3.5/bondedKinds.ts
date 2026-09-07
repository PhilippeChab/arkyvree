export const BONDED_KINDS = [
  { slug: "familiar", label: "Familiar", className: "Familiar" },
  { slug: "animalcompanion", label: "Animal Companion", className: "Animal Companion" },
  { slug: "mount", label: "Special Mount", className: "Special Mount" },
] as const;

export type BondedKind = (typeof BONDED_KINDS)[number]["slug"];

export const BONDED_KIND_SLUGS = BONDED_KINDS.map((b) => b.slug) as readonly BondedKind[];

export const BONDED_LABEL_BY_KIND: Record<BondedKind, string> = Object.fromEntries(
  BONDED_KINDS.map((b) => [b.slug, b.label]),
) as Record<BondedKind, string>;

// Seed class names. Kept separate from labels so that re-labeling the UI
// (e.g. localization, renaming "Special Mount" → "Mount" in display) doesn't
// silently break the reconciler's content-seed lookup.
export const BONDED_CLASS_NAME_BY_KIND: Record<BondedKind, string> = Object.fromEntries(
  BONDED_KINDS.map((b) => [b.slug, b.className]),
) as Record<BondedKind, string>;
