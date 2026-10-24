/**
 * Queries of the class page tabs, shared by the sections and the tab-hover prefetch so a hovered tab is cached under
 * the key its section reads.
 */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";

import { NO_TIME } from "@/client/src/lib/durations.ts";
import { type EntityRow, readEntityFn } from "@/client/src/lib/entityRequests.ts";
import type { EntityKindDescription } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import type { LevelFeat, LevelSave } from "@/client/src/pages/rulesets/components/forms/classLevelForm.ts";
import { entitiesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

/** One of a class's tables, any of them, as its route answers it. */
type ClassTable = InferResponseType<(typeof classApi)["tables"][":table"]["$get"], 200>;

/** The table of a class whose rows hold a key (`K`): the feat pools', its lists' (`name`). */
type TableWith<K extends string> = Extract<ClassTable, Record<K, unknown>[]>;

export type ClassDetail = EntityRow;

/**
 * A class level's form, its create's body: its number, base attack bonus and skill points, which its create dialog
 * sets, and its saves and granted feats, which its page edits too.
 */
export type ClassLevelFormData = InferRequestType<(typeof classApi)["owned"]["$post"]>["json"] & {
  feats: (LevelFeat & { free?: boolean })[];
  level: number;
  saves: LevelSave[];
};

/** A class's level as its Progression tab lists it */
export type ClassLevelRow = InferResponseType<(typeof classApi)["owned"]["$get"], 200>[number];

/** A list a class's levels count on (3.5's spell lists), as its table of them gives it: its own first. */
export type ClassList = TableWith<"name">[number];

/** What a class's Progression and tables' tabs read beside its levels and tables: its pools' picks, its list. */
export type ClassProgression = InferResponseType<(typeof classApi)["progression"]["$get"], 200>;

/**
 * A save of a class's progression: its levels' forms, its pools' picks, its spell tables' totals, as its rules read
 * them, and its levels' tokens.
 */
export type ClassProgressionBody = InferRequestType<(typeof classApi)["progression"]["$put"]>["json"];

/** A link of a class to an entity, by the keys its kind's `links` describe: the entity's, the class's, and its row. */
export type LinkRow = Record<string, unknown>;

/**
 * A level of one of a class's tables its tables' tab edits, as its route answers it: the level, and its totals at the
 * key its table's rules say (`ProgressionTable.totals`: 3.5's `spellsPerDay`).
 */
export type TableRow = { id: string; level: number; updatedAt: string } & Record<string, unknown>;

/** A class's routes, an entity's of the classes' kind. */
const classApi = rpc.api.rulesets[":id"].entities[":entityType"][":entityId"];

/** A class's route's params: the ruleset, and the class, an entity of the classes' kind. */
function classParam(rulesetId: string, classId: string) {
  return { param: { id: rulesetId, entityType: "classes" as const, entityId: classId } };
}

/** One of a class's tables (`table`, by its name), as its tab reads it. */
async function readTable(rulesetId: string, classId: string, table: string): Promise<ClassTable> {
  const { param } = classParam(rulesetId, classId);
  return await parseResponse(classApi.tables[":table"].$get({ param: { ...param, table } }));
}

/** The class itself, shared by the class page and the classes table's row hover. */
export function classDetailQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classDetail(rulesetId, classId),
    queryFn: () => readEntityFn(rulesetId, "klasses", classId),
  });
}

export function classLevelsQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classLevels(rulesetId, classId),
    queryFn: () => parseResponse(classApi.owned.$get(classParam(rulesetId, classId))),
  });
}

/** The entities of a kind (`type`: 3.5's skills) a class links to, its links' tab's, each link with its entity. */
export function classLinksQuery(rulesetId: string, classId: string, type: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classLinks(rulesetId, classId, getUrlSegment(type)),
    queryFn: async (): Promise<LinkRow[]> => await parseResponse(classApi.links.$get(classParam(rulesetId, classId))),
  });
}

/**
 * The lists a class's levels count on (`lists`, its table of them: 3.5's spell lists), its own first: its list tab's
 * picker.
 */
export function classListsQuery(rulesetId: string, classId: string, lists: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classTable(rulesetId, classId, lists),
    queryFn: async () => (await readTable(rulesetId, classId, lists)) as ClassList[],
  });
}

/**
 * What a class's Progression and tables' tabs read beside its levels and tables: its pools' own picks, its list (3.5's
 * spell list), its feats' picks. Read again each time a tab mounts: an aptitude or a feat changed elsewhere (a spell list added)
 * changes it.
 */
export function classProgressionQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classProgression(rulesetId, classId),
    staleTime: NO_TIME,
    queryFn: () => parseResponse(classApi.progression.$get(classParam(rulesetId, classId))),
  });
}

/**
 * One of a class's tables by level (`table`, by its name: 3.5's spells per day's `spells`, its feat pools' totals'
 * `feat-pools`); skipped without one (rules that have none).
 */
export function classTableQuery(rulesetId: string, classId: string, table: string | undefined) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classTable(rulesetId, classId, table ?? ""),
    queryFn: table ? async () => (await readTable(rulesetId, classId, table)) as TableRow[] : skipToken,
  });
}

/**
 * The entities of a kind (`kind`, its type and its pools: 3.5's spells) on one of a class's lists at a level, as its
 * list tab searches them: none is asked until the class's lists have loaded and it has one (`listId`).
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
