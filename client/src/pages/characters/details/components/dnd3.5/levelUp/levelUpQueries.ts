/**
 * The level-up wizards' queries: the classes a character can add, a saved level, the edited level's slots, the plan's
 * preview, and the feat and spell pickers' lists, which Add Level and Edit Level both ask for at the level their picks
 * land on. Each builds the query its request sends once, and its key holds it: no parameter can be left out of it. Their
 * responses' types are here too, which the wizards and their steps read.
 */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { FOREVER } from "@/client/src/lib/durations.ts";
import { nextPage } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { PlannedLevels } from "./pendingPicks.ts";

/** A saved level, as Edit Level loads it. */
type LevelData = InferResponseType<LevelsApi[":characterLevelId"]["$get"], 200>;

type LevelsApi = (typeof rpc.api.characters.levels)[":characterId"];

/**
 * What a picker's list is checked against, encoded by `pendingPicks.ts`: the planned levels before it, not saved yet
 * (their class levels and ability increases), and the feats picked so far.
 */
interface PlannedPicks extends Partial<PlannedLevels> {
  featPicks: string | undefined;
}

/** A feat pool of the level's slots. */
export type AptitudePool = FeatsData["aptitudePools"][string];

/** Whether a saved level takes an ability increase, and the character's abilities at it. */
export type AttributesData = InferResponseType<LevelsApi["ability-step"]["$get"], 200>;

export type AvailableKlass = InferResponseType<LevelsApi["available-classes"]["$get"], 200>["items"][number];

export type AvailablePower = InferResponseType<LevelsApi["available-powers"]["$get"], 200>["items"][number];

/** What the class picker's list is checked against: the planned picks, and the skill points spent over them. */
export interface ClassPicker extends PlannedPicks {
  skillRanks: string | undefined;
}

export type FeatsData = InferResponseType<LevelsApi["feat-step"]["$get"], 200>;

/** A row of the feat picker: a feat, or a family of feat variants. */
export type GroupedFeatRow = InferResponseType<LevelsApi["available-feats"]["grouped"]["$get"], 200>["items"][number];

/** The character's abilities at a level, by name: each with its score and modifier. */
export type LevelAbilities = AttributesData["attributes"];

/** A picker's level (a `StepLevel`), and what its list is checked against: the planned levels and the feats so far. */
export interface PickerLevel extends StepLevel, PlannedPicks {}

/** A spell pool of the level's slots. */
export type PowerAptitudePool = PowersData["aptitudePools"][string];

/** The spell picker's level (a `PickerLevel`), and the spells picked already, which it leaves out (`powerPickString`). */
export interface PowerPickerLevel extends PickerLevel {
  selectedPowerIds: string | undefined;
}

export type PowersData = InferResponseType<LevelsApi["power-step"]["$get"], 200>;

/** A planned level, as the Add Level preview lists it. */
export type PreviewLevelDetail = InferResponseType<LevelsApi["preview"]["$post"], 200>["levelDetails"][number];

/** A feat picked for the level, as a saved level lists it. */
export type SelectedFeat = LevelData["feats"][string][number];

/** A class picked for a level. */
export type SelectedKlass = Pick<AvailableKlass, "id" | "name" | "nextLevel" | "maxLevel" | "hd" | "eligible">;

/** A spell picked for the level, as a saved level lists it. */
export type SelectedPower = LevelData["powers"][string][number];

export type SkillsData = InferResponseType<LevelsApi["skill-step"]["$get"], 200>;

/**
 * The level a step is for, as the slot and picker endpoints take it: its class and level, which the query waits for,
 * and the saved level it edits.
 */
export interface StepLevel {
  classId: string | undefined;
  editedLevelId?: string;
  level: number | undefined;
}

/** The step's level as the endpoints' query, once its class and level are known. */
function levelQueryOf({ classId, level, editedLevelId }: StepLevel) {
  if (!classId || level === undefined) return undefined;
  return { classId, level: level.toString(), editedLevelId: editedLevelId || undefined };
}

/** What a picker's list is checked against, as the endpoints' query: the planned levels and the feats picked so far. */
function plannedQueryOf(picker: PlannedPicks) {
  return {
    featPicks: picker.featPicks || undefined,
    plannedAbilityIds: picker.plannedAbilityIds || undefined,
    plannedClassLevelIds: picker.plannedClassLevelIds || undefined,
  };
}

/** Whether a saved level takes an ability increase, and the character's abilities at it. */
export function abilityStepQuery(characterId: string, editedLevelId: string) {
  const query = { editedLevelId };
  return queryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.attributes(characterId, query),
    queryFn: () =>
      parseResponse(rpc.api.characters.levels[":characterId"]["ability-step"].$get({ param: { characterId }, query })),
  });
}

/** The classes a character can add a level in, after the levels planned before it and what they pick (not saved yet). */
export function availableClassesQuery(characterId: string, search: string, picker: ClassPicker) {
  const query = {
    limit: "10",
    search: search || undefined,
    ...plannedQueryOf(picker),
    skillRanks: picker.skillRanks || undefined,
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
    ...plannedQueryOf(picker),
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
          ...plannedQueryOf(picker),
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

/**
 * The spells a pool offers at the picker's level, of one spell level or all, but those picked already; skipped until a
 * pool is picked.
 */
export function availablePowersQuery(
  characterId: string,
  aptitudeId: string | null,
  powerLevel: number | null,
  search: string,
  picker: PowerPickerLevel,
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
          ...plannedQueryOf(picker),
          selectedPowerIds: picker.selectedPowerIds,
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
export function featStepQuery(characterId: string, step: StepLevel) {
  const query = levelQueryOf(step);
  return queryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.feats(characterId, query),
    queryFn: query
      ? () =>
          parseResponse(rpc.api.characters.levels[":characterId"]["feat-step"].$get({ param: { characterId }, query }))
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
export function powerStepQuery(characterId: string, step: StepLevel) {
  const query = levelQueryOf(step);
  return queryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.powers(characterId, query),
    queryFn: query
      ? () =>
          parseResponse(rpc.api.characters.levels[":characterId"]["power-step"].$get({ param: { characterId }, query }))
      : skipToken,
  });
}

/** The skill points the step's level gives, with its ability increase; skipped until its class is known. */
export function skillStepQuery(characterId: string, step: StepLevel, abilityId: string | null) {
  const level = levelQueryOf(step);
  const query = level && { ...level, abilityId: abilityId || undefined };
  return queryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.skills(characterId, query),
    queryFn: query
      ? () =>
          parseResponse(rpc.api.characters.levels[":characterId"]["skill-step"].$get({ param: { characterId }, query }))
      : skipToken,
  });
}
