import type { FilterOption, SortOption } from "@/client/src/components/common/index.ts";
import { BONDED_KINDS } from "@/shared/dnd3.5/bondedKinds.ts";

export type EntityKind = "pc" | (typeof BONDED_KINDS)[number]["slug"];
export type EntitySortField = "name" | "createdAt" | "updatedAt";

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
