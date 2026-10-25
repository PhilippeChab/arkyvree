/**
 * How a module stores its rulesets' and its characters' data in the generic tables, which hold every module's: an
 * entity's row (`rules.entities`), its fields (`rules.entity_fields`, one typed value a row, a set a row per value) and
 * its links (`rules.entity_links`, by role); a ruleset's settings (`rules.ruleset_fields`, `ruleset_links`); a
 * character's fields and links (`character.fields`, `links`) and its advancements and their picks
 * (`character.advancements`, `advancement_picks`). The registries those rows are checked against (`rules.entity_types`,
 * `field_defs`, `link_roles`, …) hold what each module declares here. Every row is read and written as stored: an
 * entity as its own columns, its own fields by field and its single links by role (`EntityRecord`, `EntityWrite`), its
 * links of a role many of which it holds (a feat's pools, a class level's grants) as links, by role, and a character's
 * rows as its fields by field, its links by role, its advancements' picks by step.
 */

/** A character's link of a role, to an entity of a type: whether it holds one, and what deleting it does. */
export interface CharacterRoleDef {
  entityType: string;
  onDelete: "delete" | "refuse";
  role: string;
  single: boolean;
}

/**
 * An entity as the server reads and writes it: its own columns (`rules.entities`), its own fields' values by field
 * (`fields`: those its kind holds of its own, `StoredKind.fields`), typed as stored (a number a number), and its single
 * links' targets by role (`links`, but those its fields read, which its stored values hold). Timestamps are Postgres's
 * text.
 */
export interface EntityRecord {
  campaignId: string | null;
  createdAt: string;
  deletedAt: string | null;
  description: string | null;
  fields: Readonly<Record<string, FieldValue>>;
  id: string;
  links: Readonly<Record<string, string>>;
  name: string | null;
  ownerId: string | null;
  partition: string;
  position: number | null;
  rulesetId: string;
  type: string;
  updatedAt: string;
}

/** An entity type, and the type that owns its entities (a class level's class). */
export interface EntityTypeDef {
  /**
   * The kind that owns its entities (a class level's class), none for a kind no entity owns. An owned entity names its
   * owner (`ownerId`) and its position in it (`position`), by which its copies pair
   */
  ownerType: string | null;
  type: string;
}

/**
 * What a write of an entity stores (a create's, an edit's): the own columns it gives, and each own field's value and
 * each single link's target it sets, by field and by role (null clears one). A create leaves out what its kind
 * defaults (`StoredKind.fields`, `partition`), and an owned entity takes its owner's ruleset and campaign.
 */
export interface EntityWrite {
  campaignId?: string | null;
  createdAt?: string;
  deletedAt?: string | null;
  description?: string | null;
  fields?: Readonly<Record<string, FieldValue | null>>;
  id?: string;
  links?: Readonly<Record<string, string | null>>;
  name?: string;
  ownerId?: string;
  partition?: string;
  position?: number;
  rulesetId?: string;
  updatedAt?: string;
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

/** How a module stores its data: its registries' rows, its kinds' own fields and defaults, and its character's. */
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
 * A character's data past what the registries hold of it: which of its link roles hold an amount (`scoredRoles`: its
 * scores, 3.5's `score`), the others of a role it holds many of being picked (3.5's `speaks`). Its own values are its
 * fields (`field_defs` of owner type `characters`) and its single links (`character_roles`: 3.5's `race`).
 */
export interface StoredCharacter {
  scoredRoles: string[];
}

/** A character's link of a role it holds many of (`character.links`): its entity, and its amount if it holds one. */
export interface StoredCharacterLink {
  amount: number | null;
  characterId: string;
  createdAt: string;
  entityId: string;
  updatedAt: string;
}

/**
 * An entity as the generic tables store it, whole: its own columns (`rules.entities`), every field's values
 * (`entity_fields`, a set's one a row) and every link (`entity_links`, from it, in their order), which a ruleset's view
 * is read from (`Engine.copyOnWrite().buildRawData`). Timestamps are Postgres's text.
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

/**
 * An entity kind, past what the registries hold of it: whether a user customizes its entities, the links its page edits,
 * how its namesakes pair, its own fields and what a new entity defaults, and what makes one a template.
 */
export interface StoredKind {
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
   * The fields its entities hold of their own, past those its module's fields declare (which their stored values
   * keep): each a single value of its kind, its entity's own on every read (`EntityRecord.fields`: 3.5's class's
   * `CLASS_HD`), and the winning copy's of siblings; one with a `default` is written with it when a new entity's write
   * leaves it out
   */
  fields?: Readonly<Record<string, { default?: FieldValue; kind: ValueKind }>>;
  /**
   * How its entities of one name in a ruleset's chain pair: always, a name its identity (`identity`: 3.5's pools), or,
   * when no copy pairs them, as a book's reprint (`reprints`: 3.5's feats and spells); none, never (a race or a class
   * of one name in two books is more likely two things)
   */
  namesakes?: "identity" | "reprints";
  /** The partition a new entity's write takes when it gives none (3.5's class's and race's, `pc`): none, the empty one */
  partition?: string;
  /**
   * The flag of its own fields that makes one of its entities a template others are made from (3.5's item's
   * `ITEM_IS_TEMPLATE`), whose requirements its copies take as their template's (`RulesetData.itemRequirements`)
   */
  template?: string;
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

/** A stored field's value, as its typed column holds it. */
export type FieldValue = boolean | number | string;

/**
 * How sibling copies of an entity merge a field or a link: the winning copy's value or none (`winner`), the winning
 * copy's else the first sibling's (`fallback`), or every sibling's (`union`, a set's).
 */
export type Merge = "fallback" | "union" | "winner";

/** Where a value is held: a field's typed column. */
export type ValueKind = "flag" | "number" | "text";
