/**
 * 3.5's rows, as its storage declaration reads them (`StorageEngine.rowOf`, `characterLinkRowOf`, `pickRowOf`): its
 * kinds', which it declares into the view's registry (`ViewEntities`), and a character's build's. Its entities' links
 * of a role they hold many of are the view's (`ViewLink`, by role: a feat's `listedIn`, a class level's `grants`).
 */

import type { EntityRow, LinkRow } from "@/engine/core/view/index.ts";
import type { ItemLocation, SizeType } from "@/shared/enums.ts";
import type { Character } from "@/shared/relations.ts";
import type { Alignment, Gender } from "@/vocabulary/dnd3.5/identity.ts";

/** A pick's row: its level, and its timestamps. */
type PickRow = LinkRow & {
  characterLevelId: string;
};

declare module "@/engine/core/module/CharacterInputs.ts" {
  /** A 3.5 character's links' rows: its ability scores and its picked languages. */
  interface CharacterLinkTypes {
    abilities: CharacterAbility;
    languages: CharacterLanguage;
  }

  /** A 3.5 character's levels. */
  interface CharacterRowTypes {
    levels: CharacterLevel;
  }
}

declare module "@/engine/core/module/parts/characters/plans.ts" {
  /**
   * The columns of a 3.5 character's row its fields write: its alignment, gender and experience, which a new row
   * requires, and its details.
   */
  interface CharacterColumns
    extends
      Pick<Character, "alignment" | "gender" | "xp">,
      Partial<Pick<Character, "age" | "deity" | "description" | "height" | "weight">> {}

  /** The column of a 3.5 character's row its creation's pick writes: its race. */
  interface CreationColumns extends Pick<Character, "raceId"> {}
}

declare module "@/engine/core/view/rows.ts" {
  /** 3.5's owned kind: a class's levels. */
  interface OwnedEntities {
    class_levels: KlassLevel;
  }

  /** 3.5's kinds' rows, by table. */
  interface ViewEntities {
    abilities: RulesetAbility;
    aptitudes: Aptitude;
    class_levels: KlassLevel;
    classes: Klass;
    feats: Feat;
    items: Item;
    languages: Language;
    mechanics: Mechanic;
    races: Race;
    saves: RulesetSave;
    skills: Skill;
    spells: Spell;
  }
}

declare module "@/shared/relations.ts" {
  /** The columns of a 3.5 character's row its fields and its race hold: its identity, its experience and its race. */
  interface CharacterFields {
    age: number | null;
    alignment: Alignment;
    deity: string | null;
    gender: Gender;
    height: string | null;
    raceId: string;
    weight: string | null;
    xp: number;
  }
}

export type Aptitude = EntityRow;
/** A character's score in an ability. */
export type CharacterAbility = LinkRow & { abilityId: string; characterId: string; score: number };
/** A language a character speaks. */
export type CharacterLanguage = LinkRow & { characterId: string; languageId: string };
/** A character's level: an advancement in a class level, with the hit points it rolled. */
export type CharacterLevel = Pick<EntityRow, "createdAt" | "deletedAt" | "id" | "updatedAt"> & {
  characterId: string;
  hp: number;
  klassLevelId: string;
  position: number;
};
export type Feat = EntityRow & { generated: boolean; selectable: boolean; stackable: boolean };
export type Item = EntityRow & {
  costGp: string | null;
  isTemplate: boolean;
  slot: ItemLocation;
  sourceItemId: string | null;
  type: string | null;
  weight: string | null;
};
export type Klass = EntityRow & { hd: number; kind: string; parentId: string | null };
export type KlassLevel = Pick<EntityRow, "createdAt" | "deletedAt" | "id" | "updatedAt"> & {
  klassId: string;
  level: number;
};
export type Language = EntityRow & { type: string };
/** An ability increase a character's level took. */
export type LevelAbilityIncrease = PickRow & { abilityId: string; amount: number };
/** A feat a character's level took, from a pool (`aptitudeId`). */
export type LevelFeat = PickRow & { aptitudeId: string; featId: string; id: string };
/** The ranks a character's level put in a skill. */
export type LevelSkill = PickRow & { rank: number; skillId: string };
/** A spell a character's level took, from a pool (`aptitudeId`). */
export type LevelSpell = PickRow & { aptitudeId: string; spellId: string };
export type Mechanic = EntityRow;
export type Race = EntityRow & { baseSpeed: number; kind: string; parentId: string | null; size: SizeType };
export type RulesetAbility = EntityRow & { description: string };
export type RulesetSave = EntityRow & { abilityId: string };
export type Skill = EntityRow & { primaryAbilityId: string };
export type Spell = EntityRow & { saveEffect: string | null; saveId: string | null };
