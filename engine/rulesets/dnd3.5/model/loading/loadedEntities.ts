/** The entities a 3.5 character's load gives (`DetailedCharacterDataLoader`), each with its customizations. */

import type { RaceFieldValues } from "@/engine/rulesets/dnd3.5/entities/races/fields.ts";
import type { CharacterLevel, Feat, KlassLevel, Race, Spell } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import type { Modifier, Property, Requirement } from "@/shared/relations.ts";

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
 * modifier, added as it applies in the build's rounds. Virtual entries carry
 * `virtual: true` and use empty-string keys for klass/character/aptitude IDs so
 * existing per-level lookups (which key by characterLevelId) skip them
 * naturally without a flag check. A feat such a modifier gives carries
 * `given: true` once it applies, a pick or a grant holding it too or not.
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

/** A race as the character reads it: its row, the fields its properties hold, and its customizations. */
export type CustomizedRace = Race &
  RaceFieldValues & {
    modifiers: Modifier[];
    properties: Property[];
    requirements: Requirement[];
  };

/**
 * Same shape rule as CustomizedFeat. `virtual: true` spells are the ones granted
 * by `set spells.<slug>.<apt>.known = true` modifiers, added as they apply in
 * the build's rounds; their klass/character level IDs are empty strings so
 * per-level scans skip them. Pool accounting relies on `virtual` (or `free`,
 * for class-granted spells). A spell such a modifier makes known on its list
 * carries `given: true` there once it applies, a pick or a grant holding it
 * too or not.
 */
export type CustomizedSpell = Spell & {
  /** The ability its DC comes from: its class's bonus spell ability, a granted spell's its list's (`withDcAbilities`). */
  abilityDcName: string | null;
  aptitudeId: string;
  characterLevelId: string;
  free?: boolean;
  given?: boolean;
  klassLevelId: string;
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
  saveName: string | null;
  spellLevel: number | null;
  virtual?: boolean;
};

/** A feat a level picks or its class level grants, before its customizations (`toCustomizedFeats`). */
export type HeldFeat = Omit<CustomizedFeat, "modifiers" | "properties" | "requirements">;

/** A spell a level picks or its class level grants, before its customizations and its DC (`toCustomizedSpells`). */
export type HeldSpell = Omit<CustomizedSpell, "abilityDcName" | "modifiers" | "properties" | "requirements">;
