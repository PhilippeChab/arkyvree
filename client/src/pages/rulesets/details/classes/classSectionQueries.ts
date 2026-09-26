/**
 * Queries of the class page tabs, shared by the sections and the tab-hover
 * prefetch so a hovered tab is cached under the key its section reads.
 */
import { infiniteQueryOptions, queryOptions, type QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

export type ClassSection = "levels" | "skills" | "feat-pools" | "spells-known" | "spell-list" | "spells";

const classParam = (rulesetId: string, classId: string) => ({ param: { id: rulesetId, classId } });

export const classLevelsQuery = (rulesetId: string, classId: string) => queryOptions({
  queryKey: queryKeys.rulesets.classLevels(rulesetId, classId),
  queryFn: () => parseResponse(rpc.api.rulesets[":id"].classes[":classId"].levels.$get(classParam(rulesetId, classId))),
});

export const classSkillsQuery = (rulesetId: string, classId: string) => queryOptions({
  queryKey: queryKeys.rulesets.classSkills(rulesetId, classId),
  queryFn: () => parseResponse(rpc.api.rulesets[":id"].classes[":classId"].skills.$get(classParam(rulesetId, classId))),
});

export const classFeatPoolsQuery = (rulesetId: string, classId: string) => queryOptions({
  queryKey: queryKeys.rulesets.classFeatPools(rulesetId, classId),
  queryFn: () => parseResponse(rpc.api.rulesets[":id"].classes[":classId"]["feat-pools"].$get(classParam(rulesetId, classId))),
});

export const classSpellsKnownQuery = (rulesetId: string, classId: string) => queryOptions({
  queryKey: queryKeys.rulesets.classSpellsKnown(rulesetId, classId),
  queryFn: () => parseResponse(rpc.api.rulesets[":id"].classes[":classId"]["spells-known"].$get(classParam(rulesetId, classId))),
});

export const classSpellsQuery = (rulesetId: string, classId: string) => queryOptions({
  queryKey: queryKeys.rulesets.classSpells(rulesetId, classId),
  queryFn: () => parseResponse(rpc.api.rulesets[":id"].classes[":classId"].spells.$get(classParam(rulesetId, classId))),
});

export const classSpellListQuery = (rulesetId: string, classId: string, level: number, search: string) => infiniteQueryOptions({
  queryKey: queryKeys.rulesets.classSpellList(rulesetId, classId, level, search),
  queryFn: ({ pageParam }) => parseResponse(rpc.api.rulesets[":id"].classes[":classId"]["spell-list"].$get({
    ...classParam(rulesetId, classId),
    query: { page: pageParam.toString(), limit: "20", level: level.toString(), search: search || undefined },
  })),
  initialPageParam: 1,
  getNextPageParam: (lastPage) => lastPage.nextPage,
});

/** Warm a tab as it opens (the spell list starts at level 0 with no search). */
export function prefetchClassSection(queryClient: QueryClient, rulesetId: string, classId: string, section: ClassSection) {
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
      return queryClient.prefetchInfiniteQuery(classSpellListQuery(rulesetId, classId, 0, ""));
  }
}
