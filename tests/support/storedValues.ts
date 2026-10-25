/** An owner's stored values, as a test writes them: what a codec reads. */

import type { StoredValues } from "@/engine/core/fields/index.ts";
import type { FieldValue } from "@/engine/core/module/index.ts";

/** An owner's stored values: each field's of `field=value` pairs, in their order, and its links by role. */
export function storedValues(pairs: [string, FieldValue][], links: Record<string, string> = {}): StoredValues {
  const fields: Record<string, FieldValue[]> = {};
  for (const [field, value] of pairs) (fields[field] ??= []).push(value);
  return { fields, links };
}
