import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

/** A requirement a write creates on an entity: what it asks of the character. */
type RequirementRow = Pick<Requirement, "level" | "operator" | "target" | "value" | "valueType">;

/**
 * A feat a ruleset makes with an entity (a skill's Skill Focus) or for a grouping its entities share (a school's Spell
 * Focus): generated, in the pool `aptitudeSlug` names, with its fields, modifiers and requirements. None is made when
 * the ruleset has no such pool.
 */
export interface GeneratedFeat<Fields = unknown> {
  aptitudeSlug: string;
  description: string;
  /** Its fields, which its properties store (`FeatsEffects.properties`) once it's made. */
  fields: Fields;
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
export interface GeneratedFeatsWrite<Fields = unknown> {
  feats: GeneratedFeat<Fields>[];
  unlessPresent?: string;
}

/** The properties an entity's fields are stored as: those of `types` it has give way to `rows`. */
export interface PropertiesWrite {
  entityId: string;
  entityType: PropertyEntityType;
  rows: { entityId: string; entityType: string; type: string; value: string }[];
  types: readonly string[];
}

/** A requirement a write creates on an entity (`entityId`, of `entityType`). */
export type RequirementWrite = RequirementRow & { entityId: string; entityType: PropertyEntityType };
