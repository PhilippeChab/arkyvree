import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

import type {
  ClassFields,
  ClassLevelFields,
  FeatFields,
  ItemFields,
  PowerFields,
  RaceFields,
  RulesetFields,
  SkillFields,
} from "./rules.ts";

/** A requirement a write creates on an entity: what it asks of the character. */
type RequirementRow = Pick<Requirement, "level" | "operator" | "target" | "value" | "valueType">;

/** What a ruleset writes when a class is saved: its fields. */
export interface ClassesEffects {
  /** The class's fields, as the properties stored in place of those it stored before. */
  properties(klassId: string, fields: ClassFields): PropertiesWrite;
}

/** What a ruleset writes when a class level is saved: its fields, and what it requires of the class's earlier levels. */
export interface ClassLevelsEffects {
  /** What a level past the class's first requires of the class's earlier levels: none for its first. */
  previousLevelRequirement(klassLevel: { id: string; level: number }, className: string): RequirementWrite | undefined;
  /** The level's fields, as the properties stored in place of those it stored before. */
  properties(levelId: string, fields: ClassLevelFields): PropertiesWrite;
}

/** What a ruleset writes when a feat is saved: its fields. */
export interface FeatsEffects {
  /** The feat's fields, as the properties stored in place of those it stored before. */
  properties(featId: string, fields: FeatFields): PropertiesWrite;
}

/**
 * A feat a ruleset makes with an entity (a skill's Skill Focus) or for a grouping its entities share (a school's Spell
 * Focus): generated, in the pool `aptitudeSlug` names, with its fields, modifiers and requirements. None is made when
 * the ruleset has no such pool.
 */
export interface GeneratedFeat {
  aptitudeSlug: string;
  description: string;
  /** Its fields, which its properties store (`FeatsEffects.properties`) once it's made. */
  fields: FeatFields;
  modifiers: Pick<Modifier, "operator" | "target" | "value" | "valueType">[];
  name: string;
  requirements: RequirementRow[];
}

/** A generated feat a write removes from the ruleset, refused (`inUse`) while a character in it picked the feat. */
export interface GeneratedFeatRemoval {
  inUse: string;
  name: string;
}

/** The feats a write makes, unless the ruleset or its chain has a feat named `unlessPresent` already. */
export interface GeneratedFeatsWrite {
  feats: GeneratedFeat[];
  unlessPresent?: string;
}

/** What a ruleset writes when an item is saved: its fields. */
export interface ItemsEffects {
  /**
   * Exactly the item's fields given, as its own properties, in place of those it stored before: for an item made from a
   * template, the fields it overrides, which its template's fill in when read (`RulesetData.itemProperties`). A list
   * can't be overridden to none: an item without damage types or magic auras of its own reads its template's.
   */
  properties(itemId: string, fields: ItemFields): PropertiesWrite;
}

/**
 * What a ruleset writes, one set of effects per area: each says what to write, and the service writes it in its
 * transaction (`server/services/rulesets/effectWrites.ts`).
 */
export interface ModuleEffects {
  classes: ClassesEffects;
  classLevels: ClassLevelsEffects;
  feats: FeatsEffects;
  items: ItemsEffects;
  powers: PowersEffects;
  races: RacesEffects;
  rulesets: RulesetsEffects;
  skills: SkillsEffects;
}

/** What a ruleset writes when a power is saved: its fields, and the feats of its grouping. */
export interface PowersEffects {
  /**
   * The feats a grouping (a spell's school) brings, unless the ruleset or its chain has them. Every power of the
   * grouping shares them, so none goes with a power.
   */
  generatedFeats(grouping: string): GeneratedFeatsWrite;
  /** The power's fields, as the properties stored in place of those it stored before; its other properties stay. */
  properties(powerId: string, fields: PowerFields): PropertiesWrite;
}

/** The properties an entity's fields are stored as: those of `types` it has give way to `rows`. */
export interface PropertiesWrite {
  entityId: string;
  entityType: PropertyEntityType;
  rows: { entityId: string; entityType: string; type: string; value: string }[];
  types: readonly string[];
}

/** What a ruleset writes when a race is saved: its fields. */
export interface RacesEffects {
  /** The race's fields, as the properties stored in place of those it stored before. */
  properties(raceId: string, fields: RaceFields): PropertiesWrite;
}

/** A requirement a write creates on an entity (`entityId`, of `entityType`). */
export type RequirementWrite = RequirementRow & { entityId: string; entityType: PropertyEntityType };

/** What a ruleset writes when its own fields are saved. */
export interface RulesetsEffects {
  /** The ruleset's own fields, as the properties stored in place of those it stored before. */
  properties(rulesetId: string, fields: RulesetFields): PropertiesWrite;
}

/** What a ruleset writes when a skill is saved or deleted: its fields, and the feat that's the skill's own. */
export interface SkillsEffects {
  /** The feat that's the skill's own (its Skill Focus), made with the skill. */
  generatedFeats(skillName: string): GeneratedFeatsWrite;
  /** The skill's fields, as the properties stored in place of those it stored before. */
  properties(skillId: string, fields: SkillFields): PropertiesWrite;
  /** The skill's own feat, removed with the skill (or its old name), unless a character picked it. */
  removedFeat(skillName: string): GeneratedFeatRemoval;
}
