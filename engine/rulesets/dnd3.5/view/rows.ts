/**
 * 3.5's rows, as its storage declaration reads them (`StorageEngine.rowOf`, `joinRowsOf`, `characterLinkRowOf`,
 * `pickRowOf`): its kinds' and joins', which it declares into the view's registries (`ViewEntities`, `ViewJoins`), and
 * a character's build's.
 */

import type { EntityRow, LinkRow } from "@/engine/core/view/index.ts";
import type { ItemLocation, SizeType } from "@/shared/enums.ts";
import type { Character } from "@/shared/relations.ts";

type FeatAptitude = LinkRow & { aptitudeId: string; featId: string };

/** A pick's row: its level, and its timestamps. */
type PickRow = LinkRow & {
  characterLevelId: string;
};

type PowerAptitude = LinkRow & { aptitudeId: string; level: number | null; powerId: string };

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
    klass_levels: KlassLevel;
  }

  /** 3.5's kinds' rows, by table. */
  interface ViewEntities {
    abilities: RulesetAbility;
    aptitudes: Aptitude;
    feats: FeatWithAptitudes;
    items: Item;
    klass_levels: KlassLevel;
    klasses: Klass;
    languages: Language;
    mechanics: Mechanic;
    powers: PowerWithAptitudes;
    races: Race;
    saves: RulesetSave;
    skills: Skill;
  }

  /** 3.5's joins' rows, by name: those its kinds' lists don't nest. */
  interface ViewJoins {
    klass_level_feats: KlassLevelFeat;
    klass_level_powers: KlassLevelPower;
    klass_level_saves: KlassLevelSave;
    klass_skills: KlassSkill;
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
export type FeatWithAptitudes = Feat & {
  featsAptitudesInRules: (FeatAptitude & { aptitudesInRule: Aptitude })[];
};
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
export type KlassLevelFeat = LinkRow & {
  aptitudeId: string;
  featId: string;
  free: boolean;
  id: string;
  klassLevelId: string;
};
export type KlassLevelPower = LinkRow & { aptitudeId: string; free: boolean; klassLevelId: string; powerId: string };
export type KlassLevelSave = LinkRow & { base: number; klassLevelId: string; saveId: string };
export type KlassSkill = LinkRow & { klassId: string; skillId: string };
export type Language = EntityRow & { type: string };
/** An ability increase a character's level took. */
export type LevelAbilityIncrease = PickRow & { abilityId: string; amount: number };
/** A feat a character's level took, from a pool (`aptitudeId`). */
export type LevelFeat = PickRow & { aptitudeId: string; featId: string; id: string };
/** A spell a character's level took, from a pool (`aptitudeId`). */
export type LevelPower = PickRow & { aptitudeId: string; powerId: string };
/** The ranks a character's level put in a skill. */
export type LevelSkill = PickRow & { rank: number; skillId: string };
export type Mechanic = EntityRow;
export type Power = EntityRow & { saveEffect: string | null; saveId: string | null };
export type PowerWithAptitudes = Power & {
  powersAptitudesInRules: (PowerAptitude & { aptitudesInRule: Aptitude })[];
};
export type Race = EntityRow & { baseSpeed: number; kind: string; parentId: string | null; size: SizeType };
export type RulesetAbility = EntityRow & { description: string };
export type RulesetSave = EntityRow & { abilityId: string };
export type Skill = EntityRow & { primaryAbilityId: string };
