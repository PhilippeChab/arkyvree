import {
  CREATED_SORTS,
  type FilterOption,
  NAME_SORTS,
  type SortOption,
  UPDATED_SORTS,
} from "@/client/src/components/common/index.ts";
import { useListParams } from "@/client/src/hooks/index.ts";
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

const KIND_FILTER_OPTIONS: FilterOption<EntityKind>[] = [
  { value: "pc", label: "Player Character" },
  ...BONDED_KINDS.map((b) => ({ value: b.slug, label: b.label })),
];

const ENTITY_SORT_OPTIONS: SortOption<EntitySortField>[] = [...NAME_SORTS, ...CREATED_SORTS, ...UPDATED_SORTS];

/** The Races / Classes tab's search, kind and sort, kept in the URL, with the search bar props that change them. */
export function useEntityFilters() {
  const { searchParams, updateSearchParams, search, orderBy, orderDir, searchBarProps } = useListParams(
    ENTITY_SORT_FIELDS,
    DEFAULT_ENTITY_FILTERS,
  );
  const kind = oneOf(searchParams.get("kind"), ENTITY_KINDS, DEFAULT_ENTITY_FILTERS.kind);

  return {
    search,
    kind,
    orderBy,
    orderDir,
    searchBarProps: {
      ...searchBarProps,
      filterOptions: KIND_FILTER_OPTIONS,
      filterValue: kind,
      onFilterChange: (next: EntityKind | undefined) =>
        updateSearchParams({ kind: next === DEFAULT_ENTITY_FILTERS.kind ? null : next }),
      sortOptions: ENTITY_SORT_OPTIONS,
    },
  };
}
