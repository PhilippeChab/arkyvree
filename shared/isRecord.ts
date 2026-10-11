/** Narrows untyped data (JSON payloads, stored state) to an object whose keys can be read. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
