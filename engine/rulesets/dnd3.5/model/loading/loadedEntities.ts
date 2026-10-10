/** The entities a 3.5 character's load gives (`DetailedCharacterDataLoader`), each with its customizations. */

import type { RaceFieldValues } from "@/engine/rulesets/dnd3.5/entities/races/fields.ts";
import type {
  CharacterLevel,
  Feat,
  KlassLevel,
  Modifier,
  Power,
  Property,
  Race,
  Requirement,
} from "@/shared/relations.ts";

/** The character's levels, in the order it took them, and their class levels' ids. */
export interface CharacterLevels {
  characterLevels: CharacterLevel[];
  klassLevelIds: string[];
}

export type CustomizedClassLevel = KlassLevel & {
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
};

/**
 * Feats live in one merged list whether they were picked, granted by a klass
 * level, or virtually possessed via a `set feats.<slug>.possessed = true`
 * modifier. Virtual entries carry `virtual: true` and use empty-string keys
 * for klass/character/aptitude IDs so existing per-level lookups (which key
 * by characterLevelId) skip them naturally without a flag check. A feat such a
 * modifier gives carries `given: true`, a pick or a grant holding it too or not.
 */
export type CustomizedFeat = Feat & {
  aptitudeId: string;
  characterLevelId: string;
  given?: boolean;
  klassLevelFeatId?: string;
  klassLevelId: string;
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
  virtual?: boolean;
};

/**
 * Same shape rule as CustomizedFeat. `virtual: true` powers are spells granted
 * by `set powers.<slug>.<apt>.known = true` modifiers; their klass/character
 * level IDs are empty strings so per-level scans skip them. Pool accounting
 * relies on `virtual` (or `free`, for klass-granted powers). A spell such a
 * modifier makes known on its list carries `given: true` there, a pick or a
 * grant holding it too or not.
 */
export type CustomizedPower = Power & {
  /** The ability its DC comes from: its class's bonus spell ability, a granted spell's its list's (`withDcAbilities`). */
  abilityDcName: string | null;
  aptitudeId: string;
  characterLevelId: string;
  free?: boolean;
  given?: boolean;
  klassLevelId: string;
  modifiers: Modifier[];
  powerLevel: number | null;
  properties: Property[];
  requirements: Requirement[];
  saveName: string | null;
  virtual?: boolean;
};

/** A race as the character reads it: its row, the fields its properties hold, and its customizations. */
export type CustomizedRace = Race &
  RaceFieldValues & {
    modifiers: Modifier[];
    properties: Property[];
    requirements: Requirement[];
  };

/** A feat a level picks or its class level grants, before its customizations (`toCustomizedFeats`). */
export type HeldFeat = Omit<CustomizedFeat, "modifiers" | "properties" | "requirements">;

/** A power a level picks or its class level grants, before its customizations and its DC (`toCustomizedPowers`). */
export type HeldPower = Omit<CustomizedPower, "abilityDcName" | "modifiers" | "properties" | "requirements">;
