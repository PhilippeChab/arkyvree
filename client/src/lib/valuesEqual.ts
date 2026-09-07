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
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const arrB = b as unknown[];
    if (a.length !== arrB.length) return false;
    return a.every((v, i) => valuesEqual(v, arrB[i]));
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(objA), ...Object.keys(objB)]);
  for (const k of keys) {
    if (!valuesEqual(objA[k], objB[k])) return false;
  }
  return true;
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}
