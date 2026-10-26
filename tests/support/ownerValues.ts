/**
 * An owner's fields' values and links, as a test writes and reads them: what a codec reads (`heldValues`), those its
 * form writes as its rows hold them (`findFormValues`: not a column's nor a hidden one, and the links its references
 * read), and a write of fields' values (`writeFieldValues`).
 */

import { Field, type Fields, type FieldsWrite, OwnerValues, type StoredValues } from "@/engine/core/fields/index.ts";
import type { FieldValue } from "@/engine/core/module/index.ts";
import type { RulesetData, ViewKinds } from "@/engine/core/view/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, RulesetSettings } from "@/server/repositories/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** An owner's values as a test holds them: each field's values in their stored order, and its links by role. */
export interface HeldValues {
  fields: Record<string, FieldValue[]>;
  links: Record<string, string>;
}

/**
 * The fields an owner's form writes (`type`'s: not a column's nor a hidden one), and the roles its references read:
 * none for a kind that holds no field (an ability, a save).
 */
function formWritten(type: string) {
  const spec: Fields = ENTITY_FIELDS[type as keyof typeof ENTITY_FIELDS] ?? {};
  return {
    fields: Field.storedLeavesOf(spec)
      .filter((leaf) => !leaf.form)
      .map((leaf) => leaf.field),
    roles: Field.leavesOf(spec).flatMap((leaf) => (leaf.kind === "ref" ? [leaf.role] : [])),
  };
}

/** An owner's values: each field's of `field=value` pairs, in their order, and its links by role. */
export function heldValues(pairs: [string, FieldValue][], links: Record<string, string> = {}): HeldValues {
  const fields: Record<string, FieldValue[]> = {};
  for (const [field, value] of pairs) (fields[field] ??= []).push(value);
  return { fields, links };
}

/** An owner's values as a sorted list of `field=value`, and of `role=entity` for its links: a multiset. */
export function listValues({ fields, links }: StoredValues): string[] {
  return [
    ...Object.entries(fields).flatMap(([field, values]) =>
      (Array.isArray(values) ? values : [values]).map((value) => `${field}=${value}`),
    ),
    ...Object.entries(links).map(([role, toId]) => `${role}=${toId}`),
  ].toSorted();
}

/**
 * An entity's values as its ruleset's view composes them (`id`, of any kind that holds fields): each field's values in
 * their order, and its single links by role. None for an entity the view hasn't.
 */
export function viewValuesOf(data: RulesetData, id: string): HeldValues {
  const types = Object.keys(ENTITY_FIELDS).filter((type) => type !== "rulesets") as (keyof ViewKinds)[];
  const entity = types.map((type) => data.find(type, id)).find((found) => found);
  if (!entity) return { fields: {}, links: {} };
  return {
    fields: Object.fromEntries(
      Object.keys(entity.fields).map((field) => [field, [...OwnerValues.valuesOf(entity.fields, field)]]),
    ),
    links: Object.fromEntries(Object.entries(entity.links).flatMap(([role, toId]) => (toId ? [[role, toId]] : []))),
  };
}

/** A write's values as its owner holds them once written (a codec's): each field it gives values, each link it sets. */
export function writtenValues({ fields, links }: FieldsWrite): HeldValues {
  return {
    fields: Object.fromEntries(
      Object.entries(fields).flatMap(([field, values]) => (values.length ? [[field, [...values]]] : [])),
    ),
    links: Object.fromEntries(Object.entries(links).flatMap(([role, toId]) => (toId ? [[role, toId]] : []))),
  };
}

/**
 * The values an owner's form writes (`type`, `id`), as its rows hold them: its form's fields' (in their stored order)
 * and its references' links, not a column's nor a hidden one's. None when it holds none.
 */
export async function findFormValues(type: string, id: string): Promise<HeldValues> {
  const [stored] =
    type === "rulesets"
      ? await RulesetSettings.findMany(db, { ids: [id] })
      : await Entities.findStored(db, { ids: [id] });
  const { fields, roles } = formWritten(type);
  const held: HeldValues = { fields: {}, links: {} };
  for (const row of (stored?.fields ?? []).toSorted((a, b) => a.ordinal - b.ordinal))
    if (fields.includes(row.field)) (held.fields[row.field] ??= []).push(row.value);
  for (const link of stored?.links ?? []) if (roles.includes(link.role)) held.links[link.role] = link.toId;
  return held;
}

/**
 * Writes an owner's fields' values (`type`, `id`), as a save does: each field of `field=value` pairs, its values in
 * their order, replacing the owner's of it, and each link of `links` (null: none). An entity keeps its last save's time.
 */
export async function writeFieldValues(
  type: string,
  id: string,
  pairs: [string, FieldValue][],
  links: Record<string, string | null> = {},
) {
  await writeValues(type, id, { fields: heldValues(pairs).fields, links });
}

/**
 * Writes an owner's values (`type`, `id`) as a write gives them (`write`, a codec's): each field and link it names,
 * replacing the owner's, the others kept. An entity keeps its last save's time.
 */
export async function writeValues(type: string, id: string, write: FieldsWrite) {
  if (type === "rulesets") {
    await RulesetSettings.update(db, [{ id, write }]);
    return;
  }
  const [entity] = await Entities.findStored(db, { ids: [id] });
  await Entities.update(db, type, { ...write, updatedAt: entity!.updatedAt }, { id });
}
