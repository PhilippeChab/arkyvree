/**
 * The level-up wizards' queries: the classes a character can add, a saved level, the steps a level has and each one by
 * its name, the plan's preview, and the feat and spell pickers' lists, which Add Level and Edit Level both ask for at the level their picks
 * land on. Each builds the query its request sends once, and its key holds it: no parameter can be left out of it. Their
 * responses' types are here too, which the wizards and their steps read.
 */

import { infiniteQueryOptions, queryOptions, skipToken } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import { FOREVER } from "@/client/src/lib/durations.ts";
import { nextPage } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { abilityIncreaseString, type PlannedLevels } from "./pendingPicks.ts";

/**
 * What a picker's list is checked against, encoded by `pendingPicks.ts`: the planned levels before it, not saved yet
 * (their class levels and ability increases), and the feats picked so far.
 */
interface PlannedPicks extends Partial<PlannedLevels> {
  featPicks: string | undefined;
}

type LevelsApi = (typeof rpc.api.characters.levels)[":characterId"];

/** A step of the level, by its name, as the ruleset describes it. */
type LevelStepData = InferResponseType<LevelsApi["level-steps"][":step"]["$get"], 200>;

/** A step named `N`, as the server describes it. */
type NamedStep<N extends StepName> = Extract<LevelStepData, { name: N }>;

/** A step's description as the steps read it: a step's without its name, or the same from the Add Level preview. */
type Unnamed<S> = S extends unknown ? Omit<S, "name"> : never;

/** What the class picker's list is checked against: the planned picks, and the skill points spent over them. */
export interface ClassPicker extends PlannedPicks {
  skillPoints: string | undefined;
}

/**
 * A picker's level (a `StepLevel`), and what its list is checked against: the levels planned before it and the feats
 * picked so far.
 */
export interface PickerLevel extends StepLevel, PlannedPicks {}

/** The spell picker's level (a `PickerLevel`), and the spells picked already, which it leaves out (`powerPickString`). */
export interface PowerPickerLevel extends PickerLevel {
  selectedPowerIds: string | undefined;
}

/**
 * The level a step is for, as the step and picker endpoints take it: its class and level, which the query waits for,
 * its ability increase, the saved level it edits, and the skill points spent at it so far (`skillPointString`); and,
 * for a step, the feats and powers picked at it (`pickPairString`), which it fits to their pools.
 */
export interface StepLevel {
  abilityId?: string;
  classId: string | undefined;
  editedLevelId?: string;
  level: number | undefined;
  picks?: { feats: string | undefined; powers: string | undefined };
  skillPoints?: string;
}

/** A feat pool of the level's slots. */
export type AptitudePool = FeatsData["aptitudePools"][string];

/** Whether a level takes an ability increase, and the character's abilities at it. */
export type AttributesData = Unnamed<NamedStep<"abilities">>;

export type AvailablePower = InferResponseType<LevelsApi["available-powers"]["$get"], 200>["items"][number];

export type FeatsData = Unnamed<NamedStep<"feats">>;

/** A row of the feat picker: a feat, or a family of feat variants. */
export type GroupedFeatRow = InferResponseType<LevelsApi["available-feats"]["grouped"]["$get"], 200>["items"][number];

/** The character's abilities at a level, by name: each with its score and modifier. */
export type LevelAbilities = AttributesData["attributes"];

/** A spell pool of the level's slots. */
export type PowerAptitudePool = PowersData["aptitudePools"][string];

export type PowersData = Unnamed<NamedStep<"powers">>;

/** A planned level, as the Add Level preview lists it. */
export type PreviewLevelDetail = InferResponseType<LevelsApi["preview"]["$post"], 200>["levelDetails"][number];

export type SkillsData = Unnamed<NamedStep<"skills">>;

/** The name of a step the ruleset lists for a level. */
export type StepName = LevelStepData["name"];

/** Whether the server's step is the one asked for, by its name. */
function isNamed<N extends StepName>(step: LevelStepData, name: N): step is NamedStep<N> {
  return step.name === name;
}

/** The step's level as the endpoints' query, once its class and level are known. */
function levelQueryOf({ abilityId, classId, level, editedLevelId, skillPoints }: StepLevel) {
  if (!classId || level === undefined) return undefined;
  return {
    classId,
    level: level.toString(),
    abilityIncreases: abilityIncreaseString(abilityId) || undefined,
    editedLevelId: editedLevelId || undefined,
    skillPoints: skillPoints || undefined,
  };
}

/** What a picker's list is checked against, as the endpoints' query: the planned levels and the feats picked so far. */
function plannedQueryOf(picker: PlannedPicks) {
  return {
    featPicks: picker.featPicks || undefined,
    plannedAbilityIncreases: picker.plannedAbilityIncreases || undefined,
    plannedClassLevelIds: picker.plannedClassLevelIds || undefined,
  };
}

/** The classes a character can add a level in, after the levels planned before it and what they pick (not saved yet). */
export function availableClassesQuery(characterId: string, search: string, picker: ClassPicker) {
  const query = {
    limit: "10",
    search: search || undefined,
    ...plannedQueryOf(picker),
    skillPoints: picker.skillPoints || undefined,
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

/**
 * What a plan of new levels gives the character, with their ability increases and what's picked over them so far (the
 * skill points by skill, in the form's order, and the feats and powers by pool, in theirs): their attributes, skills,
 * feat and spell pools (what of the picks fits, and each pool's room for them), level by level. It holds for as long as
 * the plan does.
 */
export function levelPreviewQuery(
  characterId: string,
  levels: { abilityIncreases: { abilityId: string; amount: number }[]; klassId: string; level: number }[],
  {
    feats,
    powers,
    skills,
  }: { feats: Record<string, string[]>; powers: Record<string, string[]>; skills: Record<string, number> },
) {
  const body = { levels, skills, feats, powers };
  return queryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.preview(characterId, body),
    queryFn: () =>
      parseResponse(rpc.api.characters.levels[":characterId"].preview.$post({ param: { characterId }, json: body })),
    staleTime: FOREVER,
  });
}

/**
 * A step of the step's level, by its name (`StepName`, as its ruleset lists it): an ability increase, the skill points or
 * the feat or spell pools it gives, with the picks at it fitted to them; skipped until its class is known.
 */
export function levelStepQuery<N extends StepName>(characterId: string, name: N, step: StepLevel) {
  const level = levelQueryOf(step);
  const query = level && { ...level, featPicks: step.picks?.feats, powerPicks: step.picks?.powers };
  return queryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.step(characterId, name, query),
    queryFn: query
      ? async () => {
          const data = await parseResponse(
            rpc.api.characters.levels[":characterId"]["level-steps"][":step"].$get({
              param: { characterId, step: name },
              query,
            }),
          );
          if (!isNamed(data, name)) throw new Error(`The server answered another step than ${name}`);
          return data;
        }
      : skipToken,
  });
}

/**
 * The steps the ruleset lists for the level a wizard adds, or for the saved level it edits (`editedLevelId`), in their
 * order: each its name and label. They hold for as long as the wizard does.
 */
export function levelStepsQuery(characterId: string, editedLevelId?: string) {
  const query = { editedLevelId };
  return queryOptions({
    queryKey: QUERY_KEYS.characters.levelUp.steps(characterId, query),
    queryFn: () =>
      parseResponse(rpc.api.characters.levels[":characterId"]["level-steps"].$get({ param: { characterId }, query })),
    staleTime: FOREVER,
  });
}
