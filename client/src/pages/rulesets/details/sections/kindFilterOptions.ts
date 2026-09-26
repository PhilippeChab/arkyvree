import type { FilterOption, SortOption } from "@/client/src/components/common/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { BONDED_KINDS } from "@/shared/dnd3.5/bondedKinds.ts";

export type EntityKind = "pc" | (typeof BONDED_KINDS)[number]["slug"];
const ENTITY_KINDS: readonly EntityKind[] = ["pc", ...BONDED_KINDS.map((b) => b.slug)];

const ENTITY_SORT_FIELDS = ["name", "createdAt", "updatedAt"] as const;
export type EntitySortField = (typeof ENTITY_SORT_FIELDS)[number];

/** Kind and sort the Races and Classes tabs open with. */
export const DEFAULT_ENTITY_FILTERS = {
  kind: "pc",
  orderBy: "name",
  orderDir: "asc",
} as const satisfies { kind: EntityKind; orderBy: EntitySortField; orderDir: "asc" | "desc" };

export const KIND_FILTER_OPTIONS: FilterOption<EntityKind>[] = [
  { value: "pc", label: "Player Character" },
  ...BONDED_KINDS.map((b) => ({ value: b.slug as EntityKind, label: b.label })),
];

export const ENTITY_SORT_OPTIONS: SortOption<EntitySortField>[] = [
  { field: "name", direction: "asc", label: "Name A→Z" },
  { field: "name", direction: "desc", label: "Name Z→A" },
  { field: "createdAt", direction: "desc", label: "Newest First" },
  { field: "createdAt", direction: "asc", label: "Oldest First" },
  { field: "updatedAt", direction: "desc", label: "Recently Updated" },
];

/** The Races / Classes tab filters from their URL params; unknown values fall back to the defaults. */
export function parseEntityFilters(kind: string | null, orderBy: string | null, orderDir: string | null) {
  return {
    kind: oneOf(kind, ENTITY_KINDS, DEFAULT_ENTITY_FILTERS.kind),
    orderBy: oneOf(orderBy, ENTITY_SORT_FIELDS, DEFAULT_ENTITY_FILTERS.orderBy),
    orderDir: oneOf(orderDir, ["asc", "desc"], DEFAULT_ENTITY_FILTERS.orderDir),
  };
}
