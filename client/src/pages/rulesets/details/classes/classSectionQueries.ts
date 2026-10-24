/**
 * Queries of the class page tabs, shared by the sections and the tab-hover prefetch so a hovered tab is cached under
 * the key its section reads.
 */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";

import { NO_TIME } from "@/client/src/lib/durations.ts";
import { type EntityRow, readEntityFn } from "@/client/src/lib/entityRequests.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import type { LevelFeat, LevelSave } from "@/client/src/pages/rulesets/components/forms/classLevelForm.ts";
import { powersQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** A class's tables, by the name its route reads one by, each by a key its rows alone hold. */
interface TableKeys {
  "feat-pools": "featPools";
  "spell-lists": "name";
  spells: "spellsPerDay";
  "spells-known": "spellsKnown";
}

/** One of a class's tables, any of them, as its route answers it. */
type ClassTable = InferResponseType<(typeof classApi)["tables"][":table"]["$get"], 200>;

/** The table of a class whose rows hold a key (`K`): the feat pools', the spells per day's, the spells known's. */
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

/** What a class's Progression and Spells tabs read beside its levels and tables: its pools' own picks, its spell list. */
export type ClassProgression = InferResponseType<(typeof classApi)["progression"]["$get"], 200>;

/**
 * A save of a class's progression: its levels' forms, its pools' picks, its spell tables' totals, as its rules read
 * them, and its levels' tokens.
 */
export type ClassProgressionBody = InferRequestType<(typeof classApi)["progression"]["$put"]>["json"];

/** A class's routes, an entity's of the classes' kind. */
const classApi = rpc.api.rulesets[":id"].entities[":entityType"][":entityId"];

/** A class's route's params: the ruleset, and the class, an entity of the classes' kind. */
function classParam(rulesetId: string, classId: string) {
  return { param: { id: rulesetId, entityType: "classes" as const, entityId: classId } };
}

/** One of a class's tables (`table`, by its name), as its tab reads it: the one whose rows hold its key. */
async function readTable<N extends keyof TableKeys>(rulesetId: string, classId: string, table: N) {
  const { param } = classParam(rulesetId, classId);
  return (await parseResponse(classApi.tables[":table"].$get({ param: { ...param, table } }))) as TableWith<
    TableKeys[N]
  >;
}

/** The class itself, shared by the class page and the classes table's row hover. */
export function classDetailQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classDetail(rulesetId, classId),
    queryFn: () => readEntityFn(rulesetId, "klasses", classId),
  });
}

export function classFeatPoolsQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classFeatPools(rulesetId, classId),
    queryFn: () => readTable(rulesetId, classId, "feat-pools"),
  });
}

export function classLevelsQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classLevels(rulesetId, classId),
    queryFn: () => parseResponse(classApi.owned.$get(classParam(rulesetId, classId))),
  });
}

/**
 * What a class's Progression and Spells tabs read beside its levels and tables: its pools' own picks, its spell list,
 * its feats' picks. Read again each time a tab mounts: an aptitude or a feat changed elsewhere (a spell list added)
 * changes it.
 */
export function classProgressionQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classProgression(rulesetId, classId),
    staleTime: NO_TIME,
    queryFn: () => parseResponse(classApi.progression.$get(classParam(rulesetId, classId))),
  });
}

export function classSkillsQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classSkills(rulesetId, classId),
    queryFn: () => parseResponse(classApi.links.$get(classParam(rulesetId, classId))),
  });
}

/** The spell lists a class casts from, its own first: the spell list tab's picker. */
export function classSpellListsQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classSpellLists(rulesetId, classId),
    queryFn: () => readTable(rulesetId, classId, "spell-lists"),
  });
}

export function classSpellsKnownQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classSpellsKnown(rulesetId, classId),
    queryFn: () => readTable(rulesetId, classId, "spells-known"),
  });
}

export function classSpellsPerDayQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classSpellsPerDay(rulesetId, classId),
    queryFn: () => readTable(rulesetId, classId, "spells"),
  });
}

/**
 * The spells of one of a class's spell lists at a level, as its Spells tab searches them: none is asked until the
 * class's lists have loaded and it has one (`listId`).
 */
export function spellListSpellsQuery(rulesetId: string, listId: string | undefined, level: number, search: string) {
  const spells = powersQuery(rulesetId, { search, childOnly: false, pool: listId, level });
  return infiniteQueryOptions({ ...spells, queryFn: listId === undefined ? skipToken : spells.queryFn });
}
