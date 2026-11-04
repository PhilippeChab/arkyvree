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
 * A save of an owner's tables (`sent`, as its tables' tab makes it) and what it would leave them at, as its rules answer
 * it: each table its tables' tab edits, by its name (`tables`), a row an owned entity.
 */
export interface OwnerTablesPlan<T> {
  sent: T;
  tables: Record<string, TableRow[] | undefined>;
}

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

/** A list an owner's owned entities count on (3.5's spell lists), as its table of them gives it: its own first. */
export type OwnerList = TableWith<"name">[number];

/**
 * A save of an owner's progression: its owned entities' forms, its pools' picks, its spell tables' totals, as its rules
 * read them, and its owned entities' tokens.
 */
export type OwnerProgressionBody = InferRequestType<(typeof ownerApi)["progression"]["$put"]>["json"];

/** A save of an owner's progression as its plan reads it: what its save sends but its tokens, as it writes nothing. */
export type OwnerProgressionPlanBody = InferRequestType<(typeof ownerApi)["progression"]["plan"]["$post"]>["json"];

/**
 * An owned entity of one of an owner's tables its tables' tab edits, as its route answers it: its number (`position`),
 * and its totals at the key its table's rules say (`ProgressionTable.totals`: 3.5's `spellsPerDay`).
 */
export type TableRow = { id: string; position: number; updatedAt: string } & Record<string, unknown>;

/** An owner's routes, an entity's of the owners' kind. */
const ownerApi = rpc.api.rulesets[":id"].entities[":entityType"][":entityId"];

/** One of an owner's tables (`table`, by its name), as its tab reads it. */
async function readTable(rulesetId: string, ownerType: string, ownerId: string, table: string): Promise<OwnerTable> {
  const { param } = ownerParam(rulesetId, ownerType, ownerId);
  return await parseResponse(ownerApi.tables[":table"].$get({ param: { ...param, table } }));
}

/**
 * The entities of a kind (`kind`, its type and its pools: 3.5's spells) on one of an owner's lists at a tier, as its
 * list tab searches them: none is asked until the owner's lists have loaded and it has one (`listId`).
 */
export function listEntitiesQuery(
  rulesetId: string,
  kind: Pick<EntityKindDescription, "pools" | "type">,
  listId: string | undefined,
  tier: number,
  search: string,
) {
  const entities = entitiesQuery(
    rulesetId,
    { ...kind, tiered: true },
    { search, childOnly: false, pool: listId, tier },
  );
  return infiniteQueryOptions({ ...entities, queryFn: listId === undefined ? skipToken : entities.queryFn });
}

/**
 * The feature a typed name (`name`) creates on an owner, as its rules answer it: the name its create gives it ("Hex
 * (Witch)"), and whether its ruleset has it already; skipped for nothing typed.
 */
export function newFeatureQuery(rulesetId: string, ownerType: string, ownerId: string, name: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.ownerNewFeature(rulesetId, ownerId, name),
    queryFn: name
      ? async () =>
          await parseResponse(
            ownerApi.progression.features.$get({ ...ownerParam(rulesetId, ownerType, ownerId), query: { name } }),
          )
      : skipToken,
  });
}

/** An owner's owned entities (`ownerType`, its kind: 3.5's `classes`), its Progression tab's, the entities it owns. */
export function ownedEntitiesQuery(rulesetId: string, ownerType: string, ownerId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.owned(rulesetId, ownerId),
    queryFn: () => parseResponse(ownerApi.owned.$get(ownerParam(rulesetId, ownerType, ownerId))),
  });
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
 * The lists an owner's owned entities count on (`lists`, its table of them: 3.5's spell lists), its own first: its list
 * tab's picker.
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
 * What a save of an owner's tables (`sent`, at the key its progression's save takes them by, `key`: 3.5's `spells`)
 * would leave them at, as its rules answer it, with the save it answers (`sent`, which a draft that changed since reads
 * it against): each table its tables' tab edits by its name, a row an owned entity, as `ownerTableQuery` reads it once
 * saved; skipped for a draft that saves nothing (`sent` none).
 */
export function ownerProgressionPlanQuery<T extends object>(
  rulesetId: string,
  ownerType: string,
  ownerId: string,
  key: string,
  sent: T | undefined,
) {
  // Its tables' cells at the key its rules say
  const json = { [key]: sent } as OwnerProgressionPlanBody;
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.ownerProgressionPlan(rulesetId, ownerId, sent ? json : {}),
    // Read again each time it's asked: another editor may change the tables it plans over
    staleTime: NO_TIME,
    queryFn: sent
      ? async (): Promise<OwnerTablesPlan<T>> => {
          const planned = await parseResponse(
            ownerApi.progression.plan.$post({ ...ownerParam(rulesetId, ownerType, ownerId), json }),
          );
          // Its tables by their names, as its rules name them
          return { sent, tables: planned.tables as OwnerTablesPlan<T>["tables"] };
        }
      : skipToken,
  });
}

/**
 * What an owner's Progression and tables' tabs read beside its owned entities and tables: its pools' own picks, its
 * list (3.5's spell list), its feats' picks. Read again each time a tab mounts: an aptitude or a feat changed elsewhere
 * (a spell list added) changes it.
 */
export function ownerProgressionQuery(rulesetId: string, ownerType: string, ownerId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.ownerProgression(rulesetId, ownerId),
    staleTime: NO_TIME,
    queryFn: () => parseResponse(ownerApi.progression.$get(ownerParam(rulesetId, ownerType, ownerId))),
  });
}

/**
 * One of an owner's tables by position (`table`, by its name: 3.5's spells per day's `spells`, its feat pools' totals'
 * `feat-pools`); skipped without one (rules that have none).
 */
export function ownerTableQuery(rulesetId: string, ownerType: string, ownerId: string, table: string | undefined) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.ownerTable(rulesetId, ownerId, table ?? ""),
    queryFn: table ? async () => (await readTable(rulesetId, ownerType, ownerId, table)) as TableRow[] : skipToken,
  });
}

/**
 * What a save of an owner's progression (`body`, as its save sends it) would give, as its rules answer it: the notes on
 * its owned entities' grants that would give nothing (at the key its rules say, 3.5's `featureNotes`), which its card
 * shows before the save; skipped for a draft that saves nothing (`body` none).
 */
export function progressionPlanQuery(
  rulesetId: string,
  ownerType: string,
  ownerId: string,
  body: OwnerProgressionPlanBody | undefined,
) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.ownerProgressionNotes(rulesetId, ownerId, body ?? {}),
    // Read again each time it's asked: another editor may change the levels it plans over
    staleTime: NO_TIME,
    queryFn: body
      ? async () =>
          await parseResponse(
            ownerApi.progression.plan.$post({ ...ownerParam(rulesetId, ownerType, ownerId), json: body }),
          )
      : skipToken,
  });
}
