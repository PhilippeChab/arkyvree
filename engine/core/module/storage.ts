/**
 * How a module stores its rulesets' and its characters' data in the generic tables, which hold every module's: an
 * entity's row (`rules.entities`), its fields (`rules.entity_fields`, one typed value a row, a set a row per value) and
 * its links (`rules.entity_links`, by role); a ruleset's settings (`rules.ruleset_fields`, `ruleset_links`); a
 * character's fields and links (`character.fields`, `links`) and its advancements and their picks
 * (`character.advancements`, `advancement_picks`). The registries those rows are checked against (`rules.entity_types`,
 * `field_defs`, `link_roles`, …) hold what each module declares here, and a module's rows read as its own shapes by
 * these declarations: its kinds' columns, its character's. An entity's links of a role many of which it holds (a feat's
 * pools, a class level's grants) are read and written as links, by role.
 */

/** A character's link of a role, to an entity of a type: whether it holds one, and what deleting it does. */
export interface CharacterRoleDef {
  entityType: string;
  onDelete: "delete" | "refuse";
  role: string;
  single: boolean;
}

/** An entity type, and the type that owns its entities (a class level's class). */
export interface EntityTypeDef {
  /**
   * The kind that owns its entities (a class level's class), none for a kind no entity owns. An owned kind's row names
   * its owner (an `owner` column) and its position in it (a `position` column), by which its copies pair
   */
  ownerType: string | null;
  type: string;
}

/**
 * A field: its owner (an entity of a type, a ruleset, a character), its value's kind, whether it's a set (`multiple`),
 * how sibling copies merge it, and the role an entity follows to read it off another when it has none (`inheritsVia`:
 * an item's template).
 */
export interface FieldDef {
  field: string;
  inheritsVia: string | null;
  merge: Merge;
  multiple: boolean;
  ownerKind: "character" | "entity" | "ruleset";
  ownerType: string;
  valueKind: ValueKind;
}

/**
 * A link role, from a type to another: whether an entity holds one (`single`), what deleting its target or its via does
 * (`onDelete`, `viaOnDelete`: delete the linking entity, unlink, or refuse), the type of the pool it's taken through
 * (`viaType`), and how sibling copies merge it.
 */
export interface LinkRoleDef {
  fromType: string;
  merge: Merge;
  onDelete: "delete" | "refuse" | "unlink";
  role: string;
  single: boolean;
  toType: string;
  viaOnDelete: "refuse" | "unlink";
  viaType: string | null;
}

/** A ruleset's single link of a role, to an entity of a type: what deleting it does. */
export interface RulesetRoleDef {
  onDelete: "refuse" | "unlink";
  role: string;
  toType: string;
}

/**
 * An advancement's step: the type of the entity it picks (none for a value, hit points) and of the pool it's picked
 * through, what deleting its entity does, and whether one advancement picks an entity more than once (`repeats`).
 */
export interface StepDef {
  entityType: string | null;
  onDelete: "delete" | "refuse";
  repeats: boolean;
  step: string;
  viaType: string | null;
}

/** How a module stores its data: its registries' rows, its kinds' row shapes, and its character's. */
export interface StorageDeclaration {
  character: StoredCharacter;
  kinds: Record<string, StoredKind>;
  registries: StorageRegistries;
}

/** What the registries hold of a module: its entity types, link roles, fields, roles, steps and the types items are. */
export interface StorageRegistries {
  characterRoles: CharacterRoleDef[];
  entityTypes: EntityTypeDef[];
  fieldDefs: FieldDef[];
  itemTypes: string[];
  linkRoles: LinkRoleDef[];
  rulesetRoles: RulesetRoleDef[];
  steps: StepDef[];
}

/**
 * A character's advancement as stored (`character.advancements`): its track (3.5's class level), and where it stands
 * among the character's (`position`). What it picks are its picks, its value step's among them (3.5's hit points).
 */
export interface StoredAdvancement {
  characterId: string;
  createdAt: string;
  deletedAt: string | null;
  id: string;
  position: number;
  trackId: string | null;
  updatedAt: string;
}

/**
 * A character's data, as the module's rows name it: its columns stored as fields or as a single link (its race), and
 * its links of a role with an amount (its scores) or none (its languages).
 */
export interface StoredCharacter {
  /** The character row's columns past its own, each a field or a single link's entity */
  columns: Record<string, { field: string; kind: "number" | "text" } | { kind: "link"; role: string }>;
  /** Each link role's rows: their entity's column and their amount's, if they hold one */
  links: Record<string, { amount?: string; entity: string; role: string }>;
  /** The row's columns in the order its answers give them, when it isn't the character's own then `columns` */
  order?: string[];
}

/** A character's link of a role (`character.links`): its entity, and its amount if it holds one. */
export interface StoredCharacterLink {
  amount: number | null;
  characterId: string;
  createdAt: string;
  entityId: string;
  updatedAt: string;
}

/**
 * A character as the generic tables store it: its own columns (`character.characters`), and the values of its fields
 * (`character.fields`, as text) and the entities of its single links (`character.links`), which its row reads by its
 * module's declaration (`StorageEngine.characterRowOf`).
 */
export interface StoredCharacterRow extends Record<string, unknown> {
  fields: { field: string; value: FieldValue }[];
  links: { role: string; toId: string }[];
}

/**
 * What a write of a character's row stores (`StorageEngine.characterWriteOf`): its own columns it gives, and the fields
 * and single links of each column its module stores it gives, each value typed, or null to clear it.
 */
export interface StoredCharacterWrite {
  fields: { field: string; kind: "number" | "text"; value: FieldValue | null }[];
  links: { entityType: string; role: string; single: boolean; toId: string | null }[];
  own: Record<string, unknown>;
}

/**
 * An entity as the generic tables store it: its own columns (`rules.entities`), its fields' values (`entity_fields`,
 * a set's one a row) and its links (`entity_links`, from it, in their order), which its kind's row reads by its module's
 * declaration (`StorageEngine.rowOf`). Timestamps are Postgres's text.
 */
export interface StoredEntity {
  campaignId: string | null;
  createdAt: string;
  deletedAt: string | null;
  description: string | null;
  fields: StoredFieldValue[];
  id: string;
  links: StoredLink[];
  name: string | null;
  ownerId: string | null;
  partition: string;
  position: number | null;
  rulesetId: string;
  type: string;
  updatedAt: string;
}

/** A field's value as its row holds it, typed by its column: a text, a number or a flag. */
export interface StoredFieldValue {
  createdAt: string;
  field: string;
  ordinal: number;
  updatedAt: string;
  value: FieldValue;
}

/** An entity kind's row: its columns past an entity's own (id, scope, name, description, timestamps), by their names. */
export interface StoredKind {
  columns: Record<string, StoredColumn>;
  /**
   * Whether a user customizes its entities: their modifiers and requirements, on a page of their own or a tab of their
   * owner's (3.5's feats, items, spells, races, classes and class levels)
   */
  customizable?: true;
  /**
   * The role of the links its entities' page edits one at a time, on a tab of its own (3.5's class's `classSkill`): each
   * change an activity named for the role, which opens that tab
   */
  editedLinks?: string;
  /**
   * How its entities of one name in a ruleset's chain pair: always, a name its identity (`identity`: 3.5's pools), or,
   * when no copy pairs them, as a book's reprint (`reprints`: 3.5's feats and spells); none, never (a race or a class
   * of one name in two books is more likely two things)
   */
  namesakes?: "identity" | "reprints";
  /** The row's columns in the order its answers give them, when it isn't an entity's own then `columns` */
  order?: string[];
}

/** A link from an entity, of a role, to another entity (`toId`), through a pool (`viaId`), in its entity's order. */
export interface StoredLink {
  amount: number | null;
  createdAt: string;
  free: boolean;
  id: string;
  ordinal: number;
  role: string;
  tier: number | null;
  toId: string;
  toType: string;
  updatedAt: string;
  viaId: string | null;
}

/** An advancement's pick of a step (`character.advancement_picks`): its entity, its pool, its amount. */
export interface StoredPick {
  advancementId: string;
  amount: number | null;
  createdAt: string;
  entityId: string | null;
  id: string;
  updatedAt: string;
  viaId: string | null;
}

/** A ruleset's own settings as stored: its fields' values (`ruleset_fields`) and its links (`ruleset_links`). */
export interface StoredRuleset {
  fields: StoredFieldValue[];
  id: string;
  links: { createdAt: string; role: string; toId: string; updatedAt: string }[];
}

/**
 * What a write of a kind's row stores (`StorageEngine.writeOf`): its entity's own columns it gives (`own`: its id,
 * scope, name, description, timestamps, owner, position and partition), and the fields and single links it sets, each
 * value typed, or null to clear it.
 */
export interface StoredWrite {
  fields: { field: string; kind: ValueKind; value: FieldValue | null }[];
  links: { role: string; single: boolean; toId: string | null; toType: string }[];
  own: Partial<Omit<StoredEntity, "fields" | "links" | "type">>;
}

/** A stored field's value, as its typed column holds it. */
export type FieldValue = boolean | number | string;

/**
 * How sibling copies of an entity merge a field or a link: the winning copy's value or none (`winner`), the winning
 * copy's else the first sibling's (`fallback`), or every sibling's (`union`, a set's).
 */
export type Merge = "fallback" | "union" | "winner";

/**
 * A column an entity kind's row holds past an entity's own, and where it's stored. A field with a `default` is written
 * with it when a write leaves it out, and always holds a value.
 */
export type StoredColumn =
  /** A field's value: a flag, a number (an integer, or a decimal kept to `scale` places as text) or a text */
  | { default?: boolean; field: string; kind: "flag" }
  | { field: string; integer: true; kind: "number" }
  | { field: string; kind: "number"; scale: number }
  | { default?: string; field: string; kind: "text" }
  /** The entity a single-valued link of `role` points at: its id */
  | { kind: "link"; role: string }
  /** The entity's partition, which its name is unique within (a class's or a race's kind) */
  | { default: string; kind: "partition" }
  /** An owned entity's owner (a class level's class) */
  | { kind: "owner" }
  /** An owned entity's position in its owner (a class level's level) */
  | { kind: "position" };

/** Where a value is held: a field's typed column. */
export type ValueKind = "flag" | "number" | "text";
