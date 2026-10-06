/**
 * Queries of the class page tabs, shared by the sections and the tab-hover prefetch so a hovered tab is cached under
 * the key its section reads.
 */

import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

export type ClassDetail = InferResponseType<(typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["$get"], 200>;

export type ClassSection =
  | "levels"
  | "skills"
  | "feat-pools"
  | "spells-known"
  | "spell-list"
  | "spells"
  | "properties"
  | "modifiers"
  | "requirements";

function classParam(rulesetId: string, classId: string) {
  return { param: { id: rulesetId, classId } };
}

/** The class itself, shared by the class page and the classes table's row hover. */
export function classDetailQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: queryKeys.rulesets.classDetail(rulesetId, classId),
    queryFn: () => parseResponse(rpc.api.rulesets[":id"].classes[":classId"].$get(classParam(rulesetId, classId))),
  });
}

export function classFeatPoolsQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: queryKeys.rulesets.classFeatPools(rulesetId, classId),
    queryFn: () =>
      parseResponse(rpc.api.rulesets[":id"].classes[":classId"]["feat-pools"].$get(classParam(rulesetId, classId))),
  });
}

export function classLevelsQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: queryKeys.rulesets.classLevels(rulesetId, classId),
    queryFn: () =>
      parseResponse(rpc.api.rulesets[":id"].classes[":classId"].levels.$get(classParam(rulesetId, classId))),
  });
}

export function classSkillsQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: queryKeys.rulesets.classSkills(rulesetId, classId),
    queryFn: () =>
      parseResponse(rpc.api.rulesets[":id"].classes[":classId"].skills.$get(classParam(rulesetId, classId))),
  });
}

/** The spell lists a class casts from, its own first: the spell list tab's picker. */
export function classSpellListsQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: queryKeys.rulesets.classSpellLists(rulesetId, classId),
    queryFn: () =>
      parseResponse(rpc.api.rulesets[":id"].classes[":classId"]["spell-lists"].$get(classParam(rulesetId, classId))),
  });
}

export function classSpellsKnownQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: queryKeys.rulesets.classSpellsKnown(rulesetId, classId),
    queryFn: () =>
      parseResponse(rpc.api.rulesets[":id"].classes[":classId"]["spells-known"].$get(classParam(rulesetId, classId))),
  });
}

export function classSpellsQuery(rulesetId: string, classId: string) {
  return queryOptions({
    queryKey: queryKeys.rulesets.classSpells(rulesetId, classId),
    queryFn: () =>
      parseResponse(rpc.api.rulesets[":id"].classes[":classId"].spells.$get(classParam(rulesetId, classId))),
  });
}

/** Warm a tab as it opens (the spell list starts at level 0 with no search). */
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
    case "spells":
      return queryClient.prefetchQuery(classSpellsQuery(rulesetId, classId));
    case "spell-list":
      return queryClient.prefetchQuery(classSpellListsQuery(rulesetId, classId));
    // The customization tabs read their rows through their sections, as every entity's customization page does
    case "properties":
    case "modifiers":
    case "requirements":
      return;
  }
}
