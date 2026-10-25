/** An owner's stored values, as a test writes them: what a codec reads, and what an owner's rows hold. */

import type { StoredValues } from "@/engine/core/fields/index.ts";
import type { FieldValue } from "@/engine/core/module/index.ts";
import { db } from "@/server/database/index.ts";
import { Fields } from "@/server/repositories/index.ts";

/** An owner's stored values as a sorted list of `field=value`, and of `role=entity` for its links: a multiset. */
export function listStoredValues({ fields, links }: StoredValues): string[] {
  return [
    ...Object.entries(fields).flatMap(([field, values]) => values.map((value) => `${field}=${value}`)),
    ...Object.entries(links).map(([role, toId]) => `${role}=${toId}`),
  ].toSorted();
}

/** An owner's stored values: each field's of `field=value` pairs, in their order, and its links by role. */
export function storedValues(pairs: [string, FieldValue][], links: Record<string, string> = {}): StoredValues {
  const fields: Record<string, FieldValue[]> = {};
  for (const [field, value] of pairs) (fields[field] ??= []).push(value);
  return { fields, links };
}

/** An owner's stored values (`type`, `id`), as its rows hold them: none when it holds none. */
export async function findStoredValues(type: string, id: string): Promise<StoredValues> {
  return (await Fields.findMany(db, { ownerIds: [id], ownerType: type })).get(id)!;
}

/**
 * Writes an owner's stored values (`type`, `id`), as a save does: each field of `field=value` pairs, its values in
 * their order, and each link of `links` (null: none), replacing the owner's.
 */
export async function writeStoredValues(
  type: string,
  id: string,
  pairs: [string, FieldValue][],
  links: Record<string, string | null> = {},
) {
  await Fields.update(db, [{ id, type, values: { ...storedValues(pairs), links } }]);
}
