/** What an update changed, as its activity records it. */

import type { ChangedField } from "@/shared/activity.ts";

/** The fields an activity records no values of, only that they changed. */
const LONG_TEXT_FIELDS = new Set(["description"]);

/** A field's value as an activity compares and records it: a number, or a string that holds one, as its number. */
function normalizeValue(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    if (Number.isFinite(number)) return String(number);
  }
  return String(value);
}

/**
 * What an update (`body`) changes of an entity (`existing`): each field it gives another value, with the value before
 * and after, but a long text field's, which only says it changed.
 */
export function getChangedFields(existing: object, body: object): ChangedField[] {
  const before = new Map(Object.entries(existing));
  const changes: ChangedField[] = [];
  for (const [field, after] of Object.entries(body)) {
    if (!before.has(field)) continue;
    const old = before.get(field);
    if (old == null && after == null) continue;
    if (normalizeValue(old) === normalizeValue(after)) continue;

    if (LONG_TEXT_FIELDS.has(field)) {
      changes.push({ field });
    } else {
      changes.push({
        field,
        from: old != null ? normalizeValue(old) : undefined,
        to: after != null ? normalizeValue(after) : undefined,
      });
    }
  }
  return changes;
}
