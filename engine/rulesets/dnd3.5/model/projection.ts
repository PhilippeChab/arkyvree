import type { CharacterLevel, Feat, Modifier, Power, Property, Requirement, Skill } from "@/shared/relations.ts";

/** A feat a projection adds, picked or granted at one of its levels, with its customizations. */
type ProjectedFeat = Feat & {
  aptitudeId: string;
  characterLevelId: string;
  klassLevelFeatId?: string;
  klassLevelId: string;
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
};

/** A power a projection adds at one of its levels: its spell level and its save's name. */
type ProjectedPower = Power & {
  aptitudeId: string;
  characterLevelId: string;
  klassLevelId: string;
  powerLevel: number | null;
  saveName: string | null;
};

/** A skill's ranks a projection adds at one of its levels. */
type ProjectedSkill = Skill & {
  characterLevelId: string;
  klassLevelId: string;
  rank: number;
};

/**
 * What a level-up projects onto a character before it's saved (`build`'s `projectedData`): the levels it adds or edits
 * and those it leaves out, and the feats, powers and skill ranks picked or granted at them.
 */
export interface ProjectedCharacterData {
  characterLevels?: ProjectedCharacterLevel[];
  excludeCharacterLevelIds?: string[];
  feats?: ProjectedFeat[];
  givenFeats?: ProjectedFeat[];
  powers?: ProjectedPower[];
  skills?: ProjectedSkill[];
}

/**
 * A level a projection adds, as a saved one is but for its position: an edited level's stand-in takes the edited
 * level's, and a new level has none, the loader placing it after the saved levels in the order given.
 */
export type ProjectedCharacterLevel = Omit<CharacterLevel, "position"> & { position?: number };
