import { isRecord } from "@/shared/isRecord.ts";

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

/**
 * Deep equality for plain values, with form-friendly normalization:
 * `undefined`, `null`, and `""` are treated as equivalent. Used by
 * `FormDialog` to compare current form state against defaults — RHF
 * leaves unset fields `undefined` in defaults but renders them as `""`
 * once registered, and we don't want that mismatch to flag the form
 * as dirty on a fresh open.
 */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (isBlank(a) && isBlank(b)) return true;
  if (a == null && typeof b === "object") return valuesEqual({}, b);
  if (b == null && typeof a === "object") return valuesEqual(a, {});
  if (Array.isArray(a) || Array.isArray(b))
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => valuesEqual(v, b[i]));

  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (!valuesEqual(a[k], b[k])) return false;

  return true;
}
