/**
 * Queries of a progression owner's page's tabs, shared by the sections and the tab-hover prefetch so a hovered tab is
 * cached under the key its section reads.
 */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";

import { NO_TIME } from "@/client/src/lib/durations.ts";
import { type EntityRow, readEntityFn } from "@/client/src/lib/entityRequests.ts";
import type { EntityKindDescription } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { entitiesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** One of an owner's tables, any of them, as its route answers it. */
type OwnerTable = InferResponseType<(typeof ownerApi)["tables"][":table"]["$get"], 200>;

/** The table of an owner whose rows hold a key (`K`): the feat pools', its lists' (`name`). */
type TableWith<K extends string> = Extract<OwnerTable, Record<K, unknown>[]>;

/**
 * An owner's link to an entity, of the role its kind's `links` describe, as its tab reads it: the owner it's from
 * (`fromId`, a copy's where an edit of an inherited one copied it), the entity it's to (`toId`) and that entity's name
 * (`toName`).
 */
export type LinkRow = Pick<
  InferResponseType<(typeof ownerApi)["links"]["$get"], 200>[number],
  "fromId" | "toId" | "toName"
>;

export type OwnerDetail = EntityRow;

/** A list an owner's levels count on (3.5's spell lists), as its table of them gives it: its own first. */
export type OwnerList = TableWith<"name">[number];

/**
 * A save of an owner's progression: its levels' forms, its pools' picks, its spell tables' totals, as its rules read
 * them, and its levels' tokens.
 */
export type OwnerProgressionBody = InferRequestType<(typeof ownerApi)["progression"]["$put"]>["json"];

/**
 * A level of one of an owner's tables its tables' tab edits, as its route answers it: the level (`position`), and its
 * totals at the key its table's rules say (`ProgressionTable.totals`: 3.5's `spellsPerDay`).
 */
export type TableRow = { id: string; position: number; updatedAt: string } & Record<string, unknown>;

/** An owner's routes, an entity's of the owners' kind. */
const ownerApi = rpc.api.rulesets[":id"].entities[":entityType"][":entityId"];

/** One of an owner's tables (`table`, by its name), as its tab reads it. */
async function readTable(rulesetId: string, ownerType: string, ownerId: string, table: string): Promise<OwnerTable> {
  const { param } = ownerParam(rulesetId, ownerType, ownerId);
  return await parseResponse(ownerApi.tables[":table"].$get({ param: { ...param, table } }));
}

/** An owner's levels (`ownerType`, its kind: 3.5's `classes`), its Progression tab's, the entities it owns. */
export function levelsQuery(rulesetId: string, ownerType: string, ownerId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.levels(rulesetId, ownerId),
    queryFn: () => parseResponse(ownerApi.owned.$get(ownerParam(rulesetId, ownerType, ownerId))),
  });
}

/**
 * The entities of a kind (`kind`, its type and its pools: 3.5's spells) on one of an owner's lists at a level, as its
 * list tab searches them: none is asked until the owner's lists have loaded and it has one (`listId`).
 */
export function listEntitiesQuery(
  rulesetId: string,
  kind: Pick<EntityKindDescription, "pools" | "type">,
  listId: string | undefined,
  level: number,
  search: string,
) {
  const entities = entitiesQuery(
    rulesetId,
    { ...kind, levels: true },
    { search, childOnly: false, pool: listId, level },
  );
  return infiniteQueryOptions({ ...entities, queryFn: listId === undefined ? skipToken : entities.queryFn });
}

/** The owner itself (of its kind, `ownerType`), shared by the owner's page and its kind's table's row hover. */
export function ownerDetailQuery(rulesetId: string, ownerType: string, ownerId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.ownerDetail(rulesetId, ownerId),
    queryFn: () => readEntityFn(rulesetId, ownerType, ownerId),
  });
}

/** The entities of a kind (`type`: 3.5's skills) an owner links to, its links' tab's, each link with its entity. */
export function ownerLinksQuery(rulesetId: string, ownerType: string, ownerId: string, type: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.ownerLinks(rulesetId, ownerId, type),
    queryFn: async (): Promise<LinkRow[]> =>
      await parseResponse(ownerApi.links.$get(ownerParam(rulesetId, ownerType, ownerId))),
  });
}

/**
 * The lists an owner's levels count on (`lists`, its table of them: 3.5's spell lists), its own first: its list tab's
 * picker.
 */
export function ownerListsQuery(rulesetId: string, ownerType: string, ownerId: string, lists: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.ownerTable(rulesetId, ownerId, lists),
    queryFn: async () => (await readTable(rulesetId, ownerType, ownerId, lists)) as OwnerList[],
  });
}

/** An owner's route's params: the ruleset, and the owner, an entity of its kind (`ownerType`: 3.5's `classes`). */
export function ownerParam(rulesetId: string, ownerType: string, ownerId: string) {
  return { param: { id: rulesetId, entityType: ownerType, entityId: ownerId } };
}

/**
 * What an owner's Progression and tables' tabs read beside its levels and tables: its pools' own picks, its list (3.5's
 * spell list), its feats' picks. Read again each time a tab mounts: an aptitude or a feat changed elsewhere (a spell list added)
 * changes it.
 */
export function ownerProgressionQuery(rulesetId: string, ownerType: string, ownerId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.ownerProgression(rulesetId, ownerId),
    staleTime: NO_TIME,
    queryFn: () => parseResponse(ownerApi.progression.$get(ownerParam(rulesetId, ownerType, ownerId))),
  });
}

/**
 * One of an owner's tables by level (`table`, by its name: 3.5's spells per day's `spells`, its feat pools' totals'
 * `feat-pools`); skipped without one (rules that have none).
 */
export function ownerTableQuery(rulesetId: string, ownerType: string, ownerId: string, table: string | undefined) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.ownerTable(rulesetId, ownerId, table ?? ""),
    queryFn: table ? async () => (await readTable(rulesetId, ownerType, ownerId, table)) as TableRow[] : skipToken,
  });
}
