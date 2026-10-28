/**
 * List queries of the ruleset tabs. Each section renders with these, and the tab bar prefetches with the same
 * factories, so a hovered tab's first page is already cached under the exact key the section asks for. What its
 * pickers offer is `optionQueries.ts`'.
 */

import { infiniteQueryOptions, type QueryClient, type QueryKey, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { givenParams, readEntitiesFn } from "@/client/src/lib/entityRequests.ts";
import { nextPage } from "@/client/src/lib/pageItems.ts";
import type { Direction, EntityKindDescription } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  DEFAULT_ENTITY_SORT,
  type EntityKind,
  type EntitySortField,
} from "@/client/src/pages/rulesets/hooks/useEntityFilters.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { rulesetSettingsQuery } from "./rulesetQueries.ts";

/**
 * A kind's list's filters: past every list's, those its kind narrows it by, the kind a race or a class is for and its
 * sort (`partitioned`), the pool it's picked in (`pool`, its id, where its kind's `pools` say), its tier (`levels`).
 */
interface EntityFilters extends PoolFilters {
  kind?: EntityKind;
  level?: number;
  orderBy?: EntitySortField;
  orderDir?: Direction;
}

interface ListFilters {
  childOnly: boolean;
  search: string;
}

/** A list's filters, past every list's, where its kind narrows by a pool: the pool's id (`pool`). */
interface PoolFilters extends ListFilters {
  pool?: string;
}

/** What a kind's list query reads of its kind: its type, and what narrows its list (its pools, by their links' role). */
type EntityListKind = Pick<EntityKindDescription, "levels" | "partitioned" | "type"> & {
  pools?: Pick<NonNullable<EntityKindDescription["pools"]>, "role">;
};

/** What a kind's grouped list reads of its kind: its type, and its pools, by their links' role. */
type GroupedKind = Pick<EntityListKind, "pools" | "type">;

/** A group of an entity kind's list (a feat's family), as its grouped list gives it. */
export type EntityGroup = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["entities"][":entityType"]["grouped"]["$get"],
  200
>["items"][number];

/** A ruleset page's tab: an entity kind's, by its URL segment (`races`, `classes`), or its Settings (`settings`). */
export type RulesetSection = string;

/** The key of a kind's list: its tab's, and each filter its kind narrows it by. */
function entityListKey(rulesetId: string, kind: EntityListKind, filters: EntityFilters) {
  return [
    ...sectionKey(rulesetId, kind.type, filters),
    ...(kind.partitioned ? [filters.kind, filters.orderBy, filters.orderDir] : []),
    ...(kind.pools ? [filters.pool] : []),
    ...(kind.levels ? [filters.level] : []),
  ];
}

/**
 * A kind's list's search params: its page's, and each filter its kind narrows it by, by what it filters: what a race
 * or a class is for (its `partition`), a pool (its entities' links' role), a tier.
 */
function entityListParams(pageParam: number, kind: EntityListKind, filters: EntityFilters) {
  return {
    ...pageSearchParams(pageParam, filters),
    ...(kind.partitioned && { partition: filters.kind, orderBy: filters.orderBy, orderDir: filters.orderDir }),
    ...(kind.pools && { [kind.pools.role]: filters.pool }),
    ...(kind.levels && { tier: filters.level?.toString() }),
  };
}

/** A tab's search params: its page, ten rows at a time, its search, and whether it lists the ruleset's own only. */
function pageSearchParams(pageParam: number, { search, childOnly }: ListFilters) {
  return {
    page: pageParam.toString(),
    limit: "10",
    search: search || undefined,
    childOnly: childOnly ? ("true" as const) : undefined,
  };
}

/**
 * A page of a kind's grouped list, through its grouped route: its search params (`params`, its page's, a family's), and
 * its pool where its kind narrows by one.
 */
function readGroupsFn(
  rulesetId: string,
  kind: GroupedKind,
  pool: string | undefined,
  params: Readonly<Record<string, string | undefined>>,
) {
  return parseResponse(
    rpc.api.rulesets[":id"].entities[":entityType"].grouped.$get({
      param: { id: rulesetId, entityType: kind.type },
      query: givenParams({ ...params, ...(kind.pools && { [kind.pools.role]: pool }) }),
    }),
  );
}

function sectionKey(rulesetId: string, section: RulesetSection, filters: ListFilters) {
  return [...QUERY_KEYS.rulesets.section(rulesetId, section), filters.search, filters.childOnly] as const;
}

/**
 * An entity kind's list (`kind`: its type, and what narrows it: the kind a race or a class is for and its sort, a
 * pool, a spell's level), through the routes by kind, under its tab's key.
 */
export function entitiesQuery(rulesetId: string, kind: EntityListKind, filters: EntityFilters) {
  return infiniteQueryOptions({
    queryKey: entityListKey(rulesetId, kind, filters),
    queryFn: ({ pageParam }) => readEntitiesFn(rulesetId, kind.type, entityListParams(pageParam, kind, filters)),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/**
 * The variants of a family of a kind (a feat's), which its group's row lists as it expands: read through the grouped
 * list with the family (`family`), narrowed by the same search, pool and Local Changes, so they're what its row counts.
 * A row of one entity has none to ask for.
 */
export function entityFamilyQuery(rulesetId: string, kind: GroupedKind, family: string | null, filters: PoolFilters) {
  return infiniteQueryOptions({
    queryKey: [
      ...QUERY_KEYS.rulesets.familyVariants(rulesetId, kind.type, family ?? ""),
      filters.search,
      filters.childOnly,
      filters.pool,
    ],
    queryFn: family
      ? ({ pageParam }) =>
          readGroupsFn(rulesetId, kind, filters.pool, {
            ...pageSearchParams(pageParam, filters),
            limit: "50",
            family,
          })
      : skipToken,
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/**
 * A kind's list with its variants grouped under their family (a feat's), its kind's default view, narrowed by its
 * pool where its kind is (`kind`: its type and its pools).
 */
export function entityGroupsQuery(rulesetId: string, kind: GroupedKind, filters: PoolFilters) {
  return infiniteQueryOptions({
    queryKey: [
      ...QUERY_KEYS.rulesets.sectionGrouped(rulesetId, kind.type),
      filters.search,
      filters.childOnly,
      filters.pool,
    ],
    queryFn: ({ pageParam }) => readGroupsFn(rulesetId, kind, filters.pool, pageSearchParams(pageParam, filters)),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/**
 * After a write to a ruleset's content: the lists it shows in (a section's, a customization tab's, a class's), and the
 * ruleset's Local Changes and new characters' creations (the entities they score), which any write can change. It
 * settles once they're read again, for a write that waits.
 */
export function invalidateRulesetEdit(
  queryClient: QueryClient,
  rulesetId: string,
  keys: readonly QueryKey[],
): Promise<void> {
  const all = [...keys, QUERY_KEYS.rulesets.changes(rulesetId), QUERY_KEYS.rulesets.creations(rulesetId)];
  return Promise.all(all.map((queryKey) => queryClient.invalidateQueries({ queryKey }))).then(() => undefined);
}

/**
 * Warm the first page of a tab the way it opens: switching tabs clears the URL's filters, so that's no search, the kind
 * its rules list first (`entityKind`, a player character's) and the default sort, no pool and every level, and the
 * ruleset's default "Local Changes" setting: an entity kind's tab's (`kind`) list, or its groups where its kind groups
 * its variants (`families`), its Settings' fields.
 */
export function prefetchSection(
  queryClient: QueryClient,
  rulesetId: string,
  section: RulesetSection,
  kind: EntityKindDescription | null,
  entityKind: EntityKind | undefined,
  childOnly: boolean,
) {
  const filters = { search: "", childOnly };
  if (section === "settings") return queryClient.prefetchQuery(rulesetSettingsQuery(rulesetId));
  if (!kind) return;
  if (kind.families) return queryClient.prefetchInfiniteQuery(entityGroupsQuery(rulesetId, kind, filters));
  const where = kind.partitioned ? { ...filters, kind: entityKind, ...DEFAULT_ENTITY_SORT } : filters;
  return queryClient.prefetchInfiniteQuery(entitiesQuery(rulesetId, kind, where));
}
