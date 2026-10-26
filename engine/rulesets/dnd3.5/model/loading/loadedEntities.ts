/**
 * The entities a 3.5 character's load gives (`DetailedCharacterDataLoader`), each with its customizations, and what it
 * holds of them: its levels' feats, spells and skill points, each with where it comes from.
 */

import type { StoredAdvancement } from "@/engine/core/module/index.ts";
import type { ViewLink } from "@/engine/core/view/index.ts";
import type { RaceFieldValues } from "@/engine/rulesets/dnd3.5/entities/races/fields.ts";
import type { Feat, KlassLevel, Race, Skill, Spell } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

/**
 * A feat or a spell the character holds (`entity`), with its customizations: where it comes from (`HeldSource`), and
 * what the build makes of it. One the character holds without a level (`virtual`: a modifier's grant, a bonded
 * creature's stat block) has no advancement, track or grant, nor a pool but a spell's. One a modifier of the
 * character's gives is `given` once the modifier applies, whatever else holds it too.
 */
export interface HeldPick<E> extends HeldSource<E> {
  given: boolean;
  modifiers: Modifier[];
  requirements: Requirement[];
  virtual: boolean;
}

/**
 * Where a feat or a spell the character holds (`entity`) comes from: a pick of its step's (`step`, 3.5's `feats` or
 * `spells`), or a class level's grant (`grant`, its `grants` link), at a level (its advancement, and that advancement's
 * track: its class level), in a pool (`viaId`).
 */
export interface HeldSource<E> {
  advancementId?: string;
  entity: E;
  grant?: ViewLink;
  step: "feats" | "spells";
  trackId?: string;
  viaId?: string;
}

/**
 * The character's levels (its advancements), in the order it took them, the hit points each rolled (by its id), and
 * their class levels' ids (their tracks).
 */
export interface LoadedLevels {
  advancements: StoredAdvancement[];
  classLevelIds: string[];
  hitPoints: Map<string, number>;
}

/** A skill a level spends points on (`amount`, its `skills` pick's), at its advancement, whose track is its class level. */
export interface SkillPick {
  advancementId: string;
  amount: number;
  entity: Skill;
  trackId: string;
}

/** A class level as the character reads it, with its customizations: its fields its build reads off the view. */
export type CustomizedClassLevel = KlassLevel & {
  modifiers: Modifier[];
  requirements: Requirement[];
};

/** A race as the character reads it: its row, its fields' values, and its customizations. */
export type CustomizedRace = Race &
  RaceFieldValues & {
    modifiers: Modifier[];
    requirements: Requirement[];
  };

/** A feat the character holds: picked, granted by a class level, or possessed without a pick. */
export type HeldFeat = HeldPick<Feat>;

/**
 * A spell the character knows, in its pool (`viaId`, its list): at its spell level there, with its save's name and the
 * ability its DC comes from (`abilityDcName`), and whether it takes no room in its pool (`free`): a free grant's, one a
 * list makes known (`KnownSpells`) and a modifier's take none.
 */
export type HeldSpell = HeldPick<Spell> & {
  abilityDcName: string | null;
  free: boolean;
  saveName: string | null;
  spellLevel: number | null;
  viaId: string;
};
