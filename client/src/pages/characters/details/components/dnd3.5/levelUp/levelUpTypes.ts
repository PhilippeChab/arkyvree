/** The level-up endpoints' types, shared by the Add Level and Edit Level wizards and their steps. */

import type { InferResponseType } from "hono/client";

import type { rpc } from "@/client/src/services/rpc.ts";

/** A saved level, as Edit Level loads it. */
type LevelData = InferResponseType<LevelsApi[":characterLevelId"]["$get"], 200>;

type LevelsApi = (typeof rpc.api.characters.levels)[":characterId"];

/** A spell picked for the level, as a saved level lists it. */
type SelectedPower = LevelData["powers"][string][number];

export type AptitudePool = FeatsData["aptitudePools"][string];

export type AttributesData = InferResponseType<LevelsApi["attribute-slots"]["$get"], 200>;
export type AvailableKlass = InferResponseType<LevelsApi["available-classes"]["$get"], 200>["items"][number];
export type AvailablePower = InferResponseType<LevelsApi["available-powers"]["$get"], 200>["items"][number];

export type FeatsData = InferResponseType<LevelsApi["feat-slots"]["$get"], 200>;
/** A row of the feat picker: a feat, or a family of feat variants. */
export type GroupedFeatRow = InferResponseType<LevelsApi["available-feats"]["grouped"]["$get"], 200>["items"][number];
export type LeveledUpAttribute = AttributesData["attributes"];
/** The picks a level wizard collects. */
export interface LevelUpFormData {
  selectedAttribute: string | null;
  selectedClass: SelectedKlass | null;
  selectedFeats: Record<string, SelectedFeat[]>;
  selectedHP: number | null;
  selectedPowers: Record<string, SelectedPower[]>;
  skillPointAllocations: Record<string, number>;
}

export type PowerAptitudePool = PowersData["aptitudePools"][string];
export type PowersData = InferResponseType<LevelsApi["power-slots"]["$get"], 200>;
/** A planned level, as the Add Level preview lists it. */
export type PreviewLevelDetail = InferResponseType<LevelsApi["preview"]["$post"], 200>["levelDetails"][number];

/** A feat picked for the level, as a saved level lists it. */
export type SelectedFeat = LevelData["feats"][string][number];

/** A class picked for a level. */
export type SelectedKlass = Pick<AvailableKlass, "id" | "name" | "nextLevel" | "maxLevel" | "hd" | "eligible">;

export type SkillsData = InferResponseType<LevelsApi["skill-slots"]["$get"], 200>;
