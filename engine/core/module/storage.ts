/**
 * How a module stores its rulesets' and its characters' data in the generic tables, which hold every module's: an
 * entity's row (`rules.entities`), its fields (`rules.entity_fields`, one typed value a row, a set a row per value) and
 * its links (`rules.entity_links`, by role); a ruleset's settings (`rules.ruleset_fields`, `ruleset_links`); a
 * character's fields and links (`character.fields`, `links`) and its advancements and their picks
 * (`character.advancements`, `advancement_picks`). The registries those rows are checked against (`rules.entity_types`,
 * `field_defs`, `link_roles`, …) hold what each module declares here, and a module's rows read as its own shapes by
 * these declarations: its kinds' columns, its joins, its character's.
 */

/** Where a value is held: a field's typed column. */
export type ValueKind = "flag" | "number" | "text";

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

/** An entity kind's row: its columns past an entity's own (id, scope, name, description, timestamps), by their names. */
export interface StoredKind {
  columns: Record<string, StoredColumn>;
}

/** A link's parts, as a join's row names them. */
export type LinkPart = "amount" | "free" | "from" | "id" | "tier" | "to" | "via";

/** A join's rows: the links of a role from one kind to another, each part under its column's name. */
export interface StoredJoin {
  columns: Record<string, LinkPart>;
  from: string;
  role: string;
  to: string;
}

/** An entity type, and the type that owns its entities (a class level's class). */
export interface EntityTypeDef {
  ownerType: string | null;
  type: string;
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

/** A ruleset's single link of a role, to an entity of a type: what deleting it does. */
export interface RulesetRoleDef {
  onDelete: "refuse" | "unlink";
  role: string;
  toType: string;
}

/** A character's link of a role, to an entity of a type: whether it holds one, and what deleting it does. */
export interface CharacterRoleDef {
  entityType: string;
  onDelete: "delete" | "refuse";
  role: string;
  single: boolean;
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
 * A character's data, as the module's rows name it: its columns stored as fields or as a single link (its race), its
 * links of a role with an amount (its scores) or none (its languages), and its advancements' picks by step.
 */
export interface StoredCharacter {
  /** The character row's columns past its own, each a field or a single link's entity */
  columns: Record<string, { field: string; kind: "number" | "text" } | { kind: "link"; role: string }>;
  /** Each link role's rows: their entity's column and their amount's, if they hold one */
  links: Record<string, { amount?: string; entity: string; role: string }>;
  /** Each advancement's track (its class level), and its value step's amount (its hit points) */
  advancement: { track: string; value: { column: string; step: string } };
  /** Each pick step's rows: their entity's column, their pool's and their amount's */
  picks: Record<string, { amount?: string; entity: string; id?: true; step: string; via?: string }>;
}

/**
 * How a module stores its data: its registries' rows, its kinds' and joins' row shapes, its character's, and the
 * property types whose value names an entity, which are links (an entity's of a role, a ruleset's of a ruleset role).
 */
export interface StorageDeclaration {
  character: StoredCharacter;
  /** The property types a link holds: an entity type's, by its role; a ruleset's, by its ruleset role */
  linkedProperties: { entities: Record<string, Record<string, string>>; rulesets: Record<string, string> };
  joins: Record<string, StoredJoin>;
  kinds: Record<string, StoredKind>;
  registries: StorageRegistries;
}
