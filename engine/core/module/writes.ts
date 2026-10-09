import type { Modifier, Requirement } from "@/shared/relations.ts";

/** The properties an entity's fields are kept in: those of `types` it has give way to `values`. */
interface PropertiesWrite {
  types: readonly string[];
  values: PropertyValue[];
}

/** A requirement a save sets on an entity: what it asks of the character. */
type RequirementWrite = Pick<Requirement, "level" | "operator" | "target" | "value" | "valueType">;

/**
 * An entity a save removes with the one it saves (`type`, its table, and its `id`): refused (`inUse`) while a character
 * of the ruleset picked it.
 */
export interface EntityRemoval {
  id: string;
  inUse: string;
  type: string;
}

/**
 * What saving a ruleset entity writes beside its row, as its ruleset's rules say: the properties its fields are kept in
 * (none: those it has stay), a requirement on it, and the entities it makes and removes with it (`made`, `removed`).
 * The server writes each by its table.
 */
export interface EntityWrites {
  made?: MadeEntity[];
  properties?: PropertiesWrite;
  removed?: EntityRemoval[];
  requirement?: RequirementWrite;
}

/** A list an entity is linked to (`aptitudeId`), and its level on it (a power's spell level on a class's list). */
export interface ListLink {
  aptitudeId: string;
  level?: number | null;
}

/**
 * An entity a save makes with the one it saves, in the same ruleset: its table (`type`), its row's columns, the lists it's
 * linked to (`links`), and its modifiers, properties and requirements.
 */
export interface MadeEntity {
  columns: Record<string, unknown> & { description: string; name: string };
  links: ListLink[];
  modifiers: Pick<Modifier, "operator" | "target" | "value" | "valueType">[];
  properties: PropertyValue[];
  requirements: RequirementWrite[];
  type: string;
}

/** A property a save keeps a field in: its type and value, on the entity it saves. */
export interface PropertyValue {
  type: string;
  value: string;
}
