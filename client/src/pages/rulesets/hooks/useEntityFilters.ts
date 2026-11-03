import { CREATED_SORTS, NAME_SORTS, type SortOption, UPDATED_SORTS } from "@/client/src/components/common/index.ts";
import { useListParams, useRules } from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import type { Direction } from "@/client/src/lib/queries.ts";
import type { BaseRules } from "@/shared/enums.ts";

/** What a race or a class is for: one of the kinds its rules list (`entityKinds`), the first a player character's. */
export type EntityKind = string;
export type EntitySortField = (typeof ENTITY_SORT_FIELDS)[number];

const ENTITY_SORT_FIELDS = ["name", "createdAt", "updatedAt"] as const;

const ENTITY_SORT_OPTIONS: SortOption<EntitySortField>[] = [...NAME_SORTS, ...CREATED_SORTS, ...UPDATED_SORTS];

/** The sort the Races and Classes tabs open with: by name. Their kind is their rules' first (`entityKinds`). */
export const DEFAULT_ENTITY_SORT = {
  orderBy: "name",
  orderDir: "asc",
} as const satisfies { orderBy: EntitySortField; orderDir: Direction };

/**
 * An entity kind's tab's search, and a partitioned kind's (the races', the classes') kind and sort, kept in the URL,
 * with the search bar props that change them: the kinds its ruleset's rules list (`entityKinds`), the tab opening on
 * the first, a player character's. While they load, the kind the URL names stands, so the tab's first fetch is for it.
 */
export function useEntityFilters(baseRules: BaseRules) {
  const { searchParams, updateSearchParams, search, orderBy, orderDir, searchBarProps } = useListParams(
    ENTITY_SORT_FIELDS,
    DEFAULT_ENTITY_SORT,
  );
  const kinds = useRules(baseRules).rules?.entityKinds;
  const values = kinds?.map((option) => option.value) ?? [];
  const opening = values.at(0);
  const asked = searchParams.get("kind") ?? undefined;
  const kind = opening === undefined ? asked : oneOf(asked, values, opening);

  return {
    search,
    kind,
    orderBy,
    orderDir,
    searchBarProps: {
      ...searchBarProps,
      filterOptions: kinds ?? [],
      filterValue: kind,
      onFilterChange: (next: EntityKind | undefined) => updateSearchParams({ kind: next === opening ? null : next }),
      sortOptions: ENTITY_SORT_OPTIONS,
    },
  };
}
