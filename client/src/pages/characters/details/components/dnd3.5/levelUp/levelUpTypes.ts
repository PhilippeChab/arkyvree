/** The level-up endpoints' types, shared by the Add Level and Edit Level wizards and their steps. */
import type { InferResponseType } from "hono/client";

import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import type { RPC } from "@/client/src/services/rpc.ts";

type LevelsApi = RPC["api"]["characters"]["levels"][":characterId"];

/** A saved level, as Edit Level loads it. */
type LevelData = InferResponseType<LevelsApi[":characterLevelId"]["$get"], 200>;

/** A spell picked for the level, as a saved level lists it. */
type SelectedPower = LevelData["powers"][string][number];

export type BaseRules = NonNullable<CharacterDetail["baseRules"]>;

export type AttributesData = InferResponseType<LevelsApi["attribute-slots"]["$get"], 200>;
export type SkillsData = InferResponseType<LevelsApi["skill-slots"]["$get"], 200>;
export type FeatsData = InferResponseType<LevelsApi["feat-slots"]["$get"], 200>;
export type PowersData = InferResponseType<LevelsApi["power-slots"]["$get"], 200>;

export type AvailableKlass = InferResponseType<LevelsApi["available-classes"]["$get"], 200>["items"][number];
export type AvailablePower = InferResponseType<LevelsApi["available-powers"]["$get"], 200>["items"][number];
/** A planned level, as the Add Level preview lists it. */
export type PreviewLevelDetail = InferResponseType<LevelsApi["preview"]["$post"], 200>["levelDetails"][number];
/** A row of the feat picker: a feat, or a family of feat variants. */
export type GroupedFeatRow = InferResponseType<LevelsApi["available-feats"]["grouped"]["$get"], 200>["items"][number];

export type LeveledUpAttribute = AttributesData["attributes"];
export type AptitudePool = FeatsData["aptitudePools"][string];
export type PowerAptitudePool = PowersData["aptitudePools"][string];

/** A feat picked for the level, as a saved level lists it. */
export type SelectedFeat = LevelData["feats"][string][number];

/** A class picked for a level. */
export type SelectedKlass = Pick<AvailableKlass, "id" | "name" | "nextLevel" | "maxLevel" | "hd" | "eligible">;

/** The picks a level wizard collects. */
export interface LevelUpFormData {
  selectedClass: SelectedKlass | null;
  selectedHP: number | null;
  selectedAttribute: string | null;
  selectedFeats: Record<string, SelectedFeat[]>;
  selectedPowers: Record<string, SelectedPower[]>;
  skillPointAllocations: Record<string, number>;
}
