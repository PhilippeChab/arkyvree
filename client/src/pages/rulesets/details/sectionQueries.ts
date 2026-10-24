/**
 * List queries of the ruleset tabs. Each section renders with these, and the tab bar prefetches with the same
 * factories, so a hovered tab's first page is already cached under the exact key the section asks for. What its
 * pickers offer is `optionQueries.ts`'.
 */

import { infiniteQueryOptions, type QueryClient, type QueryKey, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { entitySegment, givenParams, readEntitiesFn } from "@/client/src/lib/entityRequests.ts";
import { nextPage } from "@/client/src/lib/pageItems.ts";
import type { Direction, EntityKindDescription } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  DEFAULT_ENTITY_FILTERS,
  type EntityKind,
  type EntitySortField,
} from "@/client/src/pages/rulesets/hooks/useEntityFilters.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { rulesetFieldsQuery, rulesetSettingsQuery } from "./rulesetQueries.ts";

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

interface PowerFilters extends PoolFilters {
  level?: number;
}

/** What a kind's list query reads of its kind: its type, and what narrows its list (its pools, by their key). */
type EntityListKind = Pick<EntityKindDescription, "levels" | "partitioned" | "type"> & {
  pools?: Pick<NonNullable<EntityKindDescription["pools"]>, "key">;
};

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
    ...sectionKey(rulesetId, getUrlSegment(kind.type), filters),
    ...(kind.partitioned ? [filters.kind, filters.orderBy, filters.orderDir] : []),
    ...(kind.pools ? [filters.pool] : []),
    ...(kind.levels ? [filters.level] : []),
  ];
}

/** A kind's list's search params: its page's, and each filter its kind narrows it by. */
function entityListParams(pageParam: number, kind: EntityListKind, filters: EntityFilters) {
  return {
    ...pageSearchParams(pageParam, filters),
    ...(kind.partitioned && { kind: filters.kind, orderBy: filters.orderBy, orderDir: filters.orderDir }),
    ...(kind.pools && { [kind.pools.key]: filters.pool }),
    ...(kind.levels && { level: filters.level?.toString() }),
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

function sectionKey(rulesetId: string, section: RulesetSection, filters: ListFilters) {
  return [...QUERY_KEYS.rulesets.section(rulesetId, section), filters.search, filters.childOnly] as const;
}

/**
 * An entity kind's list (`kind`: its type, and what narrows it: the kind a race or a class is for and its sort, a
 * pool, a power's level), through the routes by kind, under its tab's key.
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
 * The variants of a family of a kind (`type`: a feat's), which its group's row lists as it expands; a row of one
 * entity has none to ask for.
 */
export function entityFamilyQuery(rulesetId: string, type: string, family: string | null, childOnly: boolean) {
  const segment = getUrlSegment(type);
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.rulesets.familyVariants(rulesetId, segment, family ?? "", childOnly),
    queryFn: family
      ? ({ pageParam }) =>
          readEntitiesFn(rulesetId, type, {
            limit: "50",
            page: pageParam.toString(),
            family,
            childOnly: childOnly ? "true" : undefined,
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
export function entityGroupsQuery(
  rulesetId: string,
  kind: Pick<EntityListKind, "pools" | "type">,
  filters: PoolFilters,
) {
  const segment = getUrlSegment(kind.type);
  return infiniteQueryOptions({
    queryKey: [
      ...QUERY_KEYS.rulesets.sectionGrouped(rulesetId, segment),
      filters.search,
      filters.childOnly,
      filters.pool,
    ],
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.rulesets[":id"].entities[":entityType"].grouped.$get({
          param: { id: rulesetId, entityType: entitySegment(segment) },
          query: givenParams({
            ...pageSearchParams(pageParam, filters),
            ...(kind.pools && { [kind.pools.key]: filters.pool }),
          }),
        }),
      ),
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

/** A spell list's spells of a level, as a class's Spells tab lists them: the powers' list, by pool and level. */
export function powersQuery(rulesetId: string, filters: PowerFilters) {
  // The powers' pools' key, as their kind's rules describe it
  return entitiesQuery(rulesetId, { levels: true, pools: { key: "aptitudeId" }, type: "powers" }, filters);
}

/**
 * Warm the first page of a tab the way it opens: switching tabs clears the URL's filters, so that's no search, the
 * default kind and sort, no pool and every level, and the ruleset's default "Local Changes" setting: an entity kind's
 * tab's (`kind`) list, or its groups where its kind groups its variants (`families`), its Settings' fields.
 */
export function prefetchSection(
  queryClient: QueryClient,
  rulesetId: string,
  section: RulesetSection,
  kind: EntityKindDescription | null,
  childOnly: boolean,
) {
  const filters = { search: "", childOnly };
  if (section === "settings") {
    return Promise.all([
      queryClient.prefetchQuery(rulesetSettingsQuery(rulesetId)),
      queryClient.prefetchQuery(rulesetFieldsQuery(rulesetId)),
    ]);
  }
  if (!kind) return;
  if (kind.families) return queryClient.prefetchInfiniteQuery(entityGroupsQuery(rulesetId, kind, filters));
  const where = kind.partitioned ? { ...filters, ...DEFAULT_ENTITY_FILTERS } : filters;
  return queryClient.prefetchInfiniteQuery(entitiesQuery(rulesetId, kind, where));
}
