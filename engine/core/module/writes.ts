import type { Modifier, Requirement } from "@/shared/relations.ts";

/**
 * A feat a ruleset makes with an entity (a skill's Skill Focus) or for a grouping its entities share (a school's Spell
 * Focus): generated, in the pool `aptitudeSlug` names, with the properties its fields are kept in, its modifiers and
 * its requirements. None is made when the ruleset has no such pool.
 */
interface GeneratedFeat {
  aptitudeSlug: string;
  description: string;
  modifiers: Pick<Modifier, "operator" | "target" | "value" | "valueType">[];
  name: string;
  properties: PropertyValue[];
  requirements: RequirementWrite[];
}

/** The properties an entity's fields are kept in: those of `types` it has give way to `values`. */
interface PropertiesWrite {
  types: readonly string[];
  values: PropertyValue[];
}

/** A requirement a save sets on the entity it saves, or a feat it makes has: what it asks of the character. */
type RequirementWrite = Pick<Requirement, "level" | "operator" | "target" | "value" | "valueType">;

/**
 * What saving a ruleset entity writes beside its row, as its ruleset's rules say: the columns they set on the row (an
 * item's slot, by its type), the properties its fields are kept in (none: those it has stay), a requirement on it, the
 * feats it removes (made with it under its old name) and those it makes. The server writes them on the entity it saves.
 */
export interface EntityWrites<Columns extends object = object> {
  columns: Columns;
  generatedFeats: GeneratedFeatsWrite[];
  properties?: PropertiesWrite;
  removedFeats: GeneratedFeatRemoval[];
  requirement?: RequirementWrite;
}

/** A generated feat a save removes from the ruleset, refused (`inUse`) while a character in it picked the feat. */
export interface GeneratedFeatRemoval {
  inUse: string;
  name: string;
}

/** The feats a save makes, unless the ruleset or its chain has a feat named `unlessPresent` already. */
export interface GeneratedFeatsWrite {
  feats: GeneratedFeat[];
  unlessPresent?: string;
}

/** A property a save keeps a field in: its type and value, on the entity it saves. */
export interface PropertyValue {
  type: string;
  value: string;
}
