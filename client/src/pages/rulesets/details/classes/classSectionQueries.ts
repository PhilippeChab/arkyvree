/**
 * Queries of the class page tabs, shared by the sections and the tab-hover prefetch so a hovered tab is cached under
 * the key its section reads.
 */

import { infiniteQueryOptions, type QueryClient, queryOptions, skipToken } from "@tanstack/react-query";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import type { CustomizationSection } from "@/client/src/pages/rulesets/customization/sections/index.ts";
import { powersQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

export type ClassDetail = InferResponseType<(typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["$get"], 200>;

/** A class's form, its create's body: what its create dialog and its page's editor edit. */
export type ClassFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["classes"]["$post"]>["json"];

/**
 * A class level's form, its create's body: its number, base attack bonus and skill points, which its create dialog
 * sets, and its saves and granted feats, which its page edits too.
 */
export type ClassLevelFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["levels"]["$post"]
>["json"];

/** A class's level as its Levels tab lists it */
export type ClassLevelRow = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["levels"]["$get"],
  200
>[number];

/** A class page's tab: its own, then those that customize it (`CUSTOMIZATION_TABS`) */
export type ClassSection =
  | "levels"
  | "skills"
  | "feat-pools"
  | "spells-known"
  | "spell-list"
  | "spells-per-day"
  | CustomizationSection;

function classParam(rulesetId: string, classId: string) {
  return { param: { id: rulesetId, classId } };
}

/** The class itself, shared by the class page and the classes table's row hover. */
export function classDetailQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classDetail(rulesetId, classId),
    queryFn: () => parseResponse(rpc.api.rulesets[":id"].classes[":classId"].$get(classParam(rulesetId, classId))),
  });
}

export function classFeatPoolsQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classFeatPools(rulesetId, classId),
    queryFn: () =>
      parseResponse(rpc.api.rulesets[":id"].classes[":classId"]["feat-pools"].$get(classParam(rulesetId, classId))),
  });
}

export function classLevelsQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classLevels(rulesetId, classId),
    queryFn: () =>
      parseResponse(rpc.api.rulesets[":id"].classes[":classId"].levels.$get(classParam(rulesetId, classId))),
  });
}

export function classSkillsQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classSkills(rulesetId, classId),
    queryFn: () =>
      parseResponse(rpc.api.rulesets[":id"].classes[":classId"].skills.$get(classParam(rulesetId, classId))),
  });
}

/** The spell lists a class casts from, its own first: the spell list tab's picker. */
export function classSpellListsQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classSpellLists(rulesetId, classId),
    queryFn: () =>
      parseResponse(rpc.api.rulesets[":id"].classes[":classId"]["spell-lists"].$get(classParam(rulesetId, classId))),
  });
}

export function classSpellsKnownQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classSpellsKnown(rulesetId, classId),
    queryFn: () =>
      parseResponse(rpc.api.rulesets[":id"].classes[":classId"]["spells-known"].$get(classParam(rulesetId, classId))),
  });
}

export function classSpellsPerDayQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.rulesets.classSpellsPerDay(rulesetId, classId),
    queryFn: () =>
      parseResponse(rpc.api.rulesets[":id"].classes[":classId"].spells.$get(classParam(rulesetId, classId))),
  });
}

/** Warm a tab's rows as it's pointed at: the spell list tab's, the lists it picks among. */
export function prefetchClassSection(
  queryClient: QueryClient,
  rulesetId: string,
  classId: string,
  section: ClassSection,
) {
  switch (section) {
    case "levels":
      return queryClient.prefetchQuery(classLevelsQuery(rulesetId, classId));
    case "skills":
      return queryClient.prefetchQuery(classSkillsQuery(rulesetId, classId));
    case "feat-pools":
      return queryClient.prefetchQuery(classFeatPoolsQuery(rulesetId, classId));
    case "spells-known":
      return queryClient.prefetchQuery(classSpellsKnownQuery(rulesetId, classId));
    case "spells-per-day":
      return queryClient.prefetchQuery(classSpellsPerDayQuery(rulesetId, classId));
    case "spell-list":
      return queryClient.prefetchQuery(classSpellListsQuery(rulesetId, classId));
    // The customization tabs read their rows through their sections, as every entity's customization page does
    case "properties":
    case "modifiers":
    case "requirements":
      return;
  }
}

/**
 * The spells of one of a class's spell lists at a level, as its Spells tab searches them: none is asked until the
 * class's lists have loaded and it has one (`listId`).
 */
export function spellListSpellsQuery(rulesetId: string, listId: string | undefined, level: number, search: string) {
  const spells = powersQuery(rulesetId, { search, childOnly: false, aptitudeId: listId, level });
  return infiniteQueryOptions({ ...spells, queryFn: listId === undefined ? skipToken : spells.queryFn });
}
