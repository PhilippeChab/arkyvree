/** What a name in a modifier's or a requirement's path means, before it's stored: where the name is, and what it names. */

/**
 * A name's meaning, as a save or a fill works it out: the entity it names (`entityId`, the original, never a ruleset's
 * copy of it) or a group that isn't an entity (a feat family, `entityId` null), of `entityType`, under the name it had
 * then.
 */
export interface NameBindingDraft extends NameBindingPlace {
  entityId: string | null;
  entityType: string;
  kind: "entity" | "group";
  name: string;
}

/** Where a name sits in a row: its target or its value, which of that field's paths (a formula reads several), which segment. */
export interface NameBindingPlace {
  field: "target" | "value";
  path: number;
  segment: number;
}
