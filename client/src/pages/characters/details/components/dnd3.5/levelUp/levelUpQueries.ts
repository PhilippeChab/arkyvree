/**
 * The level-up wizards' queries: the classes a character can add, a saved level, the edited level's slots, the plan's
 * preview, and the feat and spell pickers' lists, which Add Level and Edit Level both ask for at the level their picks
 * land on. Each builds the query its request sends once, and its key holds it: no parameter can be left out of it.
 */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { FOREVER } from "@/client/src/lib/durations.ts";
import { nextPage } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/**
 * A picker's level (a `StepLevel`), and what its list is checked against: the feats picked so far (`featPickString`),
 * and the planned levels before it, not saved yet (their class levels, ability increases and feat picks).
 */
export interface PickerLevel extends StepLevel {
  pendingAbilityIds?: string;
  pendingFeatPicks?: string;
  pendingKlassLevelIds?: string;
  selectedFeatPicks: string | undefined;
}

/**
 * The level a step is for, as the slot and picker endpoints take it: its class and level, which the query waits for,
 * and the saved level it edits.
 */
export interface StepLevel {
  characterLevelId?: string;
  classId: string | undefined;
  level: number | undefined;
}

/** The step's level as the endpoints' query, once its class and level are known. */
function levelQueryOf({ classId, level, characterLevelId }: StepLevel) {
  if (!classId || level === undefined) return undefined;
  return { classId, level: level.toString(), characterLevelId: characterLevelId || undefined };
}

/** The picks a picker's list is checked against, as the endpoints' query. */
function picksQueryOf(picker: PickerLevel) {
  return {
    selectedFeatPicks: picker.selectedFeatPicks || undefined,
    pendingLevelClassLevelIds: picker.pendingKlassLevelIds || undefined,
    pendingLevelFeatPicks: picker.pendingFeatPicks || undefined,
  };
}

/** Whether a saved level takes an ability increase, and the character's abilities at it. */
export function attributeSlotsQuery(characterId: string, characterLevelId: string) {
  const query = { characterLevelId };
  return queryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.attributes(characterId, query),
    queryFn: () =>
      parseResponse(
        rpc.api.characters.levels[":characterId"]["attribute-slots"].$get({ param: { characterId }, query }),
      ),
  });
}

/** The classes a character can add a level in, after the levels planned before it (not saved yet). */
export function availableClassesQuery(
  characterId: string,
  search: string,
  pendingKlassLevelIds?: string,
  pendingAbilityIds?: string,
  pendingFeatPicks?: string,
  pendingSkillAllocations?: string,
) {
  const query = {
    limit: "10",
    search: search || undefined,
    pendingLevelClassLevelIds: pendingKlassLevelIds || undefined,
    pendingLevelAbilityIds: pendingAbilityIds || undefined,
    pendingFeatPicks: pendingFeatPicks || undefined,
    pendingSkillAllocations: pendingSkillAllocations || undefined,
  };
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.availableClasses(characterId, query),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.characters.levels[":characterId"]["available-classes"].$get({
          param: { characterId },
          query: { ...query, page: pageParam.toString() },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** A feat family's variants a pool offers at the picker's level. */
export function availableFeatFamilyQuery(characterId: string, aptitudeId: string, family: string, picker: PickerLevel) {
  const level = levelQueryOf(picker);
  const query = level && {
    ...level,
    aptitudeId,
    family,
    limit: "50",
    ...picksQueryOf(picker),
    pendingLevelAbilityIds: picker.pendingAbilityIds || undefined,
  };
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.availableFeatFamily(characterId, query),
    queryFn: query
      ? ({ pageParam }) =>
          parseResponse(
            rpc.api.characters.levels[":characterId"]["available-feats"].$get({
              param: { characterId },
              query: { ...query, page: pageParam.toString() },
            }),
          )
      : skipToken,
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** The feats a pool offers at the picker's level, a family's variants grouped in one row; skipped until a pool is open. */
export function availableFeatsGroupedQuery(
  characterId: string,
  aptitudeId: string | null,
  search: string,
  picker: PickerLevel,
) {
  const level = levelQueryOf(picker);
  const query =
    aptitudeId && level
      ? {
          ...level,
          aptitudeId,
          limit: "20",
          search: search || undefined,
          ...picksQueryOf(picker),
          pendingLevelAbilityIds: picker.pendingAbilityIds || undefined,
        }
      : undefined;
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.availableFeatsGrouped(characterId, query),
    queryFn: query
      ? ({ pageParam }) =>
          parseResponse(
            rpc.api.characters.levels[":characterId"]["available-feats"].grouped.$get({
              param: { characterId },
              query: { ...query, page: pageParam.toString() },
            }),
          )
      : skipToken,
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** The spells a pool offers at the picker's level, of one spell level or all; skipped until a pool is picked. */
export function availablePowersQuery(
  characterId: string,
  aptitudeId: string | null,
  powerLevel: number | null,
  search: string,
  picker: PickerLevel,
) {
  const level = levelQueryOf(picker);
  const query =
    aptitudeId && level
      ? {
          ...level,
          aptitudeId,
          powerLevel: powerLevel?.toString(),
          limit: "20",
          search: search || undefined,
          ...picksQueryOf(picker),
        }
      : undefined;
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.availablePowers(characterId, query),
    queryFn: query
      ? ({ pageParam }) =>
          parseResponse(
            rpc.api.characters.levels[":characterId"]["available-powers"].$get({
              param: { characterId },
              query: { ...query, page: pageParam.toString() },
            }),
          )
      : skipToken,
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** A saved level, as Edit Level loads it; skipped while its id is missing. */
export function characterLevelQuery(characterId: string, characterLevelId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.levelData(characterId, characterLevelId),
    queryFn: characterLevelId
      ? () =>
          parseResponse(
            rpc.api.characters.levels[":characterId"][":characterLevelId"].$get({
              param: { characterId, characterLevelId },
            }),
          )
      : skipToken,
  });
}

/** The feat slots the step's level gives; skipped until its class is known. */
export function featSlotsQuery(characterId: string, step: StepLevel) {
  const query = levelQueryOf(step);
  return queryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.feats(characterId, query),
    queryFn: query
      ? () =>
          parseResponse(rpc.api.characters.levels[":characterId"]["feat-slots"].$get({ param: { characterId }, query }))
      : skipToken,
  });
}

/**
 * What a plan of new levels gives the character: their attributes, skills, feat and spell slots, level by level. It
 * holds for as long as the plan does.
 */
export function levelPreviewQuery(characterId: string, levels: { klassId: string; level: number }[]) {
  // Ability increases are applied client-side (the Add Level wizard's attribute and skill point memos). Sending nulls
  // keeps the response deterministic per plan: otherwise, a refetch for a new plan would send the current increases,
  // the server would apply the bump, and the client memo would count it twice.
  const body = { levels, abilityIds: levels.map(() => null) };
  return queryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.preview(characterId, body),
    queryFn: () =>
      parseResponse(rpc.api.characters.levels[":characterId"].preview.$post({ param: { characterId }, json: body })),
    staleTime: FOREVER,
  });
}

/** The spell slots the step's level gives; skipped until its class is known. */
export function powerSlotsQuery(characterId: string, step: StepLevel) {
  const query = levelQueryOf(step);
  return queryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.powers(characterId, query),
    queryFn: query
      ? () =>
          parseResponse(
            rpc.api.characters.levels[":characterId"]["power-slots"].$get({ param: { characterId }, query }),
          )
      : skipToken,
  });
}

/** The skill points the step's level gives, with its ability increase; skipped until its class is known. */
export function skillSlotsQuery(characterId: string, step: StepLevel, abilityId: string | null) {
  const level = levelQueryOf(step);
  const query = level && { ...level, abilityId: abilityId || undefined };
  return queryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.skills(characterId, query),
    queryFn: query
      ? () =>
          parseResponse(
            rpc.api.characters.levels[":characterId"]["skill-slots"].$get({ param: { characterId }, query }),
          )
      : skipToken,
  });
}
