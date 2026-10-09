import { CREATED_SORTS, NAME_SORTS, type SortOption, UPDATED_SORTS } from "@/client/src/components/common/index.ts";
import { useListParams } from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import type { Direction } from "@/client/src/lib/queries.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { DND35_ENTITY_KINDS } from "./dnd3.5/entityKinds.ts";

/** What a race or a class is for: a player character ("pc"), or what its base rules list besides. */
export type EntityKind = (typeof ENTITY_KINDS)[BaseRules][number]["value"];
export type EntitySortField = (typeof ENTITY_SORT_FIELDS)[number];

/** The kinds a race or a class is for, by base rules: what the Races and Classes tabs filter by. */
const ENTITY_KINDS = {
  "Dungeons & Dragons: 3.5": DND35_ENTITY_KINDS,
} satisfies Record<BaseRules, { label: string; value: string }[]>;

const ENTITY_SORT_FIELDS = ["name", "createdAt", "updatedAt"] as const;

const ENTITY_SORT_OPTIONS: SortOption<EntitySortField>[] = [...NAME_SORTS, ...CREATED_SORTS, ...UPDATED_SORTS];

/** Kind and sort the Races and Classes tabs open with: a player character's, by name. */
export const DEFAULT_ENTITY_FILTERS = {
  kind: "pc",
  orderBy: "name",
  orderDir: "asc",
} as const satisfies { kind: EntityKind; orderBy: EntitySortField; orderDir: Direction };

/**
 * The Races / Classes tab's search, kind and sort, kept in the URL, with the search bar props that change them: the
 * kinds its ruleset's base rules list.
 */
export function useEntityFilters(baseRules: BaseRules) {
  const { searchParams, updateSearchParams, search, orderBy, orderDir, searchBarProps } = useListParams(
    ENTITY_SORT_FIELDS,
    DEFAULT_ENTITY_FILTERS,
  );
  const kinds = ENTITY_KINDS[baseRules];
  const kind = oneOf(
    searchParams.get("kind"),
    kinds.map((option) => option.value),
    DEFAULT_ENTITY_FILTERS.kind,
  );

  return {
    search,
    kind,
    orderBy,
    orderDir,
    searchBarProps: {
      ...searchBarProps,
      filterOptions: kinds,
      filterValue: kind,
      onFilterChange: (next: EntityKind | undefined) =>
        updateSearchParams({ kind: next === DEFAULT_ENTITY_FILTERS.kind ? null : next }),
      sortOptions: ENTITY_SORT_OPTIONS,
    },
  };
}
